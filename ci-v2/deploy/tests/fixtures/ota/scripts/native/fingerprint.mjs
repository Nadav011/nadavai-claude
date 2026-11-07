// Test stub of therapy-flow-v2's scripts/native/fingerprint.mjs: only the exports ota-step.mjs uses.
// The runtime of each app/platform is native/runtimes.json of the commit.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLATFORMS = ['android', 'ios'];
export const loadRegistry = (root) => JSON.parse(readFileSync(join(root, 'native', 'apps.json'), 'utf8'));
export function appEntry(registry, app) {
  const entry = registry.apps[app];
  if (!entry) throw new Error(`Unknown app "${app}"`);
  return entry;
}
export function computeFingerprint({ app, platform, root }) {
  const runtime = JSON.parse(readFileSync(join(root, 'native', 'runtimes.json'), 'utf8'))[`${app}/${platform}`];
  const fp12 = runtime.slice('runtime-'.length);
  return { app, platform, fingerprint: fp12.padEnd(64, '0'), fp12, runtime, shellPresent: true };
}
