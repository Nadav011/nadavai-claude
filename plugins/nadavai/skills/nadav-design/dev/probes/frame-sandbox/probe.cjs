// Does a sandboxed frame (no allow-popups, no allow-top-navigation*) plus frame-src on the shell page make the
// browser itself refuse every way out of a preview? It runs each case in the sandboxed frame and again at top
// level with no sandbox (the control). Nothing leaves the machine: the test browser aborts every request that is
// not to 127.0.0.1, and the outside URLs are example.com and a number in the reserved 555-01xx range.
//   node probe.cjs <chromium|firefox|webkit> <folder that holds the playwright package>
// WebKit and Firefox as the project's Playwright image has them, with no network at all:
//   docker run --rm --init --ipc=host --network none -v "$PWD":/probe:ro -v <playwright>:/pw/node_modules/playwright:ro \
//     -v <playwright-core>:/pw/node_modules/playwright-core:ro mcr.microsoft.com/playwright:v<version>-noble \
//     node /probe/probe.cjs webkit /pw/node_modules
const http = require('node:http');
const path = require('node:path');
const browserName = process.argv[2] || 'chromium';
const pw = require(path.join(process.argv[3] || '/pw', 'playwright'));

const SHELL = 47290, APP = 47291;
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals';
const appHtml = `<!doctype html><meta charset="utf-8"><title>app</title>
<a id="tel" href="tel:+12025550123">call</a>
<a id="mailto" href="mailto:someone@example.com">mail</a>
<a id="sms" href="sms:+12025550123">sms</a>
<a id="blank" target="_blank" href="https://example.com/blank">new tab</a>
<a id="ext" href="https://example.com/same-frame">leave in this frame</a>
<form id="f" action="https://example.com/post" method="post"><button id="post">post</button></form>
<script>window.__log = []; window.addEventListener('securitypolicyviolation', e => __log.push('csp:' + e.violatedDirective));</script>`;
const shellHtml = `<!doctype html><meta charset="utf-8"><title>shell</title>
<iframe id="app" sandbox="${SANDBOX}" src="http://127.0.0.1:${APP}/app" style="width:100%;height:90vh;border:0"></iframe>`;

function serve(port, handler) { return new Promise((r) => { const s = http.createServer(handler); s.listen(port, '127.0.0.1', () => r(s)); }); }

const CASES = [
  ['click <a href="tel:">', (f) => f.click('#tel', { timeout: 3000 })],
  ['click <a href="mailto:">', (f) => f.click('#mailto', { timeout: 3000 })],
  ['click <a href="sms:">', (f) => f.click('#sms', { timeout: 3000 })],
  ["location.href = 'tel:…'", (f) => f.evaluate(() => { location.href = 'tel:+12025550123'; return 'assigned'; })],
  ["location.assign('https://example.com/…')", (f) => f.evaluate(() => { location.assign('https://example.com/assign'); return 'called'; })],
  ["location.replace('https://example.com/…')", (f) => f.evaluate(() => { location.replace('https://example.com/replace'); return 'called'; })],
  ['click <a href="https://example.com"> (same frame)', (f) => f.click('#ext', { timeout: 3000 })],
  ["window.open('https://example.com/…')", (f) => f.evaluate(() => { const w = window.open('https://example.com/open'); return w ? 'window returned' : 'null returned'; })],
  ['click <a target="_blank">', (f) => f.click('#blank', { timeout: 3000 })],
  ["top.location = 'https://example.com/…'", (f) => f.evaluate(() => { try { top.location = 'https://example.com/top'; return 'assigned'; } catch (e) { return 'threw ' + e.name; } })],
  ['navigator.share()', (f) => f.evaluate(async () => { if (!navigator.share) return 'no navigator.share'; try { await navigator.share({ url: 'https://example.com/share' }); return 'shared'; } catch (e) { return 'threw ' + e.name; } })],
  ['form post to https://example.com', (f) => f.click('#post', { timeout: 3000 })],
];

(async () => {
  const shell = await serve(SHELL, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': `default-src 'self'; frame-src http://127.0.0.1:${APP}` });
    res.end(shellHtml);
  });
  const app = await serve(APP, (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(appHtml); });
  const launch = browserName === 'chromium' ? { ignoreDefaultArgs: ['--disable-dev-shm-usage'] } : {};
  const browser = await pw[browserName].launch(launch);
  console.log('legend: OUT = a request or a page outside 127.0.0.1 was attempted; refused* = nothing left, the frame ended on the browser\'s blocked page; no effect = nothing left, the frame stayed');
  console.log(`${browserName} ${browser.version()}  sandbox="${SANDBOX}"  shell CSP frame-src = the app's origin only`);
  for (const mode of ['sandboxed frame', 'top level, no sandbox (control)']) {
    console.log(`\n== ${mode}`);
    for (const [name, act] of CASES) {
      const ctx = await browser.newContext();
      const external = [], pages = [], navs = [], consoleMsgs = [];
      await ctx.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith('http://127.0.0.1:')) return route.continue();
        external.push(`${route.request().isNavigationRequest() ? 'NAV' : 'REQ'} ${u}`);
        return route.abort();
      });
      ctx.on('page', (p) => pages.push(p.url() || '(new page)'));
      const page = await ctx.newPage();
      page.on('console', (m) => consoleMsgs.push(m.text().slice(0, 140)));
      page.on('framenavigated', (fr) => navs.push(fr.url()));
      let frame;
      if (mode.startsWith('sandboxed')) {
        await page.goto(`http://127.0.0.1:${SHELL}/`);
        frame = page.frame({ url: /:47291\/app/ });
        if (!frame) { await page.waitForTimeout(500); frame = page.frame({ url: /:47291\/app/ }); }
      } else {
        await page.goto(`http://127.0.0.1:${APP}/app`);
        frame = page.mainFrame();
      }
      navs.length = 0; pages.length = 0;
      let ret;
      try { ret = await act(frame); } catch (e) { ret = 'action error: ' + String(e.message).split('\n')[0].slice(0, 90); }
      await page.waitForTimeout(700);
      let frameUrl = '(gone)';
      try { frameUrl = frame.url(); } catch { /* detached */ }
      const left = !frameUrl.startsWith(`http://127.0.0.1:${APP}/app`);
      const out = external.length || pages.length;
      console.log(`${out ? 'OUT      ' : left ? 'refused* ' : 'no effect'}  ${name}`);
      console.log(`           returned: ${ret === undefined ? '-' : ret} | external requests: ${external.join(', ') || 'none'} | new pages: ${pages.length} | frame now: ${frameUrl.slice(0, 60)}`);
      const notable = consoleMsgs.filter((m) => /sandbox|protocol|launch|block|refus|violat|denied|not allowed/i.test(m) && !/inline style/.test(m));
      if (notable.length) console.log(`           console: ${notable.join(' || ')}`);
      await ctx.close();
    }
  }
  await browser.close(); shell.close(); app.close();
})().catch((e) => { console.error('probe failed:', e); process.exit(1); });
