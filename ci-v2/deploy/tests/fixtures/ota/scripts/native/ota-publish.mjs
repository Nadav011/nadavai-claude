// Test stub of the vendored publisher (therapy-flow-v2 scripts/native/ota-publish.mjs): the exports
// tools/ota-step.mjs uses, over a stub R2 (one file per key under $OTA_STUB_R2/<bucket>). A signed
// envelope is {alg, body, signature: "stub"}; the signing key is the text zz-fake-key-<app>.
// $OTA_STUB_R2/fail-<app> makes every publish of that app throw, as an R2 error would. Each write is
// logged in $OTA_STUB_R2/publish.log. The test installs it as tools/ota/ota-publish.mjs and commits
// the same file into the fixture repo, so the vendored-blob check passes.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const PRODUCTION_BUCKET = 'nadavai-app-updates';
export const STAGING_BUCKET = 'nadavai-app-updates-staging';
export const SALON_PROFILE = '.appstore/salon.json';
export const manifestKey = (app, platform, fp12) => `${app}/${platform}/runtime-${fp12}/manifest.json`;
export const readSignedJson = (_publicKeyPem, envelope) => (envelope?.signature === 'stub' ? JSON.parse(envelope.body) : null);
export function assertKeyPair(privateKeyPem, _publicKeyPem, app) {
  if (privateKeyPem.trim() !== `zz-fake-key-${app}`) throw new Error(`The signing key does not match native/keys/${app}.pub.pem`);
}
export function assertNotStagingBuild(dir, stagingBase) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isFile() && readFileSync(full, 'utf8').includes(new URL(stagingBase).host)) throw new Error(`${name} points at the staging bucket`);
  }
}
export function assertShippedSalonProfile(distDir) {
  if (existsSync(join(distDir, 'demo-profile'))) throw new Error('The bundle was built with another salon profile');
}
const log = (line) => appendFileSync(join(process.env.OTA_STUB_R2, 'publish.log'), `${line}\n`);
export async function createR2Store({ accountId, accessKeyId, secretAccessKey, bucket }) {
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2_* is not set');
  const dir = join(process.env.OTA_STUB_R2, bucket);
  const all = (d) => (existsSync(d) ? readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? all(join(d, n)) : [join(d, n)])) : []);
  return {
    bucket, dir,
    async get(key) {
      const file = join(dir, key);
      return existsSync(file) && statSync(file).isFile() ? { body: readFileSync(file), etag: '"e"' } : null;
    },
    async list(prefix) {
      return all(dir).map((f) => ({ key: relative(dir, f), size: 0, lastModified: '' })).filter((o) => o.key.startsWith(prefix));
    },
  };
}
const write = (store, key, manifest) => {
  mkdirSync(dirname(join(store.dir, key)), { recursive: true });
  writeFileSync(join(store.dir, key), JSON.stringify({ alg: 'stub', body: JSON.stringify(manifest), signature: 'stub' }));
};
export async function publish({ app, platform, store, privateKeyPem, publicKeyPem, fingerprint, distDir, commit, publicBase }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  if (existsSync(join(process.env.OTA_STUB_R2, `fail-${app}`))) throw new Error('R2 PUT: HTTP 500 (stub)');
  const key = manifestKey(app, platform, fingerprint.fp12);
  const current = readSignedJson(publicKeyPem, JSON.parse(readFileSync(join(store.dir, key), 'utf8')));
  const bundleId = `${commit.slice(0, 12)}-stub`;
  cpSync(distDir, join(store.dir, app, 'bundles', bundleId), { recursive: true });
  const manifest = { schema: 1, app, platform, seq: current.seq + 1, action: 'apply', bundleId, url: `${publicBase}/${app}/bundles/${bundleId}.zip`, commit, publishedAt: new Date().toISOString() };
  write(store, key, manifest);
  log(`${app} ${platform} ${commit} ${store.bucket} ${publicBase}`);
  return { skipped: false, manifest };
}
export async function rollback({ app, platform, store, privateKeyPem, publicKeyPem, fp12, target, publicBase }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  const key = manifestKey(app, platform, fp12);
  const file = join(store.dir, key);
  if (!existsSync(file)) throw new Error(`Nothing is published at ${key}; there is nothing to roll back`);
  const current = readSignedJson(publicKeyPem, JSON.parse(readFileSync(file, 'utf8')));
  const reset = target === 'reset';
  const manifest = { schema: 1, app, platform, seq: current.seq + 1, action: reset ? 'reset' : 'rollback', bundleId: reset ? null : target,
    url: reset ? null : `${publicBase}/${app}/bundles/${target}.zip`, commit: reset ? null : target.split('-')[0], publishedAt: new Date().toISOString() };
  write(store, key, manifest);
  log(`rollback ${app} ${platform} ${target} runtime-${fp12} ${store.bucket} ${publicBase}`);
  return manifest;
}
export async function setMinBuild({ app, platform, build, message, store, privateKeyPem, publicKeyPem }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  log(`min ${app} ${platform} ${build} ${message ?? '-'} ${store.bucket}`);
  return { schema: 1, app, seq: 1, minBuild: { [platform]: build }, ...(message ? { message } : {}) };
}
export async function status({ app, store, currentRuntimes }) {
  return `status ${app} android=${currentRuntimes.android} ios=${currentRuntimes.ios} bucket=${store.bucket} key=${process.env.OTA_SIGNING_KEY ?? 'none'}`;
}
