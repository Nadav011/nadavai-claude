// Which ways out of a preview does the browser itself refuse?
// The app page runs in three set-ups, each with the same cases:
//   1. frame + guard   in a sandboxed frame (no allow-popups, no allow-top-navigation*), the shell's policy has
//                      frame-src set to the app's origin only, and a guard in the app rewrites every link that
//                      points outside it to a local page and cancels what the person opens himself (a click
//                      with a modifier key or another button, the context menu, a drag);
//   2. frame only      the same frame with no guard;
//   3. top level       no frame and no guard (the control).
// Nothing leaves the machine: the test browser aborts every request that is not to 127.0.0.1 and records it, and
// the outside URLs are example.com and a number in the reserved 555-01xx range.
// It is a probe, not a kit: a project's unit 1 writes its own and shows its proofs.
//   node probe.cjs <chromium|firefox|webkit> <folder that holds the playwright package>
// WebKit and Firefox as the project's Playwright image has them, with no network at all:
//   docker run --rm --init --ipc=host --network none -v "$PWD":/probe:ro \
//     -v <playwright>:/pw/node_modules/playwright:ro -v <playwright-core>:/pw/node_modules/playwright-core:ro \
//     mcr.microsoft.com/playwright:v<version>-noble node /probe/probe.cjs webkit /pw/node_modules
const http = require('node:http');
const path = require('node:path');

const browserName = process.argv[2] || 'chromium';
const pw = require(path.join(process.argv[3] || '/pw', 'playwright'));

const SHELL = 18290; // below the ephemeral range, so no outgoing connection can hold it
const APP = 18291;
const APP_ORIGIN = `http://127.0.0.1:${APP}`;
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals';

// The guard: loaded first, it points every <a> and <area> that leaves the app's origin at a local page.
const GUARD = `<script>(() => {
  const fix = (a) => {
    const raw = a.getAttribute('href');
    if (!raw) return;
    let u; try { u = new URL(raw, location.href); } catch { return; }
    if (u.origin === location.origin && (u.protocol === 'http:' || u.protocol === 'https:')) return;
    a.setAttribute('href', '/would-open?u=' + encodeURIComponent(raw));
    a.removeAttribute('target');
  };
  const sweep = (root) => root.querySelectorAll && root.querySelectorAll('a[href],area[href]').forEach(fix);
  new MutationObserver((ms) => ms.forEach((m) => {
    if (m.type === 'attributes') fix(m.target); else m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches('a[href],area[href]')) fix(n); sweep(n); } });
  })).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  document.addEventListener('DOMContentLoaded', () => sweep(document));
  // The event layer: what the person opens himself (a new tab or window, the context menu, a drag) never starts.
  const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  const own = (e) => (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && stop(e);
  addEventListener('click', own, true);
  addEventListener('auxclick', stop, true);
  addEventListener('contextmenu', stop, true);
  addEventListener('dragstart', stop, true);
})();</script><style>*{-webkit-touch-callout:none}</style>`;
const appHtml = (guard) => `<!doctype html><meta charset="utf-8"><title>app</title>${guard ? GUARD : ''}
<a id="tel" href="tel:+12025550123">call</a>
<a id="mailto" href="mailto:someone@example.com">mail</a>
<a id="sms" href="sms:+12025550123">sms</a>
<a id="blank" target="_blank" href="https://example.com/blank">new tab</a>
<a id="ext" href="https://example.com/same-frame">leave in this frame</a>
<form id="f" action="https://example.com/post" method="post"><button id="post">post</button></form>`;
const shellHtml = (guard) => `<!doctype html><meta charset="utf-8"><title>shell</title>
<iframe id="app" sandbox="${SANDBOX}" src="${APP_ORIGIN}/app${guard ? '?guard=1' : ''}"></iframe>`;

const serve = (port, handler) => new Promise((r) => { const s = http.createServer(handler); s.listen(port, '127.0.0.1', () => r(s)); });

const click = (sel, opts) => (f) => f.click(sel, { timeout: 3000, ...opts });
const CASES = [
  ['click <a href="tel:">', click('#tel')],
  ['click <a href="mailto:">', click('#mailto')],
  ['click <a href="sms:">', click('#sms')],
  ["location.href = 'tel:…'", (f) => f.evaluate(() => { location.href = 'tel:+12025550123'; return 'assigned'; })],
  ["location.assign('https://example.com/…')", (f) => f.evaluate(() => { location.assign('https://example.com/assign'); return 'called'; })],
  ["location.replace('https://example.com/…')", (f) => f.evaluate(() => { location.replace('https://example.com/replace'); return 'called'; })],
  ['click <a href="https://example.com"> (same frame)', click('#ext')],
  ["window.open('https://example.com/…')", (f) => f.evaluate(() => (window.open('https://example.com/open') ? 'window returned' : 'null returned'))],
  ['click <a target="_blank">', click('#blank')],
  ["top.location = 'https://example.com/…'", (f) => f.evaluate(() => { try { top.location = 'https://example.com/top'; return 'assigned'; } catch (e) { return 'threw ' + e.name; } })],
  ['navigator.share()', (f) => f.evaluate(async () => { if (!navigator.share) return 'no navigator.share'; try { await navigator.share({ url: 'https://example.com/share' }); return 'shared'; } catch (e) { return 'threw ' + e.name; } })],
  ['form post to https://example.com', click('#post')],
  ['middle click on <a href="https://example.com">', click('#ext', { button: 'middle' })],
  ['Ctrl+click on <a href="https://example.com">', click('#ext', { modifiers: ['Control'] })],
  ['Shift+click on <a href="https://example.com">', click('#ext', { modifiers: ['Shift'] })],
  ['Ctrl+click on <a href="tel:">', click('#tel', { modifiers: ['Control'] })],
  ['Ctrl+click on a form\'s submit (post to https://example.com)', click('#post', { modifiers: ['Control'] })],
  ['Shift+click on a form\'s submit (post to https://example.com)', click('#post', { modifiers: ['Shift'] })],
];
const MODES = [
  ['frame + guard', true, true],
  ['frame only', true, false],
  ['top level, no frame and no guard (control)', false, false],
];

(async () => {
  const shell = await serve(SHELL, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': `default-src 'self'; frame-src ${APP_ORIGIN}` });
    res.end(shellHtml(/guard=1/.test(req.url)));
  });
  const app = await serve(APP, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url.startsWith('/would-open') ? '<!doctype html><title>would open</title><p id="would">would have opened</p>' : appHtml(/guard=1/.test(req.url)));
  });
  // Chromium: no name is ever resolved, so not even a DNS lookup for example.com leaves the host.
  const browser = await pw[browserName].launch(browserName === 'chromium' ? { ignoreDefaultArgs: ['--disable-dev-shm-usage'], args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] } : {});
  console.log('legend: OUT = a request outside 127.0.0.1 was attempted (and aborted); no = none was');
  console.log(`${browserName} ${browser.version()}  sandbox="${SANDBOX}"`);
  const totals = {};
  for (const [mode, framed, guard] of MODES) {
    console.log(`\n== ${mode}`);
    let out = 0;
    for (const [name, act] of CASES) {
      const ctx = await browser.newContext();
      const external = [];
      const consoleMsgs = [];
      let newPages = 0;
      await ctx.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith('http://127.0.0.1:')) return route.continue();
        external.push(u);
        return route.abort();
      });
      ctx.on('page', (p) => { newPages += 1; p.on('console', (m) => consoleMsgs.push(m.text())); });
      const page = await ctx.newPage();
      page.on('console', (m) => consoleMsgs.push(m.text()));
      let frame;
      if (framed) {
        await page.goto(`http://127.0.0.1:${SHELL}/${guard ? '?guard=1' : ''}`);
        for (let i = 0; i < 20 && !frame; i += 1) { frame = page.frames().find((f) => f.url().startsWith(`${APP_ORIGIN}/app`)); if (!frame) await page.waitForTimeout(100); }
      } else {
        await page.goto(`${APP_ORIGIN}/app`);
        frame = page.mainFrame();
      }
      newPages = 0;
      let ret;
      try { ret = await act(frame); } catch (e) { ret = 'action error: ' + String(e.message).split('\n')[0].slice(0, 80); }
      await page.waitForTimeout(700);
      let frameUrl = '(gone)';
      try { frameUrl = frame.url(); } catch { /* detached */ }
      const pageUrls = ctx.pages().slice(1).map((p) => p.url());
      if (external.length) out += 1;
      console.log(`${external.length ? 'OUT' : 'no '}  ${name}`);
      console.log(`       returned: ${ret === undefined ? '-' : ret} | outside requests: ${external.join(', ') || 'none'} | new pages: ${newPages}${pageUrls.length ? ' (' + pageUrls.join(', ') + ')' : ''} | frame at: ${frameUrl.replace(APP_ORIGIN, '')}`);
      const said = consoleMsgs.filter((m) => /sandbox|protocol|block|refus|violat|denied|not allowed|prevented|framing/i.test(m)).map((m) => m.replace(/\s+/g, ' ').slice(0, 170));
      if (said.length) console.log(`       console: ${[...new Set(said)].join(' || ')}`);
      await ctx.close();
    }
    totals[mode] = out;
    console.log(`-- ${mode}: ${out} of ${CASES.length} cases attempted a request outside`);
  }
  await browser.close();
  shell.close();
  app.close();
  console.log('\nsummary: ' + Object.entries(totals).map(([m, n]) => `${m}: ${n}/${CASES.length} out`).join(' · '));
})().catch((e) => { console.error('probe failed:', e); process.exit(1); });
