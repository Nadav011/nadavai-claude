// ota-step.mjs: the deploy service's signing and R2 step for therapy-flow-v2's store apps
// (planning/native-apps-2026-11-06/OTA.md section 9 item 6). nadavai-deploy runs it as nadavai-ota
// in a fresh clone of a commit, with the R2 credentials from systemd's EnvironmentFile and, where it
// signs, the app's key as a systemd credential (OTA_SIGNING_KEY is its path).
//
// Only trusted code runs here: this file and the publisher vendored beside it in ./ota/
// (ota-publish.mjs and fingerprint.mjs, byte for byte the reviewed copies; nadavai-deploy refuses a
// commit whose own copies differ). The clone is data only: native/apps.json, the tracked native
// files and lockfile the fingerprint hashes, the public key (trusted only once the service's private
// key signs for it) and the built bundle. Nothing from the commit is imported or executed.
//
//   node ota-step.mjs publish  <clone> <app> <platform> <sha> <commit time, ISO 8601> [--dry-run]
//   node ota-step.mjs status   <clone> <app>...
//   node ota-step.mjs rollback <clone> <app> <platform> <bundleId|reset> <runtime-fp12>
//   node ota-step.mjs min      <clone> <app> <platform> <build> [<message>]
//
// publish decides, for one platform of the app:
//   no production manifest for the runtime, none for the platform -> not-released (first manifest by hand)
//   no production manifest for the runtime, others for the platform -> native-change (store build needed)
//   the manifest already carries this commit                       -> current
//   a person's rollback or reset newer than the commit             -> kept (never published over)
//   otherwise                                                      -> published (would-publish on a dry run)
// and prints one line "RESULT <app> <platform> <runtime> <result> <bundleId|-> <detail>".
// Exit 0 when nothing failed, 1 when something did, 2 on a usage error.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as fpm from './ota/fingerprint.mjs';
import * as ota from './ota/ota-publish.mjs';

/** The hosts the shells read (src/lib/native/liveUpdate.ts), fixed here so a commit cannot move them. */
export const PUBLIC_BASE = 'https://updates.nadavc.ai';
export const STAGING_BASE = 'https://pub-850569e54b79463f8485db0cd83bdc7b.r2.dev';
/** Apps whose bundle must carry the shipped salon profile, whatever the commit's registry says. */
const SALON_APPS = new Set(['retrobarber']);
const PLATFORM = /^(android|ios)$/;

const usage = () => {
  console.error('usage: ota-step.mjs publish|status|rollback|min <clone> <app> ... (see the header of this file)');
  process.exit(2);
};

function appOf(root, app) {
  const registry = fpm.loadRegistry(root);
  const entry = fpm.appEntry(registry, app);
  if (!/^native\/keys\/[a-z0-9-]+\.pub\.pem$/.test(entry.publicKey ?? '')) throw new Error(`${app}: odd publicKey path in native/apps.json`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.webDir ?? '')) throw new Error(`${app}: odd webDir in native/apps.json`);
  return { registry, entry, publicKeyPem: readFileSync(join(root, entry.publicKey), 'utf8') };
}

const store = () => ota.createR2Store({
  accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, bucket: ota.PRODUCTION_BUCKET,
});

/** The service's key, and proof that the commit's public key is its pair (so it is the shells' key). */
function signingKey(app, publicKeyPem) {
  const privateKeyPem = readFileSync(process.env.OTA_SIGNING_KEY ?? '', 'utf8');
  ota.assertKeyPair(privateKeyPem, publicKeyPem, app);
  return privateKeyPem;
}

function textFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) textFiles(full, out);
    else if (/\.(m?js|html)$/.test(name)) out.push(readFileSync(full, 'utf8'));
  }
  return out;
}

/**
 * The updater lives inside the bundle: a bundle without it strands every phone on this bundle for
 * good. Refuses one that does not name the production host, the manifest path, and this app's
 * public key (every base64 line of it).
 */
export function assertUpdaterInBundle(distDir, publicKeyPem) {
  const files = textFiles(distDir);
  const keyLines = publicKeyPem.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('-----'));
  const missing = [];
  if (!files.some((f) => f.includes(PUBLIC_BASE))) missing.push(PUBLIC_BASE);
  if (!files.some((f) => f.includes('runtime-') && f.includes('/manifest.json'))) missing.push('the runtime-<fp12>/manifest.json path');
  if (!keyLines.length || !files.some((f) => keyLines.every((l) => f.includes(l)))) missing.push("the app's public key");
  if (missing.length) throw new Error(`the bundle has no OTA updater: ${missing.join(', ')} not found; refusing to publish a bundle that cannot update itself`);
}

async function publishOne(root, app, platform, sha, commitTime, dry) {
  const { registry, entry, publicKeyPem } = appOf(root, app);
  if (!entry.platforms?.[platform]) throw new Error(`${app} has no ${platform} in native/apps.json`);
  const privateKeyPem = signingKey(app, publicKeyPem);
  const distDir = join(root, entry.webDir);
  const checkBundle = () => {
    ota.assertNotStagingBuild(distDir, STAGING_BASE);
    if (SALON_APPS.has(app) || entry.vertical === 'salon') ota.assertShippedSalonProfile(distDir, join(root, ota.SALON_PROFILE));
    assertUpdaterInBundle(distDir, publicKeyPem);
  };
  const fingerprint = fpm.computeFingerprint({ app, platform, root, registry });
  const { runtime } = fingerprint;
  if (!fingerprint.shellPresent) throw Object.assign(new Error(`no native project at ${entry.platforms[platform].path}`), { runtime });
  // A dry run checks the bundle whatever R2 says, so it proves what a real run would refuse.
  if (dry) checkBundle();
  const r2 = await store();
  const key = ota.manifestKey(app, platform, fingerprint.fp12);
  const object = await r2.get(key);
  if (!object) {
    const released = (await r2.list(`${app}/${platform}/`)).some((o) => o.key.endsWith('/manifest.json'));
    return released
      ? [runtime, 'native-change', '-', `no production manifest at ${key}, but ${app} ${platform} has others: the shell changed; a store build is needed`]
      : [runtime, 'not-released', '-', `${app} ${platform} has no production manifest yet: not released over the air (the first manifest goes by hand)`];
  }
  let envelope = null;
  try { envelope = JSON.parse(object.body.toString('utf8')); } catch { /* not JSON: does not verify below */ }
  const current = ota.readSignedJson(publicKeyPem, envelope);
  if (!current) throw Object.assign(new Error(`${key} does not verify with ${entry.publicKey}; investigate before publishing over it`), { runtime });
  const at = `seq ${current.seq} ${current.action} ${current.bundleId ?? '-'}`;
  // An apply manifest carries the full sha, a rollback the bundle's 12-character commit prefix.
  if (typeof current.commit === 'string' && current.commit.length >= 12 && sha.startsWith(current.commit)) {
    return [runtime, 'current', current.bundleId ?? '-', `${at} already carries ${sha.slice(0, 7)}`];
  }
  if ((current.action === 'rollback' || current.action === 'reset') && Date.parse(commitTime) <= Date.parse(current.publishedAt)) {
    return [runtime, 'kept', current.bundleId ?? '-', `${at} is a ${current.action} made ${current.publishedAt}, after this commit; left as is`];
  }
  if (dry) return [runtime, 'would-publish', '-', `over ${at}`];
  checkBundle();
  const result = await ota.publish({ app, platform, store: r2, privateKeyPem, publicKeyPem, fingerprint, distDir, commit: sha, publicBase: PUBLIC_BASE });
  return result.skipped
    ? [runtime, 'current', result.manifest.bundleId ?? '-', `seq ${result.manifest.seq}: ${result.reason}`]
    : [runtime, 'published', result.manifest.bundleId, `seq ${result.manifest.seq} ${result.manifest.bundleId}`];
}

async function main(argv) {
  const [command, root, app, platform, ...rest] = argv;
  if (!root || !/^[a-z0-9-]+$/.test(app ?? '')) usage();
  if (command === 'publish') {
    const [sha, commitTime, ...flags] = rest;
    if (!PLATFORM.test(platform ?? '') || !/^[0-9a-f]{40}$/.test(sha ?? '') || Number.isNaN(Date.parse(commitTime ?? ''))) usage();
    let out;
    try {
      out = await publishOne(root, app, platform, sha, commitTime, flags.includes('--dry-run'));
    } catch (error) {
      out = [error.runtime ?? '-', 'failed', '-', error.message];
    }
    console.log(['RESULT', app, platform, ...out.slice(0, 3), String(out[3]).replace(/\s+/g, ' ')].join(' '));
    return out[1] === 'failed' ? 1 : 0;
  }
  if (command === 'status') {
    const r2 = await store();
    for (const name of [app, platform, ...rest].filter(Boolean)) {
      if (!/^[a-z0-9-]+$/.test(name)) usage();
      const { registry, publicKeyPem } = appOf(root, name);
      const currentRuntimes = Object.fromEntries(fpm.PLATFORMS.map((p) => [p, fpm.computeFingerprint({ app: name, platform: p, root, registry }).runtime]));
      console.log(await ota.status({ app: name, store: r2, publicKeyPem, currentRuntimes }));
    }
    return 0;
  }
  if (!PLATFORM.test(platform ?? '')) usage();
  const { entry, publicKeyPem } = appOf(root, app);
  if (command === 'rollback') {
    const [target, runtime] = rest;
    const fp12 = /^runtime-([0-9a-f]{12})$/.exec(runtime ?? '')?.[1];
    if (!fp12 || !/^[A-Za-z0-9._-]{1,128}$/.test(target ?? '')) usage();
    const privateKeyPem = signingKey(app, publicKeyPem);
    const manifest = await ota.rollback({ app, platform, store: await store(), privateKeyPem, publicKeyPem, fp12, target, publicBase: PUBLIC_BASE });
    console.log(JSON.stringify(manifest, null, 2));
    return 0;
  }
  if (command === 'min') {
    const [build, message] = rest;
    if (!/^[0-9]{1,9}$/.test(build ?? '')) usage();
    const privateKeyPem = signingKey(app, publicKeyPem);
    const storeUrl = Object.fromEntries(fpm.PLATFORMS.map((p) => [p, entry.platforms?.[p]?.storeUrl ?? null]));
    console.log(JSON.stringify(await ota.setMinBuild({ app, platform, build: Number(build), message, store: await store(), privateKeyPem, publicKeyPem, storeUrl }), null, 2));
    return 0;
  }
  usage();
}

main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
  console.error(error.message);
  process.exit(1);
});
