// Which ways out of a preview does the browser itself refuse?
// The app page runs in three set-ups, each with the same cases:
//   1. frame + guard   in a sandboxed frame (no allow-popups, no allow-top-navigation*), the shell's policy has
//                      frame-src set to the app's origin only, and a guard in the app rewrites every link that
//                      points outside it to a local page; cancels the browser's default, never the app's
//                      handlers, for a click with a modifier key or another button where the event's path
//                      holds a link or a submit control, for the context menu on a link or an image, and for
//                      a drag of a link the app did not make draggable; cancels every form submission that
//                      leaves; and registers all of that on every shadow root as well as on the window;
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
const SHELL_ORIGIN = `http://127.0.0.1:${SHELL}`;
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
  // What the person opens himself (a new tab or window, the context menu, a drag): only the browser's default
  // is cancelled, never the app's own handlers, and only where the event's path holds a link or a submit control.
  const OK = new Set([location.origin, '${SHELL_ORIGIN}']);
  const LINK = 'a[*|href],area[href]';
  const OPENER = LINK + ',button:not([type=button]):not([type=reset]),input[type=submit],input[type=image]';
  const path = (e) => e.composedPath().filter((n) => n instanceof Element);
  const has = (e, sel) => path(e).some((n) => n.matches(sel));
  const cancel = (e) => e.preventDefault();
  // a drag that the app itself made draggable is the app's own, also inside a link
  const ownDrag = (e) => { for (const n of path(e)) { if (n.getAttribute('draggable') === 'true') return true; if (n.matches(LINK)) return false; } return false; };
  const fence = (root) => {
    root.addEventListener('click', (e) => (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && has(e, OPENER) && cancel(e), true);
    root.addEventListener('auxclick', (e) => has(e, OPENER) && cancel(e), true);
    root.addEventListener('contextmenu', (e) => has(e, LINK + ',img') && cancel(e), true);
    root.addEventListener('dragstart', (e) => has(e, LINK) && !ownDrag(e) && cancel(e), true);
    // A form is fenced by where it goes, whatever key or click sent it. submit does not leave a shadow root.
    root.addEventListener('submit', (e) => {
      const b = e.submitter;
      const raw = (b && b.hasAttribute('formaction') ? b.getAttribute('formaction') : e.target.getAttribute('action')) || location.href;
      let u; try { u = new URL(raw, document.baseURI); } catch { return cancel(e); }
      if (!OK.has(u.origin)) cancel(e);
    }, true);
  };
  fence(window);
  // Every shadow root gets the same listeners: a closed root hides its path from window.
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachShadowFenced(init) { const r = attach.call(this, init); fence(r); return r; };
})();</script><style>a,area,img{-webkit-touch-callout:none}</style>`;
const appHtml = (guard) => `<!doctype html><meta charset="utf-8"><title>app</title>${guard ? GUARD : ''}
<a id="tel" href="tel:+12025550123">call</a>
<a id="mailto" href="mailto:someone@example.com">mail</a>
<a id="sms" href="sms:+12025550123">sms</a>
<a id="blank" target="_blank" href="https://example.com/blank">new tab</a>
<a id="ext" href="https://example.com/same-frame">leave in this frame</a>
<form id="f" action="https://example.com/post" method="post"><button id="post">post</button></form>
<form id="one" action="https://example.com/one" method="post"><input id="q" name="q"></form>
<form id="fa" action="/would-open" method="post"><button id="fab" formaction="https://example.com/formaction">other</button></form>
<input type="checkbox" id="cb"><div id="cell" style="width:80px;height:30px">cell</div>
<script>window.__cb = 0; window.__menu = 0;
document.getElementById('cb').addEventListener('click', () => { window.__cb += 1; });
document.getElementById('cell').addEventListener('contextmenu', (e) => { window.__menu += 1; e.preventDefault(); });</script>
<svg width="120" height="24"><a id="svga" xlink:href="https://example.com/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="120" height="24" fill="#ccc"/></a></svg>
<div id="closedlink" style="display:inline-block"></div><div id="closedform" style="display:inline-block"></div>
<script>{ const r = document.getElementById('closedlink').attachShadow({ mode: 'closed' });
  r.innerHTML = '<a href="https://example.com/closed" style="display:inline-block;padding:6px">closed link</a>';
  const f = document.getElementById('closedform').attachShadow({ mode: 'closed' });
  f.innerHTML = '<form action="https://example.com/closed-form" method="post"><input name="q"></form>';
  window.__closedInput = f.querySelector('input'); }</script>`;
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
  ['middle click on a form\'s submit', click('#post', { button: 'middle' })],
  ['Shift+Enter in a one-field form with no button', (f) => f.locator('#q').press('Shift+Enter', { timeout: 3000 })],
  ['Shift+click on a button whose formaction is another origin', click('#fab', { modifiers: ['Shift'] })],
  ['middle click on an SVG <a xlink:href>', click('#svga', { button: 'middle' })],
  ['middle click on a link inside a closed shadow root', click('#closedlink', { button: 'middle' })],
  ['Shift+Enter in a one-field form inside a closed shadow root', async (f) => { await f.evaluate(() => window.__closedInput.focus()); await f.page().keyboard.press('Shift+Enter'); }],
];
// The app's own controls must keep working under the guard.
const APP_CONTROLS = async (f) => {
  await f.click('#cb', { modifiers: ['Shift'], timeout: 3000 });
  await f.click('#cell', { button: 'right', timeout: 3000 });
  return f.evaluate(() => ({ handler: window.__cb, checked: document.getElementById('cb').checked, menu: window.__menu }));
};
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
    {
      const ctx = await browser.newContext();
      await ctx.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort()));
      const page = await ctx.newPage();
      let frame;
      if (framed) {
        await page.goto(`http://127.0.0.1:${SHELL}/${guard ? '?guard=1' : ''}`);
        for (let i = 0; i < 20 && !frame; i += 1) { frame = page.frames().find((f) => f.url().startsWith(`${APP_ORIGIN}/app`)); if (!frame) await page.waitForTimeout(100); }
      } else { await page.goto(`${APP_ORIGIN}/app`); frame = page.mainFrame(); }
      let r; try { r = await APP_CONTROLS(frame); } catch (e) { r = { error: String(e.message).split('\n')[0].slice(0, 80) }; }
      console.log(`-- the app's own controls in this set-up: Shift+click on its checkbox ran its handler ${r.handler} time(s), checked ${r.checked}; right click ran its context-menu handler ${r.menu} time(s)${r.error ? ' | ' + r.error : ''}`);
      await ctx.close();
    }
    console.log(`-- ${mode}: ${out} of ${CASES.length} cases attempted a request outside`);
  }
  await browser.close();
  shell.close();
  app.close();
  console.log('\nsummary: ' + Object.entries(totals).map(([m, n]) => `${m}: ${n}/${CASES.length} out`).join(' · '));
})().catch((e) => { console.error('probe failed:', e); process.exit(1); });
