// Test stub of therapy-flow-v2's scripts/native/ota-publish.mjs: the exports ota-step.mjs uses and a
// CLI that echoes its arguments, over a stub R2 (one file per key under $OTA_STUB_R2/<bucket>). A
// signed envelope is {alg, body, signature: "stub"}; the signing key is the text zz-fake-key-<app>.
// $OTA_STUB_R2/fail-<app> makes every publish of that app throw, as an R2 error would.
import { appendFileSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_BUCKET = 'nadavai-app-updates';
export const STAGING_BUCKET = 'nadavai-app-updates-staging';
export const SALON_PROFILE = '.appstore/salon.json';
export const manifestKey = (app, platform, fp12) => `${app}/${platform}/runtime-${fp12}/manifest.json`;
export const readSignedJson = (_publicKeyPem, envelope) => (envelope?.signature === 'stub' ? JSON.parse(envelope.body) : null);
export function assertKeyPair(privateKeyPem, _publicKeyPem, app) {
  if (privateKeyPem.trim() !== `zz-fake-key-${app}`) throw new Error(`The signing key does not match native/keys/${app}.pub.pem`);
}
export function assertNotStagingBuild() {}
export function assertShippedSalonProfile(distDir) {
  if (existsSync(join(distDir, 'demo-profile'))) throw new Error('The bundle was built with another salon profile');
}
export async function createR2Store({ accountId, accessKeyId, secretAccessKey, bucket }) {
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2_* is not set');
  const dir = join(process.env.OTA_STUB_R2, bucket);
  return {
    bucket, dir,
    async get(key) {
      const file = join(dir, key);
      return existsSync(file) ? { body: readFileSync(file), etag: '"e"' } : null;
    },
  };
}
export async function publish({ app, platform, store, privateKeyPem, publicKeyPem, fingerprint, distDir, commit }) {
  assertKeyPair(privateKeyPem, publicKeyPem, app);
  if (existsSync(join(process.env.OTA_STUB_R2, `fail-${app}`))) throw new Error('R2 PUT: HTTP 500 (stub)');
  const key = manifestKey(app, platform, fingerprint.fp12);
  const current = readSignedJson(publicKeyPem, JSON.parse(readFileSync(join(store.dir, key), 'utf8')));
  const bundleId = `${commit.slice(0, 12)}-stub`;
  cpSync(distDir, join(store.dir, app, 'bundles', bundleId), { recursive: true });
  const manifest = { schema: 1, app, platform, seq: current.seq + 1, action: 'apply', bundleId, commit, publishedAt: new Date().toISOString() };
  writeFileSync(join(store.dir, key), JSON.stringify({ alg: 'stub', body: JSON.stringify(manifest), signature: 'stub' }));
  appendFileSync(join(process.env.OTA_STUB_R2, 'publish.log'), `${app} ${platform} ${commit} ${store.bucket}\n`);
  return { skipped: false, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const key = process.env.OTA_SIGNING_KEY ? readFileSync(process.env.OTA_SIGNING_KEY, 'utf8').trim() : 'none';
  console.log(`stub ${process.argv.slice(2).join(' ')} bucket=${process.env.R2_BUCKET} key=${key}`);
}
