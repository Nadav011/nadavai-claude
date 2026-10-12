// Capture today's app, one full-page screenshot per screen, for the «היום» columns ({{IMG:<name>}}).
//
// usage: node capture-today.mjs [--config redesign.json] [--theme dark|light] [--pw <playwright/index.mjs>] [name ...]
//        node capture-today.mjs --help
//
// Reads the config's "today" block (README step 2 gives the order of sources; this tool is sources 2 to 4):
//   base_url       where the app answers: its local dev server or a local production build (localhost, 127.0.0.1,
//                  [::1]); a deployed site only with Nadav's recorded approval (approvals) and signed out
//   routes         [{name, path, expect, expect_selector?, wait?, full?}]: paths stay on the base origin. `expect` is
//                  text the right screen shows and a wrong one does not (REQUIRED: a capture is only as good as the
//                  proof that it is the intended page); `full: false` shoots the first screenful only
//   reject         texts that mean a wrong page (the app's offline page, its error boundary): any of them fails
//   allow_origins  further origins the app itself needs (its API, say). Every other request, WebSockets included, is
//                  blocked, reported, and fails the capture: the config is the whole network surface
//   approvals      {"<origin>": "answer N"}: every origin that is not local (a deployed base_url, a remote API in
//                  allow_origins) needs Nadav's answer: exactly «answer N», where row N of DECISIONS-ANSWERED.md (next
//                  to the config) exists and names the origin's host as a whole token
//   local_storage  {key: value} set before every page load: the "seen" keys of first-visit overlays (a prize wheel,
//                  an install prompt) that would otherwise cover the screen. Local base_url only: a value can carry a
//                  session, and a deployed site is captured signed out
//   storage_state  a Playwright storage-state file of a QA session (local base_url only). It holds a live session:
//                  keep it outside the output repo (or in a gitignored folder), never commit it
//   theme, scale   the colour scheme of <name>.png (default: the config's default theme) and the device scale (1)
// Service workers are blocked: a PWA's worker answers a slow navigation with its offline page on the SAME url and
// status 200, which nothing else can see (Green Room, 12.10.2026). The page is walked once top to bottom before the
// shot so lazy images load: to the height it had when the walk began (at most 20000px, 100 steps, 20 s), so an
// infinite feed ends; a page that grew past that is reported as "walk": "truncated". A full-page shot paints fixed elements (a tab bar) once, where the first screenful has
// them; use `full: false` when that misleads. --theme other than the default writes <name>-<theme>.png.
// A failed screen (4xx/5xx, a redirect, a missing `expect`, a `reject` text, any request of its own that was blocked,
// WebSockets included) is not written and moves its old shot to today/.stale/, so
// the build sees it as missing instead of embedding a picture of the wrong screen.
// Exit 0 all written · 1 a screen failed or a request was blocked · 2 a config or argument error (no browser opened).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const opt = { only: [] };
const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
  else opt.only.push(argv[i]);
}
const die = msg => { console.error(msg); process.exit(2); };
const cfgPath = path.resolve(opt.config || 'redesign.json');
const C = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const ROOT = path.dirname(cfgPath);
const T = C.today || {};
if (!T.base_url || !Array.isArray(T.routes) || !T.routes.length) die('the config needs "today": {"base_url", "routes": [{"name", "path", "expect"}]}');
const url = (u, what) => { try { return new URL(u); } catch { return die(`${what} is not a URL: ${u}`); } };
const base = url(T.base_url, 'today.base_url');
if (!/^https?:$/.test(base.protocol)) die(`today.base_url must be http or https: ${base.href}`);
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const isLocal = u => LOCAL.has(u.hostname) || u.hostname.endsWith('.localhost');
const approvals = T.approvals || {};
const allowed = new Set([base.origin]);
for (const o of T.allow_origins || []) allowed.add(url(o, 'today.allow_origins entry').origin);
const unapproved = [...allowed].filter(o => !isLocal(new URL(o)) && !approvals[o]);
if (unapproved.length) die(`not local and not approved by Nadav: ${unapproved.join(', ')}. Record his answer in DECISIONS-ANSWERED.md and add today.approvals {"<origin>": "answer N"} (README step 2).`);
// an approval is a pointer to Nadav's numbered answer, checked against the file, never free text
const answersFile = path.join(ROOT, 'DECISIONS-ANSWERED.md');
for (const o of [...allowed].filter(x => !isLocal(new URL(x)))) {
  const m = /^answer (\d+)$/.exec(String(approvals[o]).trim());
  if (!m) die(`today.approvals["${o}"] must read exactly «answer N» (N = the row in DECISIONS-ANSWERED.md), not «${approvals[o]}»`);
  const rows = fs.existsSync(answersFile) ? fs.readFileSync(answersFile, 'utf8').split('\n').filter(l => new RegExp(`^\\|\\s*${m[1]}\\s*\\|`).test(l)) : [];
  if (!rows.length) die(`today.approvals["${o}"] says answer ${m[1]}, but ${answersFile} has no row ${m[1]}`);
  // the host as a whole token: «myexample.com» does not name «example.com»
  const host = new URL(o).host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!rows.some(l => new RegExp(`(^|[^\\w.-])${host}($|[^\\w.-])`).test(l))) die(`row ${m[1]} of DECISIONS-ANSWERED.md does not name ${new URL(o).host}: it does not approve this origin`);
}
if (!isLocal(base) && T.storage_state) die(`a deployed site is captured signed out only: remove today.storage_state or use a local base_url`);
if (!isLocal(base) && T.local_storage) die(`a deployed site is captured signed out only: today.local_storage can carry a session, remove it or use a local base_url`);
const missingExpect = T.routes.filter(r => typeof r.expect !== 'string' || !r.expect.trim()).map(r => r.name);
if (missingExpect.length) die(`routes without "expect" (text the intended screen shows): ${missingExpect.join(', ')}`);
const names = T.routes.map(r => r.name);
const unknown = opt.only.filter(n => !names.includes(n));
if (unknown.length) die(`unknown screen names: ${unknown.join(', ')} (the config has: ${names.join(', ')})`);
const routes = T.routes.filter(r => !opt.only.length || opt.only.includes(r.name)).map(r => ({ ...r, url: new URL(r.path, base).href }));
const escaped = routes.filter(r => new URL(r.url).origin !== base.origin);
if (escaped.length) die(`routes leave ${base.origin}: ${escaped.map(r => `${r.name} -> ${r.url}`).join(', ')}`);
const pw = opt.pw || process.env.PLAYWRIGHT_MODULE || (C.playwright && path.resolve(ROOT, C.playwright));
if (!pw || !fs.existsSync(pw)) die(`playwright not found (${pw || 'none given'}): pass --pw or set PLAYWRIGHT_MODULE to the app's own copy: <app>/node_modules/playwright/index.mjs (npm), <app>/node_modules/@playwright/test/index.mjs or <app>/node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs (pnpm)`);
const dflt = T.theme || (C.theme && C.theme.default) || 'dark';
const theme = opt.theme || dflt;
const outDir = path.join(ROOT, (C.dirs && C.dirs.today) || 'today');
const { chromium } = await import(pathToFileURL(pw).href);
fs.mkdirSync(outDir, { recursive: true });

const result = { written: [], errors: [], blocked: [], stale: [], remote: isLocal(base) ? null : { origin: base.origin, approval: approvals[base.origin] } };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: T.width || C.phone.width, height: T.height || C.phone.height },
    colorScheme: theme,
    deviceScaleFactor: T.scale || 1,
    serviceWorkers: 'block',
    locale: C.lang === 'he' ? 'he-IL' : undefined,
    ...(T.storage_state ? { storageState: path.resolve(ROOT, T.storage_state) } : {}),
  });
  if (T.local_storage) await ctx.addInitScript(kv => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, T.local_storage);
  // installed before the first navigation: only the base origin and the listed origins are reachable, WebSockets too
  await ctx.routeWebSocket(/.*/, ws => {
    const u = new URL(ws.url());
    const origin = `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
    if (allowed.has(origin)) return ws.connectToServer();
    result.blocked.push(ws.url().slice(0, 160));
    return ws.close();
  });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (/^(data|blob):/.test(u) || allowed.has(new URL(u).origin)) return route.continue();
    result.blocked.push(u.slice(0, 160));
    return route.abort('blockedbyclient');
  });
  const p = await ctx.newPage();
  for (const r of routes) {
    const file = path.join(outDir, theme === dflt ? `${r.name}.png` : `${r.name}-${theme}.png`);
    const blockedBefore = result.blocked.length;
    try {
      const res = await p.goto(r.url, { waitUntil: 'load', timeout: 45000 });
      await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      if (r.wait) await p.waitForTimeout(r.wait);
      if (!res || res.status() >= 400) throw new Error(`HTTP ${res ? res.status() : 'no response'}`);
      const landed = p.url();
      if (landed.replace(/\/$/, '') !== r.url.replace(/\/$/, '')) throw new Error(`landed on ${landed}, not the screen (a login or a redirect)`);
      // walk the page once so lazy images load, then back to the top: the end is fixed when the walk starts and
      // bounded, so an infinite feed cannot keep it going
      const walk = await Promise.race([
        p.evaluate(async () => {
          const end = Math.min(document.documentElement.scrollHeight, 20000);
          const step = Math.max(200, innerHeight / 2);
          let steps = 0;
          for (let y = 0; y < end && steps < 100; y += step, steps++) { scrollTo(0, y); await new Promise(f => setTimeout(f, 120)); }
          scrollTo(0, 0);
          return document.documentElement.scrollHeight > end + innerHeight || steps >= 100 ? 'truncated' : 'complete';
        }),
        new Promise(f => setTimeout(() => f('truncated'), 20000)),
      ]);
      await p.evaluate(() => scrollTo(0, 0));
      await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const text = await p.evaluate(() => document.body ? document.body.innerText : '');
      if (!text.includes(r.expect)) throw new Error(`the expected text «${r.expect}» is not on the page: a wrong screen (an offline or error page?)`);
      if (r.expect_selector && !(await p.locator(r.expect_selector).count())) throw new Error(`the expected element ${r.expect_selector} is not on the page`);
      const bad = (T.reject || []).filter(x => text.includes(x));
      if (bad.length) throw new Error(`the page shows «${bad.join('», «')}»: a known wrong page`);
      // a screen that needed something the fence blocked is not the screen the app shows: it is not written
      if (result.blocked.length > blockedBefore) throw new Error(`blocked requests while loading it: ${result.blocked.slice(blockedBefore).join(', ').slice(0, 160)}`);
      await p.screenshot({ path: file, fullPage: r.full !== false });
      result.written.push({ name: r.name, file: path.relative(ROOT, file), checked: r.expect, walk });
    } catch (e) {
      result.errors.push({ name: r.name, url: r.url, error: String(e).split('\n')[0].slice(0, 200) });
      if (fs.existsSync(file)) {
        // an old shot of a screen that failed now is not evidence of it: move it aside so the build sees it missing
        fs.mkdirSync(path.join(outDir, '.stale'), { recursive: true });
        fs.renameSync(file, path.join(outDir, '.stale', path.basename(file)));
        result.stale.push(path.relative(ROOT, path.join(outDir, '.stale', path.basename(file))));
      }
    }
  }
  await ctx.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(result, null, 1));
process.exit(result.errors.length || result.blocked.length ? 1 : 0);
