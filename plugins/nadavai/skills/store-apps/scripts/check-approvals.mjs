// Read-only check of the platform approvals ledgers (references/approvals.md). Writes and submits nothing.
//   node check-approvals.mjs [--asc] [--play] [ledger.json ...]
// Ledgers: the files given, else every *.json in ${STORE_APPROVALS_DIR:-~/Documents/store-approvals}.
// --asc  per app with stores.apple.appId: last versions and states, availability, demo account set or not
//        (GET only, through asc.mjs beside this file)
// --play per app with stores.google.package: tracks and releases (play.mjs tracks: an edit opened and
//        deleted, never committed)
// Prints no secret. Exit 0 when nothing is flagged, 1 when an item needs attention, 2 on a usage error.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
for (const a of args) if (a.startsWith('--') && !['--asc', '--play'].includes(a)) { console.error(`unknown flag ${a}`); process.exit(2); }
const withAsc = args.includes('--asc'), withPlay = args.includes('--play');
const dir = process.env.STORE_APPROVALS_DIR || join(process.env.HOME, 'Documents', 'store-approvals');
let files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  if (!existsSync(dir)) { console.error(`no ledgers: ${dir} does not exist (references/approvals.md, step 1)`); process.exit(2); }
  files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f));
}

const DAY = 86400000, today = new Date(new Date().toISOString().slice(0, 10)).getTime();
const days = (iso) => Math.round((new Date(iso).getTime() - today) / DAY);
let flagged = 0;
const flag = (line) => { flagged++; console.log(`  ! ${line}`); };

function asc(path) {
  const out = execFileSync('node', [join(HERE, 'asc.mjs'), 'GET', path], { encoding: 'utf8', maxBuffer: 64e6 });
  const nl = out.indexOf('\n');
  const status = out.slice(0, nl), body = out.slice(nl + 1).trim();
  if (status !== '200') throw new Error(`ASC GET ${path.split('?')[0]}: HTTP ${status}`);
  return JSON.parse(body);
}

function ascSummary(appId) {
  const versions = asc(`/v1/apps/${appId}/appStoreVersions?limit=3&fields[appStoreVersions]=versionString,appStoreState,releaseType,platform`).data;
  for (const v of versions) console.log(`    asc version ${v.attributes.versionString} ${v.attributes.platform} ${v.attributes.appStoreState} release ${v.attributes.releaseType}`);
  const latest = versions[0];
  if (latest) {
    let detail = null;
    try { detail = asc(`/v1/appStoreVersions/${latest.id}/appStoreReviewDetail`).data?.attributes; } catch { /* none yet */ }
    const demo = detail ? `demo account required ${detail.demoAccountRequired === true}, user set ${Boolean(detail.demoAccountName)}, password set ${detail.demoAccountPassword === '<set>'}` : 'no review detail';
    console.log(`    asc review detail (${latest.attributes.versionString}): ${demo}`);
    if (detail?.demoAccountRequired && (!detail.demoAccountName || detail.demoAccountPassword !== '<set>')) flag('ASC: a demo account is required but its user or password is not set');
  }
  let available = 0, total = 0, path = `/v2/appAvailabilities/${appId}/territoryAvailabilities?limit=200&fields[territoryAvailabilities]=available`;
  try {
    for (let n = 0; path && n < 5; n++) {
      const page = asc(path);
      for (const t of page.data) { total++; if (t.attributes.available) available++; }
      path = page.links?.next ? page.links.next.replace('https://api.appstoreconnect.apple.com', '') : null;
    }
    console.log(`    asc availability: ${available} of ${total} territories`);
    if (available === 0) flag('ASC: available in no territory (shows "Removed from App Store" once a version is out)');
  } catch (error) {
    console.log(`    asc availability: none set up (${error.message})`);
    flag('ASC: no availability set up');
  }
}

function playSummary(pkg) {
  const out = execFileSync('node', [join(HERE, 'play.mjs'), 'tracks', pkg], { encoding: 'utf8' });
  for (const t of JSON.parse(out) ?? []) {
    const rel = (t.releases ?? []).map((r) => `${r.status}${r.versionCodes ? ` ${r.versionCodes.join(',')}` : ''}${r.userFraction ? ` ${r.userFraction}` : ''}`).join('; ');
    console.log(`    play ${t.track}: ${rel || 'no release'}`);
  }
}

for (const file of files) {
  let ledger;
  try { ledger = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { console.log(`${file}: unreadable (${error.message})`); flagged++; continue; }
  console.log(`${ledger.kind ?? '?'} ${ledger.name ?? file}`);
  for (const item of ledger.items ?? []) {
    const parts = [item.id, item.status ?? 'unknown'];
    if (item.renew) parts.push(`renew ${item.renew} (${days(item.renew)} d)`);
    if (item.checked) parts.push(`checked ${item.checked}`);
    if (item.reviewer) parts.push(`reviewer ${item.reviewer}`);
    console.log(`  ${parts.join('  ')}`);
    if (!['approved', 'n/a'].includes(item.status)) flag(`${item.id}: status ${item.status ?? 'unknown'}${item.notes ? ` (${item.notes})` : ''}`);
    if (item.renew && days(item.renew) <= 30) flag(`${item.id}: renew by ${item.renew}`);
    if (!item.checked || days(item.checked) < -90) flag(`${item.id}: last checked ${item.checked ?? 'never'}`);
  }
  try {
    if (withAsc && ledger.stores?.apple?.appId) ascSummary(ledger.stores.apple.appId);
    if (withPlay && ledger.stores?.google?.package) playSummary(ledger.stores.google.package);
  } catch (error) {
    flag(`API read failed: ${error.message.split('\n')[0]}`);
  }
}
console.log(flagged ? `${flagged} item(s) need attention` : 'nothing flagged');
process.exit(flagged ? 1 : 0);
