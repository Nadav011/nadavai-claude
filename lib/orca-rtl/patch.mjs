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

const ASAR = '/opt/Orca/resources/app.asar';
const BACKUP = '/opt/Orca/resources/app.asar.rtl-backup';
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
const UNPACKED_ASSETS = [
  { name: 'renderer', dir: 'out/renderer/assets' },
  { name: 'mobile-web', dir: 'out/mobile-web/assets', html: 'out/mobile-web/index.html' },
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
  try { return execFileSync('/opt/Orca/orca-ide', ['--version'], { encoding: 'utf8', timeout: 20000 }).trim().split(/\s+/).pop(); }
  catch { return 'unknown'; }
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
  const backupDir = path.join(os.homedir(), '.local/share/orca-rtl', 'backup-' + orcaVersion());
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
    }
  }
  if (!writes.length) { console.log('[orca-rtl] nothing to change (already patched). Done.'); return; }
  if (process.env.ORCA_RTL_DRY) {
    for (const w of writes) console.log('[orca-rtl] DRY would write ' + path.relative(UNPACKED, w.file) + ' (' + (Buffer.byteLength(w.txt) - fs.statSync(w.file).size) + ' bytes added)');
    return;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-rtl-'));
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
  fs.rmSync(work, { recursive: true, force: true });
  console.log('[orca-rtl] patched ' + writes.length + ' file(s) in place; originals in ' + backupDir);
  console.log('[orca-rtl] DONE. Reload Orca. NOTE: requires terminal GPU acceleration = OFF (DOM renderer).');
}

async function main() {
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
