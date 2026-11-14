// Read-only matrix of every store app in both stores, with public proof. Usage:
//   node store-status.mjs [--json] [--config <path>]
// iOS: every app in App Store Connect (state of the newest version, territories on sale, and whether
// Apple's public lookup finds it). Android: the production track of each package, and whether the
// public Play page opens. Why both: "Ready for Distribution" with no territories is off sale, and a
// Play production release with status "completed" can still be in Google's review, so only the
// public page counts as live (found 2026-11-09: 3 of 6 Play packages said completed with a 404 page).
// A 200 page proves the listing is public, not that the newest release is: under managed publishing an
// approved release waits for "Publish" in the Publishing overview while the API already says completed
// and the page still serves the older version (Cash 1.2.0, 2026-11-14), and a production edit that was
// never sent for review also reads completed (SporChat). So the line names the release as unconfirmed.
// Play package = the iOS bundle id unless the config (--config, default ~/.config/nadavai/store-apps.json)
// maps it, e.g.
//   { "apps": { "app.sporchat.ios": { "play": "app.sporchat.twa" } }, "playOnly": ["com.example.app"] }
// (kept outside the repo: ids of the private apps do not belong in this public skill; the nightly
// store-drift check on omarchy passes its own copy from the private nadavai-nightly repo).
// --json rows also carry iosPublic (Apple's public lookup finds the app) and play.public (the public
// Play page opens), whatever review a newer version is in.
// Credentials: the same two files asc.mjs and play.mjs read. Prints no secret.
import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';

const HOME = process.env.HOME;
const wantJson = process.argv.includes('--json');
const cfgArg = process.argv.indexOf('--config');
if (cfgArg !== -1 && !process.argv[cfgArg + 1]) { console.error('store-status: --config needs a path'); process.exit(2); }
const cfgPath = cfgArg === -1 ? `${HOME}/.config/nadavai/store-apps.json` : process.argv[cfgArg + 1];
if (cfgArg !== -1 && !existsSync(cfgPath)) { console.error(`store-status: no config at ${cfgPath}`); process.exit(2); }
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const envFile = (p) => Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^['"]|['"]$/g, '')]));

// ---- App Store Connect
const asc = envFile(`${HOME}/.claude/secrets/sporchat-asc.env`);
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'ES256', kid: asc.ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: asc.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
const ascToken = `${unsigned}.${createSign('SHA256').update(unsigned).sign({ key: readFileSync(asc.ASC_KEY_PATH.replace(/^~/, HOME)), dsaEncoding: 'ieee-p1363' }, 'base64url')}`;
const ascGet = async (path) => {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${ascToken}` } });
  if (!r.ok) throw new Error(`ASC ${path} -> ${r.status}`);
  return r.json();
};

// ---- Google Play
const saPath = process.env.PLAY_SA_KEY || `${HOME}/.claude/secrets/play-publisher-service-account.json`;
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
const PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
async function playToken() {
  const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(u).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${u}.${sig}` }) });
  return (await r.json()).access_token;
}
const pTok = await playToken();
async function playProduction(pkg) {
  const h = { Authorization: `Bearer ${pTok}` };
  const e = await fetch(`${PLAY}/applications/${pkg}/edits`, { method: 'POST', headers: h });
  if (!e.ok) return { error: `${e.status}` };
  const { id } = await e.json();
  try {
    const t = await fetch(`${PLAY}/applications/${pkg}/edits/${id}/tracks/production`, { headers: h });
    if (!t.ok) return { release: null };
    const rel = ((await t.json()).releases || [])[0];
    return { release: rel ? { name: rel.name, status: rel.status, codes: rel.versionCodes } : null };
  } finally { await fetch(`${PLAY}/applications/${pkg}/edits/${id}`, { method: 'DELETE', headers: h }); }
}
const playPage = async (pkg) => (await fetch(`https://play.google.com/store/apps/details?id=${pkg}&hl=en`, { headers: { 'user-agent': 'Mozilla/5.0' } })).status;

// ---- collect
const apps = (await ascGet('/v1/apps?limit=200&fields[apps]=name,bundleId')).data;
const rows = [];
for (const a of apps) {
  const { name, bundleId } = a.attributes;
  const vres = await ascGet(`/v1/apps/${a.id}/appStoreVersions?limit=5&include=build&fields[appStoreVersions]=versionString,appStoreState,createdDate,build&fields[builds]=expired`);
  const expiredBuilds = new Set((vres.included || []).filter((b) => b.type === 'builds' && b.attributes?.expired).map((b) => b.id));
  const versions = vres.data
    .map((v) => ({ ...v.attributes, buildExpired: expiredBuilds.has(v.relationships?.build?.data?.id) }))
    .sort((x, y) => y.createdDate.localeCompare(x.createdDate));
  let territories = null;
  try {
    const av = (await ascGet(`/v1/apps/${a.id}/appAvailabilityV2`)).data.id;
    territories = (await ascGet(`/v2/appAvailabilities/${av}/territoryAvailabilities?limit=200&fields[territoryAvailabilities]=available`)).data.filter((t) => t.attributes.available).length;
  } catch { /* no availability set yet */ }
  const lookups = await Promise.all(['il', 'us'].map(async (c) => (await (await fetch(`https://itunes.apple.com/lookup?bundleId=${bundleId}&country=${c}`)).json()).resultCount));
  const publicIos = lookups.some((n) => n > 0);
  const newest = versions[0] || {};
  // A review never starts on an expired build (2026-11-11: two apps sat 4.5 days in WAITING_FOR_REVIEW).
  const expiredNote = newest.buildExpired ? ' (attached build EXPIRED: upload a new build)' : '';
  const iosState = /WAITING_FOR_REVIEW/.test(newest.appStoreState) ? `WAITING FOR REVIEW ${newest.versionString}${expiredNote}`
    : /IN_REVIEW/.test(newest.appStoreState) ? `IN REVIEW ${newest.versionString}${expiredNote}`
    : /REJECTED|UNRESOLVED/.test(newest.appStoreState) ? `REJECTED ${newest.versionString}`
    : /PREPARE/.test(newest.appStoreState) ? `DRAFT ${newest.versionString}`
    : publicIos ? `LIVE ${newest.versionString}`
    : territories === 0 ? `OFF SALE (0 territories) ${newest.versionString}` : `NOT PUBLIC ${newest.versionString} ${newest.appStoreState}`;
  const pkg = cfg.apps?.[bundleId]?.play || bundleId;
  rows.push({ name, bundleId, ios: iosState, iosPublic: publicIos, territories, play: { pkg } });
}
for (const pkg of cfg.playOnly || []) rows.push({ name: pkg, bundleId: null, ios: '-', iosPublic: false, territories: null, play: { pkg } });
for (const r of rows) {
  const [prod, page] = await Promise.all([playProduction(r.play.pkg), playPage(r.play.pkg)]);
  r.play = {
    pkg: r.play.pkg, page, public: page === 200,
    state: prod.error ? `NO PLAY APP (${prod.error})` : !prod.release ? 'NO PRODUCTION RELEASE'
      : page === 200 && prod.release.status === 'completed' ? `LISTED; production ${prod.release.name} completed (published or held for Publish: see Publishing overview)`
      : prod.release.status === 'draft' ? `DRAFT ${prod.release.name}`
      : `PENDING: release ${prod.release.status}, public page ${page} ${prod.release.name}`,
  };
}
if (wantJson) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(`${r.name}\n  iOS      ${r.ios}${r.territories === null ? '' : `   (on sale in ${r.territories} territories)`}\n  Android  ${r.play.state}   [${r.play.pkg}]`);
