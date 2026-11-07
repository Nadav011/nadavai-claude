// Google Play Developer API helper (androidpublisher v3). Prints no secret.
//   node play.mjs tracks <package>                     list tracks and releases
//   node play.mjs upload <package> <aab> <track> [--name "<release name>"] [--status draft|completed] [--notes-he "<text>"]
//   node play.mjs raw <METHOD> <path-after-v3> [json]  e.g. raw GET applications/<pkg>/reviews
// Key: PLAY_SA_KEY or ~/.claude/secrets/play-publisher-service-account.json
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const keyPath = process.env.PLAY_SA_KEY || `${process.env.HOME}/.claude/secrets/play-publisher-service-account.json`;
const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

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

const tok = await token();
async function call(method, url, body, headers = {}) {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${tok}`, ...headers }, body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(API, '')} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
const json = (o) => ({ body: JSON.stringify(o), headers: { 'content-type': 'application/json' } });

const [cmd, ...args] = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

if (cmd === 'tracks') {
  const pkg = args[0];
  const edit = await call('POST', `${API}/applications/${pkg}/edits`);
  const t = await call('GET', `${API}/applications/${pkg}/edits/${edit.id}/tracks`);
  console.log(JSON.stringify(t.tracks, null, 1));
  await call('DELETE', `${API}/applications/${pkg}/edits/${edit.id}`);
} else if (cmd === 'upload') {
  const [pkg, aab, track] = args;
  const status = opt('--status') || 'completed';
  const edit = await call('POST', `${API}/applications/${pkg}/edits`);
  const bundle = await call('POST', `${UPLOAD}/applications/${pkg}/edits/${edit.id}/bundles?uploadType=media`,
    readFileSync(aab), { 'content-type': 'application/octet-stream' });
  console.log('uploaded versionCode', bundle.versionCode, 'sha256', bundle.sha256);
  const release = { versionCodes: [String(bundle.versionCode)], status };
  if (opt('--name')) release.name = opt('--name');
  if (opt('--notes-he')) release.releaseNotes = [{ language: 'iw-IL', text: opt('--notes-he') }];
  const { body, headers } = json({ track, releases: [release] });
  await call('PUT', `${API}/applications/${pkg}/edits/${edit.id}/tracks/${track}`, body, headers);
  const done = await call('POST', `${API}/applications/${pkg}/edits/${edit.id}:commit`);
  console.log('committed edit', done.id, 'track', track, 'status', status);
} else if (cmd === 'raw') {
  const [method, path, b] = args;
  console.log(JSON.stringify(await call(method, `${API}/${path}`, b, b ? { 'content-type': 'application/json' } : {}), null, 1));
} else {
  console.error('usage: play.mjs tracks|upload|raw ... (see header)');
  process.exit(2);
}
