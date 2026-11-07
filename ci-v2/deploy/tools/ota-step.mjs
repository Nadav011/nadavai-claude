// ota-step.mjs: the deploy service's OTA publish of one app for one live commit (therapy-flow-v2,
// planning/native-apps-2026-11-06/OTA.md section 9 item 6). nadavai-deploy runs it as
// nadavai-upload in a fresh clone of the commit (never the build's tree), with the app's built web
// bundle copied in, the R2 credentials from systemd's EnvironmentFile and the app's signing key as
// a systemd credential (OTA_SIGNING_KEY is its path).
//
//   node ota-step.mjs <clone> <app> <sha> <commit time, ISO 8601> [--dry-run]
//
// Zip, signature and manifest come from the commit's own publisher (scripts/native/ota-publish.mjs);
// this file only decides, per platform of the app in native/apps.json:
//   no production manifest for the commit's runtime -> native-change (the shell changed: a store
//                                                      build is needed; first manifests go by hand)
//   the manifest already carries this commit         -> current
//   a person's rollback or reset newer than the commit -> kept (never published over)
//   otherwise                                        -> published (would-publish on a dry run)
// One line per platform on stdout: "RESULT <app> <platform> <runtime> <result> <detail>".
// Exit 0 when no platform failed, 1 when one did, 2 on a usage error.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, app, sha, commitTime, ...flags] = process.argv.slice(2);
if (!root || !/^[a-z0-9-]+$/.test(app ?? '') || !/^[0-9a-f]{40}$/.test(sha ?? '') || Number.isNaN(Date.parse(commitTime ?? ''))) {
  console.error('usage: ota-step.mjs <clone> <app> <sha> <commit time> [--dry-run]');
  process.exit(2);
}
const dry = flags.includes('--dry-run');
const line = (platform, runtime, result, detail) =>
  console.log(['RESULT', app, platform, runtime, result, String(detail).replace(/\s+/g, ' ')].join(' '));

let failed = false;
let platforms = ['android', 'ios'];
try {
  const ota = await import(pathToFileURL(join(root, 'scripts/native/ota-publish.mjs')).href);
  const fpm = await import(pathToFileURL(join(root, 'scripts/native/fingerprint.mjs')).href);
  const registry = fpm.loadRegistry(root);
  const entry = fpm.appEntry(registry, app);
  platforms = fpm.PLATFORMS.filter((p) => entry.platforms[p]);
  const publicBase = registry.updates[ota.PRODUCTION_BUCKET];
  if (!publicBase) throw new Error(`native/apps.json has no public base for ${ota.PRODUCTION_BUCKET}`);
  const publicKeyPem = readFileSync(join(root, entry.publicKey), 'utf8');
  const privateKeyPem = readFileSync(process.env.OTA_SIGNING_KEY ?? '', 'utf8');
  const distDir = join(root, entry.webDir);
  const store = await ota.createR2Store({
    accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, bucket: ota.PRODUCTION_BUCKET,
  });
  // The checks the CLI runs on a production bundle, once, before the first write.
  let checked = false;
  const checkBundle = () => {
    if (checked) return;
    ota.assertKeyPair(privateKeyPem, publicKeyPem, app);
    ota.assertNotStagingBuild(distDir, registry.updates[ota.STAGING_BUCKET]);
    if (entry.vertical === 'salon') ota.assertShippedSalonProfile(distDir, join(root, ota.SALON_PROFILE));
    checked = true;
  };
  for (const platform of platforms) {
    let runtime = '-';
    try {
      const fingerprint = fpm.computeFingerprint({ app, platform, root, registry });
      runtime = fingerprint.runtime;
      if (!fingerprint.shellPresent) throw new Error(`no native project at ${entry.platforms[platform].path}`);
      const key = ota.manifestKey(app, platform, fingerprint.fp12);
      const object = await store.get(key);
      if (!object) {
        line(platform, runtime, 'native-change', `no production manifest at ${key}: no store shell has this runtime; a store build is needed`);
        continue;
      }
      let envelope = null;
      try { envelope = JSON.parse(object.body.toString('utf8')); } catch { /* not JSON: does not verify below */ }
      const current = ota.readSignedJson(publicKeyPem, envelope);
      if (!current) throw new Error(`${key} does not verify with ${entry.publicKey}; investigate before publishing over it`);
      // An apply manifest carries the full sha, a rollback the bundle's 12-character commit prefix.
      if (typeof current.commit === 'string' && current.commit.length >= 12 && sha.startsWith(current.commit)) {
        line(platform, runtime, 'current', `seq ${current.seq} ${current.action} ${current.bundleId ?? '-'} already carries ${sha.slice(0, 7)}`);
        continue;
      }
      if ((current.action === 'rollback' || current.action === 'reset') && Date.parse(commitTime) <= Date.parse(current.publishedAt)) {
        line(platform, runtime, 'kept', `seq ${current.seq} is a ${current.action} made ${current.publishedAt}, after this commit; left as is`);
        continue;
      }
      checkBundle();
      if (dry) {
        line(platform, runtime, 'would-publish', `over seq ${current.seq} ${current.action} ${current.bundleId ?? '-'}`);
        continue;
      }
      const result = await ota.publish({ app, platform, store, privateKeyPem, publicKeyPem, fingerprint, distDir, commit: sha, publicBase });
      if (result.skipped) line(platform, runtime, 'current', `seq ${result.manifest.seq}: ${result.reason}`);
      else line(platform, runtime, 'published', `seq ${result.manifest.seq} ${result.manifest.bundleId}`);
    } catch (error) {
      failed = true;
      line(platform, runtime, 'failed', error.message);
    }
  }
} catch (error) {
  failed = true;
  for (const platform of platforms) line(platform, '-', 'failed', error.message);
}
process.exit(failed ? 1 : 0);
