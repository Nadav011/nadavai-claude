#!/usr/bin/env node
// OTA publisher for the native shells (planning/native-apps-2026-11-06/OTA.md).
//
//   node scripts/native/ota-publish.mjs publish  <app> <android|ios> [--skip-build (staging only)] [--allow-dirty]
//   node scripts/native/ota-publish.mjs status   <app>
//   node scripts/native/ota-publish.mjs rollback <app> <android|ios> <bundleId|reset> [--runtime runtime-<fp12>]
//   node scripts/native/ota-publish.mjs min      <app> <android|ios> <build> [--message "<text>"]
//
// Bucket: R2_BUCKET (default nadavai-app-updates-staging). The production bucket also needs
// --production. S3 credentials: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// (~/.claude/secrets/r2-ota.env). Signing key: OTA_SIGNING_KEY (a PEM path), else
// ${OTA_KEY_DIR:-~/.claude/secrets}/ota-<app>.pem. Every signature is checked against the tracked
// public key native/keys/<app>.pub.pem before anything is written, so a wrong key cannot publish.
//
// Order on publish: build, zip (deterministic), sign the zip, upload it (immutable), and only then
// write the signed manifest with seq = previous + 1, conditional on the manifest it read (If-Match),
// so two publishers cannot both take the same seq.
import { createHash, createPrivateKey, createPublicKey, sign as rsaSign, verify as rsaVerify } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { crc32, deflateRawSync } from 'node:zlib';
import { appEntry, computeFingerprint, loadRegistry, PLATFORMS, REPO_ROOT } from './fingerprint.mjs';

export const STAGING_BUCKET = 'nadavai-app-updates-staging';
export const PRODUCTION_BUCKET = 'nadavai-app-updates';
export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const NO_CACHE = 'no-cache';
export const SIGNED_JSON_ALG = 'rsa-pkcs1-sha256';
/** The salon profile the store apps ship (scripts/verify-salon-client.ts compares against it too). */
export const SALON_PROFILE = '.appstore/salon.json';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// ── Deterministic zip ──────────────────────────────────────────────────────────────────────
// Same files, same bytes: sorted names, a fixed 1980-01-01 timestamp, no extra fields, no
// permissions. Directory entries are included so every unzipper recreates the tree.
function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full).split(sep).join('/');
    if (statSync(full).isDirectory()) {
      out.push({ name: `${rel}/`, data: Buffer.alloc(0), dir: true });
      walk(full, base, out);
    } else {
      out.push({ name: rel, data: readFileSync(full), dir: false });
    }
  }
  return out;
}

/**
 * A staging test build (VITE_OTA_STAGING=1, src/lib/native/liveUpdate.ts) reads manifests from the
 * staging bucket. Shipped to production it would strand every phone on staging, so its bytes are
 * refused here: any file in the bundle that names the staging host.
 */
export function assertNotStagingBuild(dir, stagingBase) {
  const host = Buffer.from(new URL(stagingBase).host);
  const hit = walk(dir).find((entry) => !entry.dir && entry.data.includes(host));
  if (hit) throw new Error(`${hit.name} points at the staging bucket (${host}); rebuild without VITE_OTA_STAGING before publishing to production`);
}

/**
 * A salon bundle carries the profile it was built with (salon-client-build.json, written by
 * scripts/salon-client-vite.ts). A build with SALON_CLIENT_PROFILE_FILE set (the E2E and DoD demo
 * identity) would put the demo salon on every RetroBarber phone over the air, the 29.9 web incident
 * again, so a production bundle must carry exactly the shipped profile (.appstore/salon.json).
 */
export function assertShippedSalonProfile(distDir, profilePath) {
  let built;
  try {
    built = JSON.parse(readFileSync(join(distDir, 'salon-client-build.json'), 'utf8')).profile;
  } catch {
    throw new Error(`${distDir}/salon-client-build.json is missing or unreadable; the bundle's salon profile cannot be checked`);
  }
  const shipped = JSON.parse(readFileSync(profilePath, 'utf8'));
  if (!isDeepStrictEqual(built, shipped)) {
    throw new Error(`The bundle was built with another salon profile (${built?.slug ?? '?'}, tenant ${built?.tenantId ?? '?'}) than ${profilePath}; rebuild without SALON_CLIENT_PROFILE_FILE`);
  }
}

export function zipDirectory(dir) {
  const entries = walk(resolve(dir)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (!entries.some((e) => e.name === 'index.html')) throw new Error(`${dir} has no index.html at its root`);
  if (entries.length > 0xffff) throw new Error('too many files for a classic zip');
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01 00:00
  const locals = [], centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const deflated = entry.dir ? entry.data : deflateRawSync(entry.data, { level: 9 });
    const stored = entry.dir || deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated;
    const crc = crc32(entry.data);
    if (offset + 30 + name.length + body.length > 0xffffffff) throw new Error('bundle too large for a classic zip');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.dir ? 0x10 : 0, 38); // MS-DOS directory attribute
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ── Signatures ─────────────────────────────────────────────────────────────────────────────
// Bundle zip: SHA256withRSA (PKCS#1 v1.5) over the raw bytes, base64: what the live-update plugin
// verifies natively. Manifest and app.json: the same algorithm over the UTF-8 bytes of `body`,
// carried as a string so no canonical JSON is needed (src/lib/native/signedJson.ts verifies it).
export function signBytes(privateKeyPem, bytes) {
  return rsaSign('sha256', bytes, createPrivateKey(privateKeyPem)).toString('base64');
}

export function verifyBytes(publicKeyPem, bytes, signature) {
  try {
    return rsaVerify('sha256', bytes, createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export function signJson(privateKeyPem, value) {
  const body = JSON.stringify(value);
  return { alg: SIGNED_JSON_ALG, body, signature: signBytes(privateKeyPem, Buffer.from(body, 'utf8')) };
}

/** The verified body, or null for anything unsigned, malformed or signed by another key. */
export function readSignedJson(publicKeyPem, envelope) {
  if (!envelope || envelope.alg !== SIGNED_JSON_ALG || typeof envelope.body !== 'string' || typeof envelope.signature !== 'string') return null;
  if (!verifyBytes(publicKeyPem, Buffer.from(envelope.body, 'utf8'), envelope.signature)) return null;
  try {
    return JSON.parse(envelope.body);
  } catch {
    return null;
  }
}

/** Refuses a private key whose signatures the shells (tracked public key) would reject. */
export function assertKeyPair(privateKeyPem, publicKeyPem, app) {
  const probe = Buffer.from(`ota key check ${app}`);
  if (!verifyBytes(publicKeyPem, probe, signBytes(privateKeyPem, probe))) {
    throw new Error(`The signing key does not match native/keys/${app}.pub.pem; refusing to publish anything the shells would reject.`);
  }
}

// ── R2 (S3 API) ────────────────────────────────────────────────────────────────────────────
export class PreconditionFailed extends Error {}

export async function createR2Store({ accountId, accessKeyId, secretAccessKey, bucket }) {
  for (const [name, value] of Object.entries({ R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey })) {
    if (!value) throw new Error(`${name} is not set (source ~/.claude/secrets/r2-ota.env)`);
  }
  const { AwsClient } = await import('aws4fetch');
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  const objectUrl = (key) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const fail = async (what, res) => { throw new Error(`R2 ${what}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`); };
  // Uncompressed reads: a gzip-encoded response carries a weak ETag (W/"…"), which If-Match never
  // matches (seen on the first staging rollback), and a compressed content-length.
  const read = { headers: { 'accept-encoding': 'identity' } };
  const strongEtag = (res) => res.headers.get('etag')?.replace(/^W\//, '') ?? null;
  return {
    bucket,
    async get(key) {
      const res = await client.fetch(objectUrl(key), read);
      if (res.status === 404) return null;
      if (!res.ok) await fail(`GET ${key}`, res);
      return { body: Buffer.from(await res.arrayBuffer()), etag: strongEtag(res) };
    },
    async head(key) {
      const res = await client.fetch(objectUrl(key), { ...read, method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) await fail(`HEAD ${key}`, res);
      return { size: Number(res.headers.get('content-length')), etag: strongEtag(res) };
    },
    async put(key, body, { contentType, cacheControl, ifMatch, ifNoneMatch }) {
      const headers = { 'content-type': contentType, 'cache-control': cacheControl };
      if (ifMatch) headers['if-match'] = ifMatch;
      if (ifNoneMatch) headers['if-none-match'] = ifNoneMatch;
      const res = await client.fetch(objectUrl(key), { method: 'PUT', body, headers });
      if (res.status === 412) throw new PreconditionFailed(`${key} changed while publishing; nothing was overwritten. Run again.`);
      if (!res.ok) await fail(`PUT ${key}`, res);
    },
    async list(prefix) {
      const out = [];
      let token = null;
      do {
        const params = new URLSearchParams({ 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) });
        const res = await client.fetch(`${base}?${params}`);
        if (!res.ok) await fail(`LIST ${prefix}`, res);
        const xml = await res.text();
        for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const field = (tag) => block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '';
          out.push({ key: field('Key').replace(/&amp;/g, '&'), size: Number(field('Size')), lastModified: field('LastModified') });
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]*)</)?.[1] ?? null : null;
      } while (token);
      return out;
    },
  };
}

// ── Commands ───────────────────────────────────────────────────────────────────────────────
export const manifestKey = (app, platform, fp12) => `${app}/${platform}/runtime-${fp12}/manifest.json`;
export const bundleKey = (app, bundleId) => `${app}/bundles/${bundleId}.zip`;
export const policyKey = (app) => `${app}/app.json`;

/** Reads and verifies a signed object. Missing: null. Present but not ours: throws, so nothing builds on it. */
async function readVerified(store, key, publicKeyPem) {
  const object = await store.get(key);
  if (!object) return null;
  let envelope;
  try {
    envelope = JSON.parse(object.body.toString('utf8'));
  } catch {
    envelope = null;
  }
  const body = readSignedJson(publicKeyPem, envelope);
  if (!body) throw new Error(`${store.bucket}/${key} exists but its signature does not verify with the tracked public key. Investigate before publishing over it.`);
  return { body, etag: object.etag };
}

async function writeSigned(store, key, value, privateKeyPem, publicKeyPem, previous) {
  const envelope = signJson(privateKeyPem, value);
  await store.put(key, Buffer.from(JSON.stringify(envelope)), {
    contentType: 'application/json',
    cacheControl: NO_CACHE,
    ...(previous ? { ifMatch: previous.etag } : { ifNoneMatch: '*' }),
  });
  const back = await readVerified(store, key, publicKeyPem);
  if (!back || back.body.seq !== value.seq) throw new Error(`Read-back of ${key} does not match what was written`);
  return back.body;
}

/**
 * @param {{ app: string, platform: string, store: any, privateKeyPem: string, publicKeyPem: string,
 *   fingerprint: { fingerprint: string, fp12: string }, distDir: string, commit: string, publicBase: string,
 *   now?: () => Date }} options
 */
export async function publish({ app, platform, store, privateKeyPem, publicKeyPem, fingerprint, distDir, commit, publicBase, now = () => new Date() }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  const zip = zipDirectory(distDir);
  const digest = sha256(zip);
  const signature = signBytes(privateKeyPem, zip);
  const key = manifestKey(app, platform, fingerprint.fp12);
  const current = await readVerified(store, key, publicKeyPem);
  if (current && current.body.action !== 'reset' && current.body.sha256 === digest) {
    return { skipped: true, reason: 'identical bundle is already live', manifest: current.body };
  }
  const bundleId = `${commit.slice(0, 12)}-${digest.slice(0, 8)}`;
  const zipKey = bundleKey(app, bundleId);
  const existing = await store.head(zipKey);
  if (!existing) {
    await store.put(zipKey, zip, { contentType: 'application/zip', cacheControl: IMMUTABLE, ifNoneMatch: '*' });
  } else if (existing.size !== zip.length) {
    throw new Error(`${zipKey} already exists with other bytes; bundle ids are immutable`);
  }
  const manifest = {
    schema: 1, app, platform, fingerprint: fingerprint.fingerprint,
    seq: (current?.body.seq ?? 0) + 1, action: 'apply',
    bundleId, url: `${publicBase}/${zipKey}`, sha256: digest, size: zip.length, signature,
    commit, publishedAt: now().toISOString(),
  };
  return { skipped: false, manifest: await writeSigned(store, key, manifest, privateKeyPem, publicKeyPem, current) };
}

/** A NEW, higher seq that points at an older bundle (or resets to the shell's built-in bundle). */
export async function rollback({ app, platform, store, privateKeyPem, publicKeyPem, fp12, target, publicBase, now = () => new Date() }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  const key = manifestKey(app, platform, fp12);
  const current = await readVerified(store, key, publicKeyPem);
  if (!current) throw new Error(`Nothing is published at ${key}; there is nothing to roll back`);
  const common = { schema: 1, app, platform, fingerprint: current.body.fingerprint, seq: current.body.seq + 1, publishedAt: now().toISOString() };
  let manifest;
  if (target === 'reset') {
    manifest = { ...common, action: 'reset', bundleId: null, url: null, sha256: null, size: null, signature: null, commit: null };
  } else {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(target)) throw new Error(`Not a bundle id: ${target}`);
    const zipKey = bundleKey(app, target);
    const object = await store.get(zipKey);
    if (!object) throw new Error(`${zipKey} does not exist`);
    manifest = {
      ...common, action: 'rollback', bundleId: target, url: `${publicBase}/${zipKey}`,
      sha256: sha256(object.body), size: object.body.length, signature: signBytes(privateKeyPem, object.body),
      commit: target.split('-')[0],
    };
  }
  return writeSigned(store, key, manifest, privateKeyPem, publicKeyPem, current);
}

/** Raises (or lowers) the minimum store build of one platform in <app>/app.json. */
export async function setMinBuild({ app, platform, build, message, store, privateKeyPem, publicKeyPem, storeUrl, now = () => new Date() }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  if (!Number.isSafeInteger(build) || build < 0) throw new Error(`Not a build number: ${build}`);
  if (build > 0 && !storeUrl[platform]) throw new Error(`${app} has no ${platform} store URL in native/apps.json; a gate without a way to the store would lock people out`);
  const key = policyKey(app);
  const current = await readVerified(store, key, publicKeyPem);
  const previous = current?.body ?? { minBuild: { android: 0, ios: 0 } };
  const policy = {
    schema: 1, app, seq: (current?.body.seq ?? 0) + 1,
    minBuild: { ...previous.minBuild, [platform]: build },
    storeUrl,
    ...(message ? { message } : {}),
    publishedAt: now().toISOString(),
  };
  return writeSigned(store, key, policy, privateKeyPem, publicKeyPem, current);
}

export async function status({ app, store, publicKeyPem, currentRuntimes }) {
  const lines = [];
  for (const platform of PLATFORMS) {
    const objects = (await store.list(`${app}/${platform}/`)).filter((o) => o.key.endsWith('/manifest.json'));
    lines.push(`${app} ${platform}: tree is ${currentRuntimes[platform]}`);
    if (!objects.length) lines.push('  (no manifests)');
    for (const object of objects.sort((a, b) => b.lastModified.localeCompare(a.lastModified))) {
      const runtime = object.key.split('/')[2];
      try {
        const m = (await readVerified(store, object.key, publicKeyPem)).body;
        lines.push(`  ${runtime}${runtime === currentRuntimes[platform] ? ' (tree)' : ''}  seq ${m.seq}  ${m.action}  ${m.bundleId ?? '-'}  ${m.publishedAt}`);
      } catch (error) {
        lines.push(`  ${runtime}  INVALID: ${error.message}`);
      }
    }
  }
  try {
    const policy = await readVerified(store, policyKey(app), publicKeyPem);
    lines.push(policy ? `app.json: seq ${policy.body.seq}  minBuild android ${policy.body.minBuild.android} ios ${policy.body.minBuild.ios}` : 'app.json: (none)');
  } catch (error) {
    lines.push(`app.json: INVALID: ${error.message}`);
  }
  const bundles = (await store.list(`${app}/bundles/`)).sort((a, b) => b.lastModified.localeCompare(a.lastModified)).slice(0, 10);
  lines.push('last bundles:', ...bundles.map((b) => `  ${b.key.split('/').pop().replace(/\.zip$/, '')}  ${b.size} B  ${b.lastModified}`));
  return lines.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
function option(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function signingKey(app) {
  const path = process.env.OTA_SIGNING_KEY || join(process.env.OTA_KEY_DIR || join(homedir(), '.claude', 'secrets'), `ota-${app}.pem`);
  return readFileSync(path, 'utf8');
}

async function main(argv) {
  const [command, app, platform, arg] = argv;
  const registry = loadRegistry();
  if (!['publish', 'status', 'rollback', 'min'].includes(command) || !app) {
    console.error('usage: ota-publish.mjs publish|status|rollback|min <app> [...] (see the header of this file)');
    process.exit(2);
  }
  const entry = appEntry(registry, app, command === 'status' ? undefined : platform);
  const bucket = process.env.R2_BUCKET || STAGING_BUCKET;
  if (bucket === PRODUCTION_BUCKET && !argv.includes('--production')) throw new Error(`R2_BUCKET is the production bucket; add --production to mean it`);
  // A production bundle is always built here, from this commit: a dist left by an E2E run or a demo
  // build (SALON_CLIENT_PROFILE_FILE) must never be what gets signed.
  if (bucket === PRODUCTION_BUCKET && command === 'publish' && argv.includes('--skip-build')) throw new Error('--skip-build is refused for the production bucket; a production bundle is built by this command');
  const publicBase = process.env.OTA_PUBLIC_BASE || registry.updates[bucket];
  if (!publicBase) throw new Error(`No public base URL for bucket ${bucket} (native/apps.json "updates", or OTA_PUBLIC_BASE)`);
  const store = await createR2Store({ accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, bucket });
  const publicKeyPem = readFileSync(join(REPO_ROOT, entry.publicKey), 'utf8');
  console.error(`bucket ${bucket}`);

  if (command === 'status') {
    const currentRuntimes = Object.fromEntries(PLATFORMS.map((p) => [p, computeFingerprint({ app, platform: p, registry }).runtime]));
    console.log(await status({ app, store, publicKeyPem, currentRuntimes }));
    return;
  }
  const privateKeyPem = signingKey(app);
  if (command === 'publish') {
    const fingerprint = computeFingerprint({ app, platform, registry });
    if (!fingerprint.shellPresent) throw new Error(`${app} ${platform} has no native project (${entry.platforms[platform].path}); no shell can read this bundle`);
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, env: gitEnv, encoding: 'utf8' }).trim();
    if (dirty && !argv.includes('--allow-dirty')) throw new Error('The working tree has changes; a bundle must come from a commit (or pass --allow-dirty for staging tests)');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, env: gitEnv, encoding: 'utf8' }).trim();
    if (!argv.includes('--skip-build')) {
      // The shipped identity only: the build reads SALON_CLIENT_PROFILE_FILE when it is set.
      const { SALON_CLIENT_PROFILE_FILE: _demoProfile, ...buildEnv } = process.env;
      execSync(entry.buildCommand, { cwd: REPO_ROOT, env: buildEnv, stdio: 'inherit', shell: '/bin/bash' });
    }
    if (bucket === PRODUCTION_BUCKET) {
      assertNotStagingBuild(join(REPO_ROOT, entry.webDir), registry.updates[STAGING_BUCKET]);
      if (entry.vertical === 'salon') assertShippedSalonProfile(join(REPO_ROOT, entry.webDir), join(REPO_ROOT, SALON_PROFILE));
    }
    const result = await publish({ app, platform, store, privateKeyPem, publicKeyPem, fingerprint, distDir: join(REPO_ROOT, entry.webDir), commit, publicBase });
    console.log(JSON.stringify({ ...result, manifestKey: manifestKey(app, platform, fingerprint.fp12) }, null, 2));
    return;
  }
  if (command === 'rollback') {
    if (!arg) throw new Error('rollback needs <bundleId|reset>');
    const runtime = option(argv, '--runtime') ?? computeFingerprint({ app, platform, registry }).runtime;
    const fp12 = /^runtime-([0-9a-f]{12})$/.exec(runtime)?.[1];
    if (!fp12) throw new Error(`Not a runtime: ${runtime}`);
    console.log(JSON.stringify(await rollback({ app, platform, store, privateKeyPem, publicKeyPem, fp12, target: arg, publicBase }), null, 2));
    return;
  }
  const storeUrl = Object.fromEntries(PLATFORMS.map((p) => [p, entry.platforms[p].storeUrl ?? null]));
  console.log(JSON.stringify(await setMinBuild({ app, platform, build: Number(arg), message: option(argv, '--message'), store, privateKeyPem, publicKeyPem, storeUrl }), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
