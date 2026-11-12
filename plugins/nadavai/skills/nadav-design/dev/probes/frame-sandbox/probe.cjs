// Which ways out of a preview does the browser itself refuse?
// The app page runs in four set-ups, each with the same cases:
//   0. frame + guard + the app's policy   set-up 1 with the app's own responses carrying the policy the rule asks
//                      for (default-src 'self', form-action 'self', base-uri 'none'; inline script and style
//                      allowed, as a dev server needs): this is the rule's set-up;
//   1. frame + guard   in a sandboxed frame (no allow-popups, no allow-top-navigation*), the shell's policy has
//                      frame-src set to the app's origin only, and a guard in the app that
//                      - rewrites every <a href> and <area href>, every form's action and every formaction
//                        that points outside the two origins to a local page, and keeps watching them, in the
//                        document and in every shadow root made with attachShadow (left alone: a javascript:
//                        destination, React's two placeholders, and a blob: or data: link that carries download);
//                      - cancels the browser's default, never the app's handlers, for a click with a modifier key
//                        or another button where the event's path holds a link or a submit control, for the
//                        context menu on a link or an image, and for a drag of a link the app did not make
//                        draggable;
//                      - cancels every form submission that leaves, except the two placeholders React writes
//                        for a function action (one on the client, one on the server), which React cancels
//                        itself;
//                      - registers those listeners on the window and on every shadow root made with attachShadow;
//                      - installs itself in every same-origin child document, when its frame is added, when it
//                        loads and when the app's code reaches for it, and fences a tree that is not in the
//                        document before a script dispatches an event at any node of it; its listeners are
//                        on the window as well as on each document, and window.__guard(win) installs it again
//                        in a document that document.open emptied;
//   2. frame only      the same frame with no guard;
//   3. top level       no frame and no guard (the control).
// Nothing leaves the machine: the test browser aborts every request that is not to 127.0.0.1 and records it, and
// the outside URLs are example.com and a number in the reserved 555-01xx range.
// It is a probe, not a kit: a project's unit 1 writes its own and shows its proofs.
//   node probe.cjs <chromium|firefox|webkit> <folder that holds the playwright package> [folder that holds react]
// With no react and react-dom (19) in either folder the React form cases are printed as not run.
// WebKit and Firefox as the project's Playwright image has them, with no network at all:
//   docker run --rm --init --ipc=host --network none -v "$PWD":/probe:ro \
//     -v <playwright>:/pw/node_modules/playwright:ro -v <playwright-core>:/pw/node_modules/playwright-core:ro \
//     -v <react>:/pw/node_modules/react:ro -v <react-dom>:/pw/node_modules/react-dom:ro \
//     -v <scheduler>:/pw/node_modules/scheduler:ro \
//     mcr.microsoft.com/playwright:v<version>-noble node /probe/probe.cjs webkit /pw/node_modules
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const browserName = process.argv[2] || 'chromium';
const PW_DIR = process.argv[3] || '/pw';
const pw = require(path.join(PW_DIR, 'playwright'));

const SHELL = 18290; // below the ephemeral range, so no outgoing connection can hold it
const APP = 18291;
const APP_ORIGIN = `http://127.0.0.1:${APP}`;
const SHELL_ORIGIN = `http://127.0.0.1:${SHELL}`;
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals';
const APP_POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'";

// React 19's production builds as one script, when they can be found: the app's forms with a function action.
// The same component is rendered on the server and hydrated in the browser.
const SSR_COMPONENT = `(React) => function Ssr() { const h = React.createElement; return h('div', null,
  h('form', { id: 'sa', action: async () => { window.__react.ssrAction += 1; } }, h('input', { name: 'q', defaultValue: 'x' }), h('button', { id: 'sab' }, 'send (server-rendered, action fn)')),
  h('form', { id: 'sf' }, h('button', { id: 'sfb', formAction: async () => { window.__react.ssrFormAction += 1; } }, 'send (server-rendered, formAction fn)'))); }`;
let reactBundle = null;
let reactVersion = null;
let ssrHtml = '';
try {
  const from = [process.argv[4], PW_DIR].filter(Boolean);
  const reactDir = path.dirname(require.resolve('react/package.json', { paths: from }));
  const domDir = path.dirname(require.resolve('react-dom/package.json', { paths: from }));
  const schedDir = path.dirname(require.resolve('scheduler/package.json', { paths: [domDir, ...from] }));
  const mods = {
    react: path.join(reactDir, 'cjs/react.production.js'),
    'react-dom': path.join(domDir, 'cjs/react-dom.production.js'),
    'react-dom/client': path.join(domDir, 'cjs/react-dom-client.production.js'),
    scheduler: path.join(schedDir, 'cjs/scheduler.production.js'),
  };
  let b = 'var process={env:{NODE_ENV:"production"}};var __d={},__c={};function __r(n){if(__c[n])return __c[n].exports;var m={exports:{}};__c[n]=m;__d[n](m,m.exports,__r);return m.exports;}\n';
  for (const [n, f] of Object.entries(mods)) b += `__d[${JSON.stringify(n)}]=function(module,exports,require){${fs.readFileSync(f, 'utf8')}\n};\n`;
  reactBundle = b + "window.React=__r('react');window.ReactDOMClient=__r('react-dom/client');\n";
  reactVersion = JSON.parse(fs.readFileSync(path.join(reactDir, 'package.json'), 'utf8')).version;
  const React = require(reactDir);
  const Server = require(require.resolve('react-dom/server', { paths: from }));
  // eslint-disable-next-line no-new-func
  ssrHtml = Server.renderToString(React.createElement(new Function('React', `return (${SSR_COMPONENT})(React);`)(React)));
} catch { /* no React here: its cases are printed as not run */ }
const REACT_APP = `const h = React.createElement;
window.__react = { action: 0, formAction: 0, ssrAction: 0, ssrFormAction: 0, recover: null };
ReactDOMClient.hydrateRoot(document.getElementById('ssr'), h((${SSR_COMPONENT})(React)), { onRecoverableError: (e) => { window.__react.recover = String(e && e.message).slice(0, 100); } });
ReactDOMClient.createRoot(document.getElementById('root')).render(h('div', null,
  h('form', { id: 'ra', action: async () => { window.__react.action += 1; } }, h('input', { name: 'q', defaultValue: 'x' }), h('button', { id: 'rab' }, 'send (action fn)')),
  h('form', { id: 'rf' }, h('button', { id: 'rfb', formAction: async () => { window.__react.formAction += 1; } }, 'send (formAction fn)'))));`;

// The guard: loaded first.
const GUARD = `<script>(() => {
  const OK = new Set([location.origin, '${SHELL_ORIGIN}']);
  // React writes one of these as the action of a form whose action is a function (the first in the browser, the
  // second on the server, which hydration keeps), cancels the submission itself and runs the function; when the
  // submission is already cancelled it does not run it.
  const REACT_CLIENT = "javascript:throw new Error('A React form was unexpectedly submitted";
  const REACT_SERVER = "javascript:throw new Error('React form unexpectedly submitted.')";
  const isReact = (raw) => raw.startsWith(REACT_CLIENT) || raw === REACT_SERVER;
  // A MathML link is matched by its namespace and not by a <math> ancestor: an element made with createElementNS
  // outside <math> is a link too (Firefox opens it). is() adds it to every selector below.
  const MATHML = 'http://www.w3.org/1998/Math/MathML';
  const mathLink = (n) => n.namespaceURI === MATHML && n.hasAttribute('href');
  const is = (n, sel) => n.matches(sel) || mathLink(n);
  const LINKS = 'a[href],area[href]'; // what the rewrite reaches (and a MathML link)
  const SEL = LINKS + ',form[action],[formaction]';
  const LINK = 'a[*|href],area[href]'; // what counts as a link in a drag's path (and a MathML link)
  // For a click, an auxclick and a context menu the match is wider: an <a> with no href attribute (an SVG animation
  // can give it its address) and an SVG <use> (a link it draws sits in a user-agent tree the path does not show).
  const CLICKED = 'a,area[href],use';
  const OPENER = CLICKED + ',button:not([type=button]):not([type=reset]),input[type=submit],input[type=image]';
  const FRAMES = 'iframe,frame';
  const cancel = (e) => e.preventDefault();
  // 1. Destinations that leave point at a local page, in every document and every shadow root: a link's href, a
  // form's action, a control's formaction. Watching them is what catches a destination the app's own handler sets
  // during the submit, after the submit listener below has looked.
  const fixAttr = (el, name, link) => {
    const raw = el.getAttribute(name);
    if (!raw) return;
    let u; try { u = new URL(raw, el.baseURI); } catch { return; }
    if (OK.has(u.origin) && (u.protocol === 'http:' || u.protocol === 'https:')) return;
    if (u.protocol === 'javascript:') return; // a link runs in place; a form is cancelled below unless it is React's
    if (link && el.hasAttribute('download') && (u.protocol === 'data:' || (u.protocol === 'blob:' && OK.has(u.origin)))) return; // a file the page made
    el.setAttribute(name, '/would-open?u=' + encodeURIComponent(raw));
    if (link) el.removeAttribute('target');
  };
  const fix = (el) => {
    if (is(el, LINKS)) fixAttr(el, 'href', true);
    if (el.matches('form[action]')) fixAttr(el, 'action', false);
    if (el.matches('[formaction]')) fixAttr(el, 'formaction', false);
  };
  // 5. A same-origin child document gets the guard: when its frame is added, when it loads (a browser can give
  // the frame's window a new document then), and, through the wrapped getters below, before the app's code reaches it.
  const adopt = (fr) => {
    const go = () => { try { const w = fr.contentWindow; if (w && w.document) install(w); } catch { /* another origin */ } };
    go(); fr.addEventListener('load', go);
  };
  const sweep = (root) => { if (!root.querySelectorAll) return; root.querySelectorAll(SEL + ',[href]').forEach((n) => is(n, SEL) && fix(n)); root.querySelectorAll(FRAMES).forEach(adopt); };
  const watch = (root) => {
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.type === 'attributes') { if (is(m.target, SEL)) fix(m.target); } else m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (is(n, SEL)) fix(n); if (n.matches(FRAMES)) adopt(n); sweep(n); } });
    })).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'action', 'formaction'] });
    sweep(root);
  };
  // 2. What the person opens himself (a new tab or window, the context menu, a drag): only the browser's default
  // is cancelled, never the app's own handlers, and only where the event's path holds a link or a submit control.
  const path = (e) => e.composedPath().filter((n) => n.nodeType === 1); // an element of any document
  const has = (e, sel) => path(e).some((n) => is(n, sel));
  // a drag that the app itself made draggable is the app's own, also inside a link
  const ownDrag = (e) => { for (const n of path(e)) { if (n.getAttribute('draggable') === 'true') return true; if (is(n, LINK)) return false; } return false; };
  const fence = (root) => {
    root.addEventListener('click', (e) => (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && has(e, OPENER) && cancel(e), true);
    root.addEventListener('auxclick', (e) => has(e, OPENER) && cancel(e), true);
    root.addEventListener('contextmenu', (e) => has(e, CLICKED + ',img') && cancel(e), true);
    root.addEventListener('dragstart', (e) => has(e, LINK) && !ownDrag(e) && cancel(e), true);
    // 3. A form is fenced by where it goes, whatever key or click sent it. submit does not leave a shadow root.
    root.addEventListener('submit', (e) => {
      const b = e.submitter;
      const raw = (b && b.hasAttribute('formaction') ? b.getAttribute('formaction') : e.target.getAttribute('action')) || e.target.ownerDocument.URL;
      if (isReact(raw)) return;
      let u; try { u = new URL(raw, e.target.baseURI); } catch { return cancel(e); }
      if (!OK.has(u.origin)) cancel(e);
    }, true);
  };
  const CALLOUT = 'a,area,img{-webkit-touch-callout:none}';
  const sheetOf = (d) => { // a constructed sheet serves only the document it was made for
    if (d.__guardSheet === undefined) { try { d.__guardSheet = new d.defaultView.CSSStyleSheet(); d.__guardSheet.replaceSync(CALLOUT); } catch { d.__guardSheet = null; } }
    return d.__guardSheet;
  };
  const fenced = new WeakSet();
  // One list for the guard: every root its wrappers made, in whichever window. Each window the guard holds returns
  // it whole, because a frame inside a shadow root is not in window.frames and a helper frame can be gone by the
  // time the check script asks.
  const roots = [];
  // Once per window: the wrappers and the list of roots. A window can get a new document and keeps both.
  const perWindow = (win) => {
    const had = Object.getOwnPropertyDescriptor(win, '__guardRoots');
    if (had && had.writable === false) return; // a guard already holds this window
    // The list is for the check script, which cannot reach a closed root by itself. The page's code cannot replace it.
    Object.defineProperty(win, '__guardRoots', { value: () => roots.map((w) => w.deref()).filter((r) => r && r.host.isConnected), writable: false, configurable: false });
    // Every shadow root gets the same listeners and the same rewrite: a closed root hides its path and its links.
    const proto = win.Element.prototype;
    const attach = proto.attachShadow;
    proto.attachShadow = function attachShadowFenced(init) {
      const r = attach.call(this, init);
      fence(r); watch(r); roots.push(new WeakRef(r));
      // a root in a document with no window (a template's content, createHTMLDocument) takes no sheet
      const sheet = sheetOf(this.ownerDocument);
      if (sheet) { try { r.adoptedStyleSheets = [...r.adoptedStyleSheets, sheet]; } catch { /* that document */ } }
      return r;
    };
    // 4. A tree that is not in a document is seen by no listener. Before a script dispatches an event in one, its
    // top node gets the same listeners and the target its rewrite.
    const dispatch = win.EventTarget.prototype.dispatchEvent;
    win.EventTarget.prototype.dispatchEvent = function dispatchEventFenced(ev) {
      if (this && this.nodeType && !this.isConnected) { // a Text node inside a detached link activates the link
        const top = this.getRootNode();
        if (!fenced.has(top)) { fenced.add(top); fence(top); }
        for (let n = this; n; n = n.parentNode) if (n.nodeType === 1 && is(n, SEL)) fix(n);
      }
      return dispatch.call(this, ev);
    };
    for (const name of ['contentWindow', 'contentDocument']) {
      const d = Object.getOwnPropertyDescriptor(win.HTMLIFrameElement.prototype, name);
      Object.defineProperty(win.HTMLIFrameElement.prototype, name, { ...d, get() {
        const v = d.get.call(this);
        try { const w = name === 'contentWindow' ? v : v && v.defaultView; if (w && w.document) install(w); } catch { /* another origin */ }
        return v;
      } });
    }
  };
  // Once per document: the rewrite and the listeners.
  const install = (win) => {
    const doc = win.document;
    if (doc.__guard) return;
    doc.__guard = true;
    perWindow(win);
    watch(doc);
    doc.addEventListener('DOMContentLoaded', () => sweep(doc));
    fence(win); // the guard is the first script, so on the window its listeners run before the app's
    fence(doc);
    doc.addEventListener('guard-ping', () => { answered = true; }); // answers the installer below while this document's listeners live
    try { if (win !== window && doc.documentElement) doc.documentElement.style.setProperty('-webkit-touch-callout', 'none'); } catch { /* not there yet */ }
  };
  let answered = false;
  install(window);
  // For the app's own code, where a child document is made or emptied in a way the guard does not see.
  // document.open keeps the Document object and removes its listeners, so the document's mark is cleared first.
  window.__guard = (w) => {
    // Alive means a listener of this guard answered; a listener of the page's with the same event name cannot.
    answered = false;
    try { w.document.dispatchEvent(new w.Event('guard-ping')); } catch { return; }
    if (answered) return;
    w.document.__guard = false; install(w);
  };
})();</script><style>:root,a,area,img{-webkit-touch-callout:none}</style>`;
const appHtml = (guard, fault) => `<!doctype html><meta charset="utf-8"><title>app</title>${guard ? GUARD : ''}
<a id="tel" href="tel:+12025550123">call</a>
<a id="mailto" href="mailto:someone@example.com">mail</a>
<a id="sms" href="sms:+12025550123">sms</a>
<a id="blank" target="_blank" href="https://example.com/blank">new tab</a>
<a id="ext" href="https://example.com/same-frame">leave in this frame</a>
<form id="f" action="https://example.com/post" method="post"><button id="post">post</button></form>
<form id="one" action="https://example.com/one" method="post"><input id="q" name="q"></form>
<form id="fa" action="/would-open" method="post"><button id="fab" formaction="https://example.com/formaction">other</button></form>
<form id="late1" action="/would-open" method="post"><input id="late1q" name="q"></form>
<form id="late2" action="/would-open" method="post"><input id="late2q" name="q"></form>
<input type="checkbox" id="cb"><div id="cell" style="width:80px;height:30px">cell</div>
<a id="jslink" href="javascript:void(0)">a link the app handles itself</a>
<div id="card" draggable="true" style="width:120px"><img id="cardimg" src="/px.svg" width="40" height="40"> card</div>
<div id="drop" style="width:160px;height:60px;background:#eee">drop zone</div>
<script>window.__cb = 0; window.__menu = 0; window.__drop = 0; window.__js = 0;
document.getElementById('jslink').addEventListener('click', () => { window.__js += 1; });
document.getElementById('late1').addEventListener('submit', (e) => { e.target.setAttribute('action', 'https://example.com/late-attribute'); });
document.getElementById('late2').addEventListener('submit', (e) => { e.target.action = 'https://example.com/late-property'; });
document.getElementById('cb').addEventListener('click', () => { window.__cb += 1; });
document.getElementById('cell').addEventListener('contextmenu', (e) => { window.__menu += 1; e.preventDefault(); });
document.getElementById('card').addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'card'));
document.getElementById('drop').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('drop').addEventListener('drop', (e) => { e.preventDefault(); window.__drop += 1; });</script>
<math><mi id="mml" href="https://example.com/mathml">x</mi></math>
<p id="mbarep" style="margin:0"></p>
<script>{ const m = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mtext'); m.id = 'mbare';
  m.setAttribute('href', 'https://example.com/mathml-bare'); m.textContent = 'a MathML link outside math'; document.getElementById('mbarep').appendChild(m); }</script>
<svg width="0" height="0" style="position:absolute"><defs><a id="ua" xlink:href="https://example.com/use-xlink" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="100" height="24" fill="#c9c"/></a><rect id="ico" width="20" height="20" fill="#36c"/></defs></svg>
<svg id="usew" width="100" height="24"><use href="#ua"/></svg>
<svg id="smilw" width="100" height="24"><a id="smila"><set attributeName="href" to="https://example.com/smil-href" begin="0s" fill="freeze"/><rect width="100" height="24" fill="#cc9"/></a></svg>
<label id="icolabel" style="display:inline-block"><svg id="icosvg" width="20" height="20"><use href="#ico"/></svg><input type="checkbox" id="cb2"></label>
<script>window.__ico = 0; document.getElementById('icolabel').addEventListener('click', (e) => { if (e.target.id !== 'cb2') window.__ico += 1; });</script>
<button type="button" id="synth">a handler dispatches a Ctrl click on a link that is not in the document</button>
<button type="button" id="synthtext">a handler dispatches a Ctrl click on the text inside such a link</button>
<iframe id="kid2" width="200" height="40"></iframe>
<iframe id="kid" width="320" height="70"></iframe><div id="realmhost" style="display:inline-block"></div>
<script>{ const d = document.getElementById('kid').contentDocument;
  d.body.innerHTML = '<a id="kl" href="https://example.com/kid-link">kid link</a><form action="https://example.com/kid-form" method="post"><input id="kq" name="q" size="4"></form><form id="kg" action="/would-open" method="post"><input id="kgq" name="q" size="4"></form>';
  d.getElementById('kg').addEventListener('submit', (e) => { e.target.action = 'https://example.com/kid-late'; });
  const rr = d.defaultView.Element.prototype.attachShadow.call(document.getElementById('realmhost'), { mode: 'closed' });
  rr.innerHTML = '<a href="https://example.com/realm-link" style="display:inline-block;padding:6px">realm link</a><form action="https://example.com/realm-form" method="post"><input name="q" size="4"></form>';
  window.__realmInput = rr.querySelector('input'); window.__realmA = rr.querySelector('a');
  document.getElementById('synthtext').addEventListener('click', () => { const a = document.createElement('a'); a.href = 'https://example.com/synthetic-text'; a.textContent = 'x';
    a.firstChild.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ctrlKey: true })); });
  { const k2 = document.getElementById('kid2'); const d2 = k2.contentDocument; d2.open();
    d2.write('<a id="k2l" href="https://example.com/kid2-link">kid2</a> <svg width="60" height="20"><a id="k2s" xlink:href="https://example.com/kid2-svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="60" height="20" fill="#ccc"/></a></svg>');
    d2.close(); if (window.__guard) window.__guard(k2.contentWindow); }
  document.getElementById('synth').addEventListener('click', () => { const a = document.createElement('a'); a.href = 'https://example.com/synthetic-ctrl';
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ctrlKey: true })); }); }</script>
<svg width="120" height="24"><a id="svga" xlink:href="https://example.com/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="120" height="24" fill="#ccc"/></a></svg>
<div id="closedlink" style="display:inline-block"></div><div id="closedform" style="display:inline-block"></div><div id="openlink" style="display:inline-block"></div>
<script>{ const r = document.getElementById('closedlink').attachShadow({ mode: 'closed' });
  r.innerHTML = '<a href="https://example.com/closed" style="display:inline-block;padding:6px">closed link</a>';
  window.__closedA = r.querySelector('a');
  const f = document.getElementById('closedform').attachShadow({ mode: 'closed' });
  f.innerHTML = '<form action="https://example.com/closed-form" method="post"><input name="q"></form>';
  window.__closedInput = f.querySelector('input');
  const o = document.getElementById('openlink').attachShadow({ mode: 'open' });
  o.innerHTML = '<a href="https://example.com/open">open link</a>';
  window.__openA = o.querySelector('a');
  setTimeout(() => { const late = document.createElement('a'); late.href = 'https://example.com/closed-late'; late.textContent = 'late'; r.appendChild(late); window.__lateA = late; }, 50); }</script>
${reactBundle ? `<div id="ssr">${ssrHtml}</div><div id="root"></div><script src="/react.js"></script><script src="/react-app.js"></script>` : ''}
${fault ? `<script>{ // a fault on purpose: a root made with the attachShadow of a frame's window, taken in the task that made the frame
  const fr = document.createElement('iframe'); fr.width = 10; fr.height = 10; document.body.appendChild(fr);
  const w = window.frames[window.frames.length - 1];
  const host = document.createElement('div'); host.id = 'faulthost'; document.body.appendChild(host);
  const rr = w.Element.prototype.attachShadow.call(host, { mode: 'closed' });
  rr.innerHTML = '<a href="https://example.com/fault">fault</a>';
  const ch = document.createElement('div'); ch.id = 'clonehost'; document.body.appendChild(ch);
  ch.attachShadow({ mode: 'closed', clonable: true }).innerHTML = '<a href="https://example.com/clone">clone</a>';
  const copy = ch.cloneNode(true); copy.id = 'clonecopy'; document.body.appendChild(copy);
  // and a guarded clonable root whose component replaces the host with the host's clone
  const sh = document.createElement('div'); sh.id = 'replhost'; document.body.appendChild(sh);
  sh.attachShadow({ mode: 'closed', clonable: true }).innerHTML = '<a href="https://example.com/repl">repl</a>';
  setTimeout(() => { const c = sh.cloneNode(true); c.id = 'replcopy'; sh.replaceWith(c); }, 0); }</script>` : ''}`;
const shellHtml = (query) => `<!doctype html><meta charset="utf-8"><title>shell</title>
<iframe id="app" width="700" height="500" sandbox="${SANDBOX}" src="${APP_ORIGIN}/app${query}"></iframe>`;

const serve = (port, handler) => new Promise((r) => { const s = http.createServer(handler); s.listen(port, '127.0.0.1', () => r(s)); });

const click = (sel, opts) => (f) => f.click(sel, { timeout: 3000, ...opts });
const kidN = (f, i) => { const k = f.childFrames()[i]; if (!k) throw new Error('no child frame ' + i); return k; };
const kid = (f) => kidN(f, 1); // kid2 comes first in the page
const kid2 = (f) => kidN(f, 0);
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
  ['Shift+Enter in a one-field form whose own submit listener sets its action attribute to another origin', (f) => f.locator('#late1q').press('Shift+Enter', { timeout: 3000 })],
  ['Shift+Enter in a one-field form whose own submit listener sets form.action to another origin', (f) => f.locator('#late2q').press('Shift+Enter', { timeout: 3000 })],
  ['middle click on a link in a child document the page fills', (f) => kid(f).click('#kl', { button: 'middle', timeout: 3000 })],
  ['Ctrl+click on a link in a child document the page fills', (f) => kid(f).click('#kl', { modifiers: ['Control'], timeout: 3000 })],
  ['Shift+Enter in a one-field form in that child document', (f) => kid(f).locator('#kq').press('Shift+Enter', { timeout: 3000 })],
  ['Shift+Enter in a one-field form in that child document whose submit listener sets its action', (f) => kid(f).locator('#kgq').press('Shift+Enter', { timeout: 3000 })],
  ["middle click on a link in a closed shadow root made with the child document's attachShadow", click('#realmhost', { button: 'middle', position: { x: 12, y: 10 } })],
  ['Shift+Enter in a one-field form in that shadow root', async (f) => { await f.evaluate(() => window.__realmInput.focus()); await f.page().keyboard.press('Shift+Enter'); }],
  ['a handler dispatches a Ctrl click on a link that is not in the document', click('#synth')],
  ['a handler dispatches a Ctrl click on the text node inside a link that is not in the document', click('#synthtext')],
  ['middle click on an SVG link in a child document emptied by document.open', (f) => kid2(f).click('#k2s', { button: 'middle', timeout: 3000 })],
  ['middle click on a MathML element with href', click('#mml', { button: 'middle' })],
  ['Ctrl+click on a MathML element with href', click('#mml', { modifiers: ['Control'] })],
  ['middle click on a MathML element with href that has no <math> ancestor', click('#mbarep', { button: 'middle', position: { x: 12, y: 8 } })],
  ['Ctrl+click on that MathML element', click('#mbarep', { modifiers: ['Control'], position: { x: 12, y: 8 } })],
  ['middle click on a <use> of an SVG <a xlink:href> that sits in <defs>', click('#usew', { button: 'middle', position: { x: 10, y: 10 } })],
  ['Ctrl+click on that <use>', click('#usew', { modifiers: ['Control'], position: { x: 10, y: 10 } })],
  ['middle click on an SVG <a> with no href attribute whose address a <set> animation gives', click('#smilw', { button: 'middle', position: { x: 10, y: 10 } })],
];
// The app's own controls must keep working under the guard. Each step is tried by itself, so one that a browser
// cannot play does not hide the others.
const APP_CONTROLS = async (f) => {
  const errors = [];
  const step = async (name, act) => { try { await act(); } catch (e) { errors.push(`${name}: ${String(e.message).split('\n')[0].slice(0, 70)}`); } };
  await step('checkbox', () => f.click('#cb', { modifiers: ['Shift'], timeout: 3000 }));
  await step('cell', () => f.click('#cell', { button: 'right', timeout: 3000 }));
  await step('icon label', () => f.click('#icosvg', { modifiers: ['Shift'], timeout: 3000 }));
  await step('drag', () => f.dragAndDrop('#cardimg', '#drop', { timeout: 3000 }));
  if (reactBundle) {
    await step('react action', async () => { await f.waitForSelector('#rab', { timeout: 5000 }); await f.click('#rab', { timeout: 3000 }); });
    await step('react formAction', () => f.click('#rfb', { timeout: 3000 }));
    await f.page().waitForTimeout(500); // hydration of the server-rendered forms
    await step('react server-rendered action', () => f.click('#sab', { timeout: 3000 }));
    await step('react server-rendered formAction', () => f.click('#sfb', { timeout: 3000 }));
  }
  await step('javascript: link', () => f.click('#jslink', { timeout: 3000 }));
  await f.page().waitForTimeout(400);
  const r = await f.evaluate(() => ({
    handler: window.__cb, checked: document.getElementById('cb').checked, menu: window.__menu, drop: window.__drop,
    react: window.__react || null,
    reactAttr: document.getElementById('ra') ? document.getElementById('ra').getAttribute('action').slice(0, 44) : null,
    ssrAttr: document.getElementById('sa') ? document.getElementById('sa').getAttribute('action') : null,
    js: window.__js, at: location.pathname, ico: window.__ico, cb2: document.getElementById('cb2').checked,
    listed: window.__guardRoots ? window.__guardRoots().map((r) => [...r.querySelectorAll('a[href],form[action]')].map((a) => a.getAttribute(a.matches('form') ? 'action' : 'href'))) : null,
    roots: [window.__openA.getAttribute('href'), window.__closedA.getAttribute('href'), window.__lateA ? window.__lateA.getAttribute('href') : '(not added yet)'],
    realm: window.__realmA.getAttribute('href'),
  }));
  return { ...r, errors };
};
// The walk a check script makes after each screen: in every document under the app's frame, whatever its URL or
// origin, a link the script plants is rewritten and a Ctrl click it dispatches on that link comes back cancelled.
// A document where either is missing, or that the walk cannot evaluate, has no working guard.
const WALK = async (f) => {
  const out = [];
  const visit = async (fr, name) => {
    let r;
    try {
      r = await fr.evaluate(() => new Promise((res) => {
        const a = document.createElement('a'); a.href = 'https://example.com/walk'; a.textContent = 'walk';
        (document.body || document.documentElement).appendChild(a);
        setTimeout(() => {
          const href = a.getAttribute('href');
          const went = a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }));
          a.remove();
          res({ rewritten: href.startsWith('/would-open'), cancelled: !went, roots: typeof window.__guardRoots === 'function' ? window.__guardRoots().length : null });
        }, 0);
      }));
    } catch (e) { r = { error: String(e.message).split('\n')[0].slice(0, 60) }; }
    out.push(`${name}: ${r.error ? r.error : `planted link rewritten ${r.rewritten}, its Ctrl click cancelled ${r.cancelled}, roots on the guard's list ${r.roots === null ? 'no list' : r.roots}`}`);
    let i = 0;
    for (const c of fr.childFrames()) { i += 1; await visit(c, `${name} > child ${i} (${c.url().slice(0, 30)})`); }
  };
  await visit(f, 'the app document');
  return out;
};
const MODES = [
  ["frame + guard + the app's policy (the rule's set-up)", true, true, true],
  ['frame + guard', true, true, false],
  ['frame only', true, false, false],
  ['top level, no frame and no guard (control)', false, false, false],
];

(async () => {
  const shell = await serve(SHELL, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': `default-src 'self'; frame-src ${APP_ORIGIN}` });
    res.end(shellHtml(req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
  });
  const app = await serve(APP, (req, res) => {
    const u = req.url;
    if (u.startsWith('/react.js') && reactBundle) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(reactBundle); }
    if (u.startsWith('/react-app.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(REACT_APP); }
    if (u.startsWith('/px.svg')) { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#89a"/></svg>'); }
    const head = /policy=1/.test(u) ? { 'content-type': 'text/html', 'content-security-policy': APP_POLICY } : { 'content-type': 'text/html' };
    if (/oac=1/.test(u)) head['origin-agent-cluster'] = '?1'; // Chromium then gives the app's frame its own process
    res.writeHead(200, head);
    res.end(u.startsWith('/would-open') ? `<!doctype html><title>would open</title>${GUARD}<p id="would">would have opened</p>` : appHtml(/guard=1/.test(u), /fault=1/.test(u)));
  });
  // Chromium: no name is ever resolved, so not even a DNS lookup for example.com leaves the host.
  const browser = await pw[browserName].launch(browserName === 'chromium' ? { ignoreDefaultArgs: ['--disable-dev-shm-usage'], args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] } : {});
  console.log('legend: OUT = a request outside 127.0.0.1 was attempted (and aborted); no = none was');
  console.log(`${browserName} ${browser.version()}  sandbox="${SANDBOX}"  ${reactVersion ? 'react ' + reactVersion : 'no react found: the React form cases are not run'}`);
  const totals = {};
  for (const [mode, framed, guard, policy] of MODES) {
    const query = guard ? (policy ? '?guard=1&policy=1' : '?guard=1') : '';
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
        await page.goto(`http://127.0.0.1:${SHELL}/${query}`);
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
      const external = [];
      await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith('http://127.0.0.1:')) return route.continue(); external.push(u); return route.abort(); });
      const page = await ctx.newPage();
      let frame;
      if (framed) {
        await page.goto(`http://127.0.0.1:${SHELL}/${query}`);
        for (let i = 0; i < 20 && !frame; i += 1) { frame = page.frames().find((f) => f.url().startsWith(`${APP_ORIGIN}/app`)); if (!frame) await page.waitForTimeout(100); }
      } else { await page.goto(`${APP_ORIGIN}/app`); frame = page.mainFrame(); }
      let r; try { r = await APP_CONTROLS(frame); } catch (e) { r = { errors: [String(e.message).split('\n')[0].slice(0, 80)] }; }
      console.log(`-- the app's own controls in this set-up: Shift+click on its checkbox ran its handler ${r.handler} time(s), checked ${r.checked}; right click ran its context-menu handler ${r.menu} time(s); a drag that starts on the image in its draggable card dropped ${r.drop} time(s)`);
      console.log(`-- React ${reactVersion || '(not found)'}, rendered in the browser: ${r.react ? `a form whose action is a function ran it ${r.react.action} time(s), a button whose formAction is a function ran it ${r.react.formAction} time(s); the action attribute React wrote starts "${r.reactAttr}"` : 'not run'}`);
      console.log(`-- React ${reactVersion || '(not found)'}, rendered on the server and hydrated: ${r.react ? `a form whose action is a function ran it ${r.react.ssrAction} time(s), a button whose formAction is a function ran it ${r.react.ssrFormAction} time(s); the action attribute after hydration is "${r.ssrAttr}"; recoverable hydration error: ${r.react.recover || 'none'}` : 'not run'}`);
      console.log(`-- a plain click on <a href="javascript:void(0)"> ran the app's handler ${r.js} time(s); the frame is at ${r.at}`);
      console.log(`-- Shift+click on an icon drawn with <use> inside a label: the label's own handler ran ${r.ico} time(s); the label's checkbox is checked ${r.cb2}`);
      console.log(`-- href of the links inside shadow roots after load: open root ${r.roots && r.roots[0]} | closed root ${r.roots && r.roots[1]} | added later to the closed root ${r.roots && r.roots[2]}`);
      console.log(`-- href of the link in the closed root made with the child document's attachShadow: ${r.realm}`);
      console.log(`-- read through the guard's own list of roots: ${r.listed ? `${r.listed.length} root(s), link and form destinations ${JSON.stringify(r.listed)}` : 'no guard, no list'}`);
      let walked; try { walked = await WALK(frame); } catch (e) { walked = ['walk failed: ' + String(e.message).split('\n')[0].slice(0, 80)]; }
      for (const line of walked) console.log(`-- walk: ${line}`);
      if (external.length) console.log(`-- outside requests during the controls and the walk: ${external.join(', ')}`);
      if (r.errors && r.errors.length) console.log(`-- steps that did not play: ${r.errors.join(' || ')}`);
      await ctx.close();
    }
    if (browserName === 'chromium' && policy) {
      // Every author shadow root, read through the DevTools protocol, against the guard's lists. The page's session
      // does not reach a frame that runs in a process of its own, so each such frame's session is read too, and the
      // documents listed are counted against the frames the browser has. A host is matched as an element: the script
      // resolves each host the protocol lists to an object in its own page (DOM.resolveNode) and asks the guard lists
      // of the app's windows whether one holds a root whose host is that very object. It writes nothing on the page:
      // a mark on a host is copied or moved with it (a clone kept beside it, a clone that replaces it).
      const RUNS = [
        ['', ''],
        [", with three roots planted outside the wrapper (one through window.frames[i]'s attachShadow in the task that made the frame, one a clone of a clonable root kept beside its host, one a clone that replaced its host)", '&fault=1'],
        [", the same with the app's frame in a process of its own (Origin-Agent-Cluster)", '&fault=1&oac=1'],
        [", no planted root, the app's frame in a process of its own", '&oac=1'],
      ];
      for (const [label, extra] of RUNS) {
        const ctx = await browser.newContext();
        await ctx.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort()));
        const page = await ctx.newPage();
        await page.goto(`http://127.0.0.1:${SHELL}/${query}${extra}`);
        let frame;
        for (let i = 0; i < 20 && !frame; i += 1) { frame = page.frames().find((f) => f.url().startsWith(`${APP_ORIGIN}/app`)); if (!frame) await page.waitForTimeout(100); }
        await page.waitForTimeout(800);
        const sessions = [await ctx.newCDPSession(page)];
        for (const fr of page.frames()) {
          if (fr === page.mainFrame()) continue;
          try { sessions.push(await ctx.newCDPSession(fr)); } catch { /* this frame is part of its parent's session */ }
        }
        const attr = (n, name) => { const at = n.attributes || []; for (let i = 0; i < at.length; i += 2) if (at[i] === name) return at[i + 1]; return null; };
        // Asked of the host itself: is it the host of a root on the guard list of its own window, or of any window of
        // the app that this window can reach (a document that runs a guard script of its own keeps its own list)?
        const LISTED = `function () {
          const own = this.ownerDocument && this.ownerDocument.defaultView;
          if (!own) return false;
          let top = own;
          try { while (top.parent !== top && top.parent.document) top = top.parent; } catch (e) { /* the shell is another origin */ }
          const wins = [own];
          const walk = (w) => { wins.push(w); for (let i = 0; i < w.frames.length; i += 1) { try { if (w.frames[i].document) walk(w.frames[i]); } catch (e) { /* another origin */ } } };
          walk(top);
          return wins.some((w) => typeof w.__guardRoots === 'function' && w.__guardRoots().some((r) => r.host === this));
        }`;
        const perSession = [];
        const roots = [];
        for (const session of sessions) {
          let docs = 0;
          const hosts = [];
          const visit = (n) => {
            if (n.nodeName === '#document') docs += 1;
            for (const r of n.shadowRoots || []) { if (r.shadowRootType !== 'user-agent') hosts.push(n); visit(r); }
            for (const c of n.children || []) visit(c);
            if (n.contentDocument) visit(n.contentDocument);
            if (n.templateContent) visit(n.templateContent);
          };
          visit((await session.send('DOM.getDocument', { depth: -1, pierce: true })).root);
          perSession.push(docs);
          for (const n of hosts) {
            let listed = false;
            try {
              const { object } = await session.send('DOM.resolveNode', { backendNodeId: n.backendNodeId });
              const { result } = await session.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: LISTED, returnByValue: true });
              listed = result.value === true;
            } catch { /* a host that cannot be resolved counts as not listed */ }
            roots.push({ id: attr(n, 'id') || `<${n.localName}>`, listed });
          }
        }
        const docsListed = perSession.reduce((x, y) => x + y, 0);
        const frames = page.frames().length;
        const none = roots.filter((r) => !r.listed).map((r) => r.id);
        console.log(`-- shadow roots read through the DevTools protocol${label}: ${sessions.length} session(s), the page's own lists ${perSession[0]} document(s), all of them ${docsListed} for ${frames} frame(s)${docsListed < frames ? ' (FEWER: the check fails)' : ''}; ${roots.length} author root(s) [${roots.map((r) => r.id).join(', ')}]; host of no root on a guard list: ${none.length ? none.join(', ') + ' (the check fails)' : 'none'}`);
        await ctx.close();
      }
    }
    console.log(`-- ${mode}: ${out} of ${CASES.length} cases attempted a request outside`);
  }
  await browser.close();
  shell.close();
  app.close();
  console.log('\nsummary: ' + Object.entries(totals).map(([m, n]) => `${m}: ${n}/${CASES.length} out`).join(' · '));
})().catch((e) => { console.error('probe failed:', e); process.exit(1); });
