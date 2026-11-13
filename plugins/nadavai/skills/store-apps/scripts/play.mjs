// Google Play Developer API helper (androidpublisher v3). Prints no secret.
//   node play.mjs tracks <package>                     list tracks and releases
//   node play.mjs upload <package> <aab> <track> [--status draft|inProgress|completed] [--fraction 0.1]
//                        [--name "<release name>"] [--notes-he "<text>"] [--yes-production]
//   node play.mjs raw <METHOD> <path-after-v3> [json]  e.g. raw GET applications/<pkg>/reviews
//   node play.mjs apk <package> <versionCode> <out.apk>  the Play-signed universal APK, exactly what Play delivers
// upload makes a draft unless --status says otherwise. inProgress is a staged rollout and needs
// --fraction (0 < f < 1). A non-draft release on the production track also needs --yes-production,
// because it uses up the version code and reaches users at once. A failed call deletes its edit.
// Key: PLAY_SA_KEY or ~/.claude/secrets/play-publisher-service-account.json
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const keyPath = process.env.PLAY_SA_KEY || `${process.env.HOME}/.claude/secrets/play-publisher-service-account.json`;
const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';
const die = (message) => { console.error(message); process.exit(2); };

async function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token: ${r.status} ${JSON.stringify(j)}`);
  return j.access_token;
}

const [cmd, ...args] = process.argv.slice(2);
const VALUE_FLAGS = ['--status', '--fraction', '--name', '--notes-he'];
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) die(`${name} needs a value`);
  return v;
};
if (!['tracks', 'upload', 'raw', 'apk'].includes(cmd)) die('usage: play.mjs tracks|upload|raw|apk ... (see header)');
let status, fraction;
if (cmd === 'upload') {
  const known = new Set([...VALUE_FLAGS, '--yes-production']);
  for (const a of args) if (a.startsWith('--') && !known.has(a)) die(`unknown flag ${a}`);
  const [pkg, aab, track] = args;
  if (!pkg || !aab || !track || [pkg, aab, track].some((a) => a.startsWith('--'))) die('usage: play.mjs upload <package> <aab> <track> [...]');
  status = opt('--status') || 'draft';
  if (!['draft', 'inProgress', 'completed'].includes(status)) die('--status is draft, inProgress or completed');
  fraction = opt('--fraction');
  if (status === 'inProgress' && !(Number(fraction) > 0 && Number(fraction) < 1)) die('inProgress needs --fraction between 0 and 1');
  if (status !== 'inProgress' && fraction !== undefined) die('--fraction goes only with --status inProgress');
  if (track === 'production' && status !== 'draft' && !args.includes('--yes-production')) die('a non-draft production release also needs --yes-production');
  opt('--name'); opt('--notes-he');
}

const tok = await token();
async function call(method, url, body, headers = {}) {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${tok}`, ...headers }, body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(API, '')} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
const json = (o) => ({ body: JSON.stringify(o), headers: { 'content-type': 'application/json' } });
/** One edit: run the steps, commit when commit is true, and delete the edit when anything fails. */
async function inEdit(pkg, steps, commit) {
  const edit = await call('POST', `${API}/applications/${pkg}/edits`);
  try {
    const out = await steps(edit.id);
    if (commit) return { out, done: await call('POST', `${API}/applications/${pkg}/edits/${edit.id}:commit`) };
    await call('DELETE', `${API}/applications/${pkg}/edits/${edit.id}`);
    return { out };
  } catch (error) {
    await call('DELETE', `${API}/applications/${pkg}/edits/${edit.id}`).catch(() => {});
    throw error;
  }
}

if (cmd === 'tracks') {
  const pkg = args[0] ?? die('usage: play.mjs tracks <package>');
  const { out } = await inEdit(pkg, (id) => call('GET', `${API}/applications/${pkg}/edits/${id}/tracks`), false);
  console.log(JSON.stringify(out.tracks, null, 1));
} else if (cmd === 'upload') {
  const [pkg, aab, track] = args;
  const { done } = await inEdit(pkg, async (id) => {
    const bundle = await call('POST', `${UPLOAD}/applications/${pkg}/edits/${id}/bundles?uploadType=media`,
      readFileSync(aab), { 'content-type': 'application/octet-stream' });
    console.log('uploaded versionCode', bundle.versionCode, 'sha256', bundle.sha256);
    const release = { versionCodes: [String(bundle.versionCode)], status };
    if (fraction !== undefined) release.userFraction = Number(fraction);
    if (opt('--name')) release.name = opt('--name');
    if (opt('--notes-he')) release.releaseNotes = [{ language: 'iw-IL', text: opt('--notes-he') }];
    const { body, headers } = json({ track, releases: [release] });
    await call('PUT', `${API}/applications/${pkg}/edits/${id}/tracks/${track}`, body, headers);
  }, true);
  console.log('committed edit', done.id, 'track', track, 'status', status);
} else if (cmd === 'apk') {
  const [pkg, vc, out] = args;
  if (!pkg || !vc || !out) die('usage: play.mjs apk <package> <versionCode> <out.apk>');
  const list = await call('GET', `${API}/applications/${pkg}/generatedApks/${vc}`);
  const id = list.generatedApks?.[0]?.generatedUniversalApk?.downloadId;
  if (!id) die(`no universal APK for ${pkg} ${vc}`);
  const r = await fetch(`${API}/applications/${pkg}/generatedApks/${vc}/downloads/${encodeURIComponent(id)}:download?alt=media`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!r.ok) die(`download: ${r.status} ${await r.text()}`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log('wrote', out, 'certificate', list.generatedApks[0].certificateSha256Hash);
} else {
  const [method, path, b] = args;
  if (!method || !path) die('usage: play.mjs raw <METHOD> <path-after-v3> [json]');
  console.log(JSON.stringify(await call(method, `${API}/${path}`, b, b ? { 'content-type': 'application/json' } : {}), null, 1));
}
