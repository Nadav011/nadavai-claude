#!/usr/bin/env node
// orca-rtl patch engine: makes Hebrew/RTL render correctly in Orca's DOM-rendered
// terminal pane (xterm vendored DOM renderer). Two surgical edits to the renderer
// asset that owns the vendored xterm DomRendererRowFactory:
//   1. CSS:  .xterm-rows > div { unicode-bidi: plaintext; }   (per-row auto base dir)
//   2. createRow(): for any row containing RTL chars, set its spans display:inline
//      so the row's plaintext bidi paragraph reorders runs via the browser's native
//      Unicode Bidi Algorithm (Hebrew RTL; English + numbers stay LTR-correct).
// Mobile/web also gets a cache-busting query on JS/CSS references because Orca
// serves /assets/* as immutable for a year; without this, paired phones can keep
// using the pre-patch terminal bundle.
// Idempotent. Re-run after an Orca update. Requires passwordless sudo for install.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
// @electron/asar is needed only for the old packed layout (Orca <= ~1.4.23x). It is
// loaded lazily from ~/.local/share/orca-rtl/node_modules, so the current unpacked
// layout runs with no install step.
let asar = null;
function loadAsar() {
  if (asar) return asar;
  const req = createRequire(path.join(os.homedir(), '.local/share/orca-rtl/node_modules/'));
  try { asar = req('@electron/asar'); }
  catch { throw new Error('old Orca layout needs @electron/asar: npm i --prefix ~/.local/share/orca-rtl @electron/asar'); }
  return asar;
}

// ORCA_RTL_ROOT / ORCA_RTL_DATA exist so a new Orca build can be tried on a copy
// (a scratch tree) before it is installed; the defaults are the real install.
const ROOT = process.env.ORCA_RTL_ROOT || '/opt/Orca';
const DATA = process.env.ORCA_RTL_DATA || path.join(os.homedir(), '.local/share/orca-rtl');
const ASAR = ROOT + '/resources/app.asar';
const BACKUP = ASAR + '.rtl-backup';
// Original unpack set on this install: these dirs fully unpacked, plus 2 named
// out/main files and out/package.json (added on v1.4.114 -- the build now unpacks
// this one so Node's own module resolution can find it without reaching into the
// asar); everything else (incl. out/renderer) packed. `**/out/package.json` (not
// bare `package.json`) so the match stays selective -- the repo also ships a root
// package.json that must stay packed, matching the original unpack set exactly.
const UNPACK_DIR = '{out/cli,out/shared,resources,out/main/chunks,out/main/agent-hooks}';
const UNPACK_FILE = '{computer-sidecar.js,daemon-entry.js,**/out/package.json,**/out/main/parcel-watcher-process-entry.js}';

const CSS_FIND = '.xterm-rows span { display: inline-block; height: 100%; vertical-align: top;}`;';
const CSS_REPL = '.xterm-rows span { display: inline-block; height: 100%; vertical-align: top;}${this._terminalSelector} .xterm-rows > div { unicode-bidi: plaintext; }`;';
// The RTL-reorder IIFE, parameterised by the spans-array variable name.
function rtlClosure(arr) {
  return '(() => { if (' + arr + '.length > 1) { let _rtl = false; for (let _s = 0; _s < ' + arr + '.length && !_rtl; _s++) { let _tc = ' + arr + '[_s].textContent; if (_tc) for (let _i = 0; _i < _tc.length; _i++) { let _cc = _tc.charCodeAt(_i); if (_cc >= 1424 && _cc <= 2303 || _cc >= 64285 && _cc <= 65023 || _cc >= 65136 && _cc <= 65279) { _rtl = true; break; } } } if (_rtl) for (let _s = 0; _s < ' + arr + '.length; _s++) ' + arr + '[_s].style.display = "inline"; } })()';
}
// DomRendererRowFactory.createRow's tail-return statement, matched by STRUCTURE, not
// by literal minified variable names: `return X && Y && (X.textContent = Z), W`.
// Every Orca rebuild (and each of the renderer/web bundles within one build) can
// re-minify these to different short identifiers -- e.g. I3/w3/L2/p2 one day,
// A/D/R/S the next. That variable-name churn is exactly what broke this patch on
// v1.4.114 (the old WEB_RET_FIND was a fixed string). Matching the shape instead
// of the names survives that churn across future auto-updates too.
const RET_REGEX = /(return\s+([A-Za-z_$][\w$]*)\s*&&\s*([A-Za-z_$][\w$]*)\s*&&\s*\(\s*\2\s*\.textContent\s*=\s*([A-Za-z_$][\w$]*)\s*\))\s*,\s*([A-Za-z_$][\w$]*)/;
// --- native-chat RTL -------------------------------------------------------
// Orca's native chat view renders the agent transcript as real DOM (not xterm),
// so Hebrew there needs no renderer surgery -- only bidi CSS. `unicode-bidi:
// plaintext` gives each paragraph its direction from its own first strong
// character, exactly like the HTML `dir="auto"` attribute: Hebrew paragraphs
// reorder RTL, English ones stay LTR, in the same conversation. Code keeps an
// explicit LTR isolate so a Hebrew sentence around it can never reorder it.
// Appended to the largest stylesheet in each asset dir (the app's own bundle);
// guarded by a marker so re-runs no-op. Not affected by terminalGpuAcceleration.
const CHAT_CSS_MARK = '/* orca-rtl-chat */';
const CHAT_CSS = CHAT_CSS_MARK + '\n' +
  '[data-native-chat-root] p,[data-native-chat-root] li,[data-native-chat-root] h1,[data-native-chat-root] h2,' +
  '[data-native-chat-root] h3,[data-native-chat-root] h4,[data-native-chat-root] h5,[data-native-chat-root] h6,' +
  '[data-native-chat-root] blockquote,[data-native-chat-root] td,[data-native-chat-root] th,[data-native-chat-root] dd,' +
  '[data-native-chat-root] dt,[data-native-chat-root] summary,[data-native-chat-root] textarea,' +
  '[data-native-chat-root] input{unicode-bidi:plaintext}\n' +
  '[data-native-chat-root] pre,[data-native-chat-root] pre *,[data-native-chat-root] code,' +
  '[data-native-chat-root] kbd,[data-native-chat-root] samp{direction:ltr;unicode-bidi:isolate;text-align:left}\n';

// Append the chat bidi rules to the biggest stylesheet in `assetsDir` (the app
// bundle's own CSS; the smaller ones are lazy-route chunks). Returns edits made.
function patchChatCss(assetsDir, assetName) {
  const sheets = fs.readdirSync(assetsDir)
    .filter(f => f.endsWith('.css'))
    .map(f => ({ p: path.join(assetsDir, f), size: fs.statSync(path.join(assetsDir, f)).size }))
    .sort((a, b) => b.size - a.size);
  if (!sheets.length) {
    // Non-fatal: never fail the terminal patch over the chat stylesheet.
    console.log('[orca-rtl] ' + assetName + ' chat-css: no stylesheet found, skipped');
    return 0;
  }
  const target = sheets[0].p;
  const txt = fs.readFileSync(target, 'utf8');
  if (txt.includes(CHAT_CSS_MARK)) {
    console.log('[orca-rtl] ' + assetName + ' chat-css: already present (' + path.basename(target) + ')');
    return 0;
  }
  fs.writeFileSync(target, txt + '\n' + CHAT_CSS);
  console.log('[orca-rtl] ' + assetName + ' chat-css: appended to ' + path.basename(target));
  return 1;
}

const WEB_CACHE_BUST = 'orca-rtl=1';
const WEB_CACHE_BUST_RE = /(\.\/[^"'`)\s]+?\.(?:js|css))(?!\?orca-rtl=)/g;

// Each asset to patch: just a dir under the extracted tree. CSS_FIND/CSS_REPL and
// RET_REGEX are both build-agnostic (structural), so no per-asset find/repl pair is
// needed -- the target file and its current variable names are re-discovered fresh
// on every run.
const ASSETS = [
  { name: 'renderer', dir: 'out/renderer/assets' },
  { name: 'web', dir: 'out/web/assets' },
];

function unpackedList(arch) {
  const { headerString } = loadAsar().getRawHeader(arch);
  const h = JSON.parse(headerString); const out = [];
  (function w(n, p) { if (n.files) for (const [k, c] of Object.entries(n.files)) w(c, p ? p + '/' + k : k); else if (n.unpacked) out.push(p); })(h, '');
  return out.sort();
}

function addWebCacheBust(text) {
  return text.replace(WEB_CACHE_BUST_RE, '$1?' + WEB_CACHE_BUST);
}

function patchWebFile(file) {
  const before = fs.readFileSync(file, 'utf8');
  const after = addWebCacheBust(before);
  if (after === before) return 0;
  fs.writeFileSync(file, after);
  return 1;
}

function patchWebMobileCache(src) {
  const webRoot = path.join(src, 'out/web');
  const assetsDir = path.join(webRoot, 'assets');
  const html = path.join(webRoot, 'web-index.html');
  if (!fs.existsSync(html)) throw new Error('web index not found: out/web/web-index.html');
  if (!fs.existsSync(assetsDir)) throw new Error('web assets dir not found: out/web/assets');

  let filesChanged = patchWebFile(html);
  for (const f of fs.readdirSync(assetsDir)) {
    if (f.endsWith('.js')) filesChanged += patchWebFile(path.join(assetsDir, f));
  }
  if (filesChanged) console.log('[orca-rtl] web/mobile cache-bust: updated ' + filesChanged + ' file(s) with ?' + WEB_CACHE_BUST);
  else console.log('[orca-rtl] web/mobile cache-bust: already present');
  return filesChanged;
}

// --- unpacked layout (Orca >= ~1.4.24x) --------------------------------------
// Newer Orca builds ship out/renderer and out/mobile-web as plain files under
// app.asar.unpacked (the asar is ~8 MB instead of ~75 MB), and the app has
// EnableEmbeddedAsarIntegrityValidation off, so the assets can be edited in place:
// no extract/repack, no unpack-set gate. Originals are copied once per Orca version
// to ~/.local/share/orca-rtl/backup-<version>/ (orca-rtl-remove restores them).
const UNPACKED = ASAR + '.unpacked';
// mobile-web has no cache-bust (`unbust`): the phone keys its cache on the manifest's
// buildId, and a bust in a bundle changes module-map keys for nothing. Earlier runs
// busted it (1.4.247: 45 keys in one asset), so those marks are stripped again.
const UNPACKED_ASSETS = [
  { name: 'renderer', dir: 'out/renderer/assets' },
  { name: 'mobile-web', dir: 'out/mobile-web/assets', unbust: 'out/mobile-web/index.html' },
  { name: 'web', dir: 'out/web/assets', html: 'out/web/web-index.html' },
];
// Asset dirs that live as plain files beside the asar on this install. A repack never
// reaches them (only app.asar is installed), so they are always patched in place.
// Before this, 1.4.229 (web + mobile-web unpacked) re-patched out/web inside every
// extract, repacked, renamed app.asar, and so re-triggered orca-rtl-reapply.path.
function liveUnpackedAssets() {
  return UNPACKED_ASSETS.filter(a => fs.existsSync(path.join(UNPACKED, a.dir)));
}
function orcaVersion() {
  try { const v = JSON.parse(fs.readFileSync(path.join(UNPACKED, 'out/package.json'), 'utf8')).version; if (v) return v; } catch { /* fall through */ }
  try { return execFileSync(ROOT + '/orca-ide', ['--version'], { encoding: 'utf8', timeout: 20000 }).trim().split(/\s+/).pop(); }
  catch { return 'unknown'; }
}

// --- mobile-web manifest ------------------------------------------------------
// The phone checks every mobile-web asset against out/mobile-web/manifest.json (sha256 and
// byteLength per asset, totalBytes, and buildId = sha256 of the path-sorted asset list),
// and the desktop itself refuses to serve a file whose bytes differ from its entry
// (rpc error mobile_web_bundle_asset_changed). Editing an asset without updating the
// manifest therefore stops the phone from installing the page bundle: "cannot run the
// latest update from the computer" (found 2026-11-09 on 1.4.247, 2 of 181 assets stale).
// This brings the manifest back in line with the files, and is a no-op when it already is.
const sha256hex = buf => createHash('sha256').update(buf).digest('hex');
function mobileBundleId(assets) {
  // Same canonical form as shared/mobile-web-bundle/manifest-contract.js (code-unit order).
  const list = [...assets].sort((x, y) => (x.path === y.path ? 0 : x.path < y.path ? -1 : 1))
    .map(a => ({ path: a.path, sha256: a.sha256, byteLength: a.byteLength, contentType: a.contentType }));
  return sha256hex(Buffer.from(JSON.stringify(list), 'utf8'));
}
// Same ceilings as manifest-contract.js: past them the desktop drops the whole manifest.
const MOBILE_MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MOBILE_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MOBILE_MAX_ASSETS = 256;
// '' when the manifest is one we can safely re-sign (or there is none); otherwise why not. Checked
// BEFORE any file is written, so an Orca release with an unfamiliar manifest leaves mobile-web
// untouched (pristine and consistent) instead of failing after the renderer was already patched.
function mobileManifestProblem() {
  const mf = path.join(UNPACKED, 'out/mobile-web/manifest.json');
  if (!fs.existsSync(mf)) return '';
  try {
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (m.schemaVersion !== 1 || m.entrypoint !== 'index.html' || !Array.isArray(m.assets)) return 'unfamiliar schema';
    if (m.assets.length < 1 || m.assets.length > MOBILE_MAX_ASSETS) return 'unexpected asset count ' + m.assets.length;
    if (!m.assets.some(a => a.path === m.entrypoint)) return 'entrypoint is not listed';
    if (m.assets.some((a, i) => i > 0 && !(a.path > m.assets[i - 1].path))) return 'assets are not sorted by path';
    if (mobileBundleId(m.assets) !== m.buildId) return 'buildId is not the hash of its own asset list';
    return '';
  } catch (e) { return 'unreadable (' + e.message + ')'; }
}
function syncMobileManifest({ check = false } = {}) {
  const root = path.join(UNPACKED, 'out/mobile-web');
  const mf = path.join(root, 'manifest.json');
  if (!fs.existsSync(mf)) { console.log('[orca-rtl] mobile-web manifest: none on this install, skipped'); return 0; }
  const problem = mobileManifestProblem();
  if (problem && !check) throw new Error('mobile-web manifest not handled: ' + problem);
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  // A read-only check of a manifest we cannot re-sign still compares files with entries.
  if (problem) console.warn('[orca-rtl] note: manifest not re-signable (' + problem + '); checking file hashes only');
  if (!Array.isArray(m.assets)) return 0;
  const stale = [];
  let total = 0;
  for (const a of m.assets) {
    const file = path.resolve(root, a.path);
    if (!file.startsWith(root + path.sep)) throw new Error('mobile-web manifest: asset path escapes the bundle: ' + a.path);
    const buf = fs.readFileSync(file);
    total += buf.length;
    if (buf.length > MOBILE_MAX_ASSET_BYTES) throw new Error('mobile-web manifest: ' + a.path + ' is over the ' + MOBILE_MAX_ASSET_BYTES + '-byte asset ceiling');
    const sha = sha256hex(buf);
    if (sha !== a.sha256 || buf.length !== a.byteLength) { stale.push(a.path); a.sha256 = sha; a.byteLength = buf.length; }
  }
  if (total > MOBILE_MAX_TOTAL_BYTES) throw new Error('mobile-web manifest: bundle is over the ' + MOBILE_MAX_TOTAL_BYTES + '-byte total ceiling');
  if (!stale.length && total === m.totalBytes) { console.log('[orca-rtl] mobile-web manifest: in sync (' + m.assets.length + ' assets)'); return 0; }
  if (check) { console.log('[orca-rtl] mobile-web manifest: OUT OF SYNC (' + stale.length + ' asset(s): ' + stale.map(p => path.basename(p).slice(0, 10)).join(', ') + ')'); return stale.length || 1; }
  m.totalBytes = total;
  m.buildId = mobileBundleId(m.assets);
  const bak = path.join(DATA, 'backup-' + orcaVersion(), path.relative(UNPACKED, mf));
  if (!fs.existsSync(bak)) { fs.mkdirSync(path.dirname(bak), { recursive: true }); fs.copyFileSync(mf, bak); }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-rtl-mf-'));
  try {
    const tmp = path.join(work, 'manifest.json');
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n');
    execFileSync('sudo', ['install', '-m', '644', tmp, mf + '.orca-rtl-new']);
    execFileSync('sudo', ['mv', '-f', mf + '.orca-rtl-new', mf]);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  if (syncMobileManifest({ check: true }) !== 0) throw new Error('mobile-web manifest: still out of sync after the rewrite');
  console.log('[orca-rtl] mobile-web manifest: updated ' + stale.length + ' asset(s), new buildId ' + m.buildId.slice(0, 12));
  return 0;
}
function editTerminal(txt) {
  let did = 0;
  if (txt.includes(CSS_FIND) && !txt.includes('unicode-bidi: plaintext')) { txt = txt.replace(CSS_FIND, CSS_REPL); did++; }
  if (!txt.includes('_rtl = true')) {
    const m = txt.match(RET_REGEX);
    if (m) { txt = txt.slice(0, m.index) + m[1] + ', ' + rtlClosure(m[5]) + ', ' + m[5] + txt.slice(m.index + m[0].length); did++; }
  }
  return { txt, did };
}
function patchUnpacked(assets) {
  const backupDir = path.join(DATA, 'backup-' + orcaVersion());
  // An unfamiliar mobile-web manifest means we cannot keep it consistent with an edited asset,
  // so leave mobile-web alone (the desktop renderer is still patched) and say so loudly.
  const mobileProblem = mobileManifestProblem();
  const syncMobile = (opts) => (mobileProblem ? 0 : syncMobileManifest(opts));
  if (mobileProblem) {
    console.warn('[orca-rtl] WARNING: phone bundle left unpatched, its manifest.json is not one this patch can re-sign: ' + mobileProblem);
    assets = assets.filter(a => a.name !== 'mobile-web');
  }
  const writes = []; // { file, txt }
  for (const a of assets) {
    const dir = path.join(UNPACKED, a.dir);
    if (!fs.existsSync(dir)) throw new Error('assets dir not found: ' + dir);
    const js = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    let target = null;
    for (const f of js) {
      const t = fs.readFileSync(path.join(dir, f), 'utf8');
      if ((t.includes('unicode-bidi: plaintext') && t.includes('_rtl = true')) || (t.includes(CSS_FIND.slice(0, 40)) && RET_REGEX.test(t))) { target = path.join(dir, f); break; }
    }
    if (!target) throw new Error('could not locate the xterm DOM-renderer asset in ' + dir);
    const { txt, did } = editTerminal(fs.readFileSync(target, 'utf8'));
    if (did) { if (did !== 2) throw new Error('only ' + did + '/2 terminal edits matched in ' + target); writes.push({ file: target, txt }); }
    console.log('[orca-rtl] ' + a.name + ' terminal (' + path.basename(target) + '): ' + (did ? 'will apply ' + did + ' edit(s)' : 'already patched'));
    const sheets = fs.readdirSync(dir).filter(f => f.endsWith('.css'))
      .map(f => ({ p: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size })).sort((x, y) => y.size - x.size);
    if (sheets.length) {
      const css = fs.readFileSync(sheets[0].p, 'utf8');
      if (!css.includes(CHAT_CSS_MARK)) writes.push({ file: sheets[0].p, txt: css + '\n' + CHAT_CSS });
      console.log('[orca-rtl] ' + a.name + ' chat-css (' + path.basename(sheets[0].p) + '): ' + (css.includes(CHAT_CSS_MARK) ? 'already present' : 'will append'));
    }
    if (a.html) {
      // Phones cache /assets/* as immutable: bust references so they fetch the patched bundle.
      const files = [path.join(UNPACKED, a.html), ...js.map(f => path.join(dir, f))];
      let n = 0;
      for (const f of files) {
        const pending = writes.find(w => w.file === f);
        const before = pending ? pending.txt : fs.readFileSync(f, 'utf8');
        const after = addWebCacheBust(before);
        if (after !== before) { if (pending) pending.txt = after; else writes.push({ file: f, txt: after }); n++; }
      }
      console.log('[orca-rtl] ' + a.name + ' cache-bust: ' + (n ? n + ' file(s)' : 'already present'));
    } else if (a.unbust) {
      const files = [path.join(UNPACKED, a.unbust), ...js.map(f => path.join(dir, f))];
      let n = 0;
      for (const f of files) {
        const pending = writes.find(w => w.file === f);
        const before = pending ? pending.txt : fs.readFileSync(f, 'utf8');
        if (!before.includes('?' + WEB_CACHE_BUST)) continue;
        const after = before.split('?' + WEB_CACHE_BUST).join('');
        if (pending) pending.txt = after; else writes.push({ file: f, txt: after });
        n++;
      }
      console.log('[orca-rtl] ' + a.name + ' cache-bust marks removed: ' + (n ? n + ' file(s)' : 'none present'));
    }
  }
  if (!writes.length) {
    console.log('[orca-rtl] nothing to change (already patched). Done.');
    // A dry run only reports; a real run also repairs a manifest left stale by an older patch.
    syncMobile({ check: !!process.env.ORCA_RTL_DRY });
    return;
  }
  if (process.env.ORCA_RTL_DRY) {
    for (const w of writes) console.log('[orca-rtl] DRY would write ' + path.relative(UNPACKED, w.file) + ' (' + (Buffer.byteLength(w.txt) - fs.statSync(w.file).size) + ' bytes added)');
    return;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-rtl-'));
  try {
    for (const w of writes) {
      const rel = path.relative(UNPACKED, w.file);
      const bak = path.join(backupDir, rel);
      if (!fs.existsSync(bak)) { fs.mkdirSync(path.dirname(bak), { recursive: true }); fs.copyFileSync(w.file, bak); }
      const tmp = path.join(work, path.basename(w.file));
      fs.writeFileSync(tmp, w.txt);
      // install to a sibling then rename, so a running Orca never reads a half-written file
      execFileSync('sudo', ['install', '-m', '644', tmp, w.file + '.orca-rtl-new']);
      execFileSync('sudo', ['mv', '-f', w.file + '.orca-rtl-new', w.file]);
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  console.log('[orca-rtl] patched ' + writes.length + ' file(s) in place; originals in ' + backupDir);
  syncMobile();
  // Orca caches the manifest and every asset check for the life of its main process, so the
  // phone only sees a repaired bundle after Orca is quit completely and started again.
  console.log('[orca-rtl] DONE. Quit Orca completely and start it again (a window reload keeps the old phone bundle). NOTE: requires terminal GPU acceleration = OFF (DOM renderer).');
}

async function main() {
  // Read-only: exit 1 when the phone bundle's manifest does not match the files on disk.
  if (process.argv.includes('--check-manifest')) process.exit(syncMobileManifest({ check: true }) ? 1 : 0);
  const live = liveUnpackedAssets();
  if (live.some(a => a.name === 'renderer')) return patchUnpacked(live);
  if (!fs.existsSync(ASAR)) throw new Error('asar not found: ' + ASAR);
  // ensure backup exists (one-time, of the pristine asar)
  if (!fs.existsSync(BACKUP)) {
    console.log('[orca-rtl] creating backup at ' + BACKUP);
    execFileSync('sudo', ['cp', ASAR, BACKUP]);
  }
  const origUnpacked = JSON.stringify(unpackedList(ASAR));

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-rtl-'));
  const src = path.join(work, 'src');
  console.log('[orca-rtl] extracting...');
  loadAsar().extractAll(ASAR, src);

  // Patch every build (desktop renderer + web). Each edit is independently
  // idempotent per asset, so an already-patched build no-ops while an unpatched
  // one still gets the edits this run.
  let total = 0;
  let anyAlreadyPatched = false;
  for (const a of ASSETS) {
    if (live.some(u => u.dir === a.dir)) { console.log('[orca-rtl] ' + a.name + ': unpacked on this install, patched in place below'); continue; }
    const assetsDir = path.join(src, a.dir);
    if (!fs.existsSync(assetsDir)) throw new Error('assets dir not found: ' + a.dir);
    const candidates = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
    let target = null;
    for (const f of candidates) {
      const p = path.join(assetsDir, f);
      const t = fs.readFileSync(p, 'utf8');
      if (t.includes('unicode-bidi: plaintext') && t.includes('_rtl = true')) { target = p; anyAlreadyPatched = true; console.log('[orca-rtl] ' + a.name + ' already patched: ' + f); break; }
      if (t.includes(CSS_FIND.slice(0, 40)) && RET_REGEX.test(t)) { target = p; break; }
    }
    if (!target) throw new Error('could not locate the xterm DOM-renderer asset to patch in ' + a.dir);

    let txt = fs.readFileSync(target, 'utf8');
    let did = 0;
    if (txt.includes(CSS_FIND) && !txt.includes('unicode-bidi: plaintext')) { txt = txt.replace(CSS_FIND, CSS_REPL); did++; }
    if (!txt.includes('_rtl = true')) {
      const m = txt.match(RET_REGEX);
      if (m) {
        const repl = m[1] + ', ' + rtlClosure(m[5]) + ', ' + m[5];
        txt = txt.slice(0, m.index) + repl + txt.slice(m.index + m[0].length);
        did++;
      }
    }
    if (did) fs.writeFileSync(target, txt);
    console.log('[orca-rtl] ' + a.name + ' (' + path.basename(target) + '): applied ' + did + ' edit(s)');
    total += did;
    total += patchChatCss(assetsDir, a.name);
  }
  if (!live.some(u => u.dir === 'out/web/assets')) total += patchWebMobileCache(src);
  if (live.length) patchUnpacked(live);
  if (total === 0) { console.log('[orca-rtl] nothing to change (already patched). Done.'); fs.rmSync(work, { recursive: true, force: true }); return; }
  if (process.env.ORCA_RTL_DRY) { console.log('[orca-rtl] DRY: asar would be repacked for ' + total + ' edit(s)'); fs.rmSync(work, { recursive: true, force: true }); return; }

  // No asset carried the patch => this asar is pristine (installs are whole-asar
  // atomic, so mixed state can't occur). Refresh the backup NOW, before install;
  // otherwise `remove` would restore a stale prior version and break Orca.
  if (!anyAlreadyPatched) {
    console.log('[orca-rtl] pristine asar detected — refreshing backup at ' + BACKUP);
    execFileSync('sudo', ['cp', ASAR, BACKUP]);
  }

  const out = path.join(work, 'app.asar.new');
  console.log('[orca-rtl] repacking...');
  await loadAsar().createPackageWithOptions(src, out, { unpackDir: UNPACK_DIR, unpack: UNPACK_FILE });

  // SAFETY GATE: unpacked set must be byte-identical to the original's.
  // Orca updates keep adding files to the unpack set (out/package.json on
  // v1.4.114, parcel-watcher-process-entry.js on v1.4.134), so on a
  // missing-files-only drift, self-heal: repack once more with exact-path
  // globs for the missing files. Anything unpacked that SHOULDN'T be (extras)
  // still aborts — that can't be fixed by adding globs.
  let newUnpacked = JSON.stringify(unpackedList(out));
  if (newUnpacked !== origUnpacked) {
    const orig = JSON.parse(origUnpacked); const got = new Set(JSON.parse(newUnpacked));
    const extras = [...got].filter(f => !orig.includes(f));
    const missing = orig.filter(f => !got.has(f));
    const globUnsafe = missing.filter(f => /[{}*?!\[\]()]/.test(f));
    if (extras.length || globUnsafe.length || !missing.length) {
      fs.rmSync(work, { recursive: true, force: true });
      throw new Error('ABORT: repacked unpack set differs from original — not installing'
        + (extras.length ? ' (extra unpacked: ' + extras.join(', ') + ')' : '')
        + (globUnsafe.length ? ' (glob-unsafe names: ' + globUnsafe.join(', ') + ')' : ''));
    }
    console.log('[orca-rtl] unpack set drifted (new Orca version); self-healing with '
      + missing.length + ' exact file glob(s): ' + missing.join(', '));
    const healed = UNPACK_FILE.slice(0, -1) + ',' + missing.map(f => '**/' + f).join(',') + '}';
    await loadAsar().createPackageWithOptions(src, out, { unpackDir: UNPACK_DIR, unpack: healed });
    newUnpacked = JSON.stringify(unpackedList(out));
    if (newUnpacked !== origUnpacked) {
      fs.rmSync(work, { recursive: true, force: true });
      throw new Error('ABORT: unpack set still differs after self-heal — not installing');
    }
  }
  console.log('[orca-rtl] unpack-set verified identical (' + JSON.parse(origUnpacked).length + ' files)');

  // ORCA_RTL_STAGE_DIR=<dir>: write app.asar.new there and stop (verification runs).
  const stageDir = process.env.ORCA_RTL_STAGE_DIR || '';
  if (stageDir) {
    fs.mkdirSync(stageDir, { recursive: true });
    fs.copyFileSync(out, path.join(stageDir, 'app.asar.new'));
    console.log('[orca-rtl] STAGED only (not installed): ' + path.join(stageDir, 'app.asar.new'));
    fs.rmSync(work, { recursive: true, force: true });
    return;
  }
  // Install atomically: copy beside the target, then rename over it. A running Orca
  // keeps its open handle on the OLD inode, so its not-yet-loaded chunks never read
  // shifted offsets from a half-overwritten file (an in-place `cp` does exactly
  // that). The new asar is picked up at Orca's next launch.
  const staged = ASAR + '.new';
  execFileSync('sudo', ['cp', out, staged]);
  execFileSync('sudo', ['mv', '-f', staged, ASAR]);
  console.log('[orca-rtl] installed patched asar (atomic rename) -> ' + ASAR);
  fs.rmSync(work, { recursive: true, force: true });
  console.log('[orca-rtl] DONE. Restart Orca. NOTE: requires terminal GPU acceleration = OFF (DOM renderer).');
}
main().catch(e => { console.error('[orca-rtl] FAILED:', e.message); process.exit(1); });
