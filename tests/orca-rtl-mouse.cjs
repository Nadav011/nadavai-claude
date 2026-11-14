// Browser half of tests/orca-rtl-mouse.sh: loads Orca's own terminal asset (the vendored xterm,
// as patched by lib/orca-rtl/patch.mjs) in headless Chromium, writes Hebrew and mixed rows, and
// drives a real mouse over them.
//   node orca-rtl-mouse.cjs <out/renderer dir> <asset file name> <pass|fault>
// pass:  every check must hold (the pointer part is in).
// fault: the pointer part is out. Every check it is there for must fail and the others must
//        hold: proof that the checks see the fault the pointer part fixes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [root, asset, mode] = process.argv.slice(2);
if (!root || !asset || !/^(pass|fault)$/.test(mode || '')) { console.error('usage: orca-rtl-mouse.cjs <renderer dir> <asset> <pass|fault>'); process.exit(2); }

function loadPlaywright() {
  for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
    try { return require(name); } catch { /* next */ }
    try { return require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), name)); } catch { /* next */ }
  }
  console.error('orca-rtl-mouse: Playwright is not installed (npm i -g @playwright/test)'); process.exit(2);
}
const { chromium } = loadPlaywright();

const LINES = [
  'plain english words here',
  'שלום עולם טוב מאוד',
  'Error: שגיאה בקובץ main.ts now',
  'ראה https://example.com/a?b=1 לפרטים',
  'קובץ 123 נשמר',
];
const URL_TEXT = 'https://example.com/a?b=1';

// xterm's own stylesheet (it positions the helper layers; without it the rows sit lower than the
// grid xterm computes): the smallest stylesheet in the bundle that carries it.
const CSS = fs.readdirSync(path.join(root, 'assets')).filter(f => f.endsWith('.css'))
  .map(f => ({ f, t: fs.readFileSync(path.join(root, 'assets', f), 'utf8') }))
  .filter(x => x.t.includes('.xterm-helper-textarea')).sort((x, y) => x.t.length - y.t.length).slice(0, 1).map(x => x.f);
if (!CSS.length) { console.error('orca-rtl-mouse: no stylesheet with xterm rules under ' + root + '/assets'); process.exit(2); }
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/t.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><meta charset=utf-8>' + CSS.map(f => '<link rel=stylesheet href="/assets/' + f + '">').join('') + '<body style="margin:20px;background:#111"><div id=t style="width:900px;height:260px"></div>'); return; }
  const f = path.join(root, u);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${server.address().port}/t.html`);

  const setup = await page.evaluate(async ({ asset, LINES, URL_TEXT }) => {
    const m = await import('/assets/' + asset);
    const T = Object.values(m).find(v => typeof v === 'function' && v.prototype && typeof v.prototype.open === 'function' && typeof v.prototype.loadAddon === 'function');
    if (!T) return { err: 'no xterm Terminal class among the asset exports' };
    const term = new T({ cols: 70, rows: 8, fontFamily: '"DejaVu Sans Mono", monospace', fontSize: 14, allowProposedApi: true });
    term.open(document.getElementById('t'));
    const w = /** @type {any} */ (window);
    w.term = term;
    w.sent = [];
    term.onData(d => w.sent.push(d));
    window.link = { hover: 0, leave: 0, activate: 0 };
    term.registerLinkProvider({
      provideLinks(y, cb) {
        const i = LINES[y - 1] ? LINES[y - 1].indexOf(URL_TEXT) : -1;
        if (i < 0) { cb(undefined); return; }
        cb([{ range: { start: { x: i + 1, y }, end: { x: i + URL_TEXT.length, y } }, text: URL_TEXT,
          activate() { window.link.activate++; }, hover() { window.link.hover++; }, leave() { window.link.leave++; } }]);
      },
    });
    await new Promise(r => term.write(LINES.join('\r\n') + '\r\n', r));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Where a piece of a row's text is on screen, read straight from the page layout.
    window.rectOf = (row, piece) => {
      const rowEl = document.querySelectorAll('.xterm-rows > div')[row];
      const text = rowEl.textContent;
      const at = text.indexOf(piece);
      if (at < 0) return null;
      const range = document.createRange();
      let off = 0, set = 0;
      for (const span of rowEl.childNodes) {
        const tn = span.firstChild, len = tn.data.length;
        if (!set && at < off + len) { range.setStart(tn, at - off); set = 1; }
        if (set && at + piece.length <= off + len) { range.setEnd(tn, at + piece.length - off); set = 2; break; }
        off += len;
      }
      if (set !== 2) return null;
      const b = range.getBoundingClientRect();
      return { left: b.left, right: b.right, y: (b.top + b.bottom) / 2 };
    };
    // The on-screen stretches of `len` characters from index `start` of a row, one per run.
    window.stretchesOf = (row, start, len) => {
      const rowEl = document.querySelectorAll('.xterm-rows > div')[row];
      const range = document.createRange();
      const out = [];
      let off = 0;
      for (const span of rowEl.childNodes) {
        const tn = span.firstChild;
        for (let i = 0; i < tn.data.length; i++, off++) {
          if (off < start || off >= start + len) continue;
          range.setStart(tn, i); range.setEnd(tn, i + 1);
          const b = range.getBoundingClientRect();
          out.push([b.left, b.right]);
        }
      }
      out.sort((p, q) => p[0] - q[0]);
      const merged = [];
      for (const x of out) { const last = merged[merged.length - 1]; if (last && x[0] <= last[1] + 0.5) last[1] = Math.max(last[1], x[1]); else merged.push([x[0], x[1]]); }
      return merged;
    };
    window.rowBox = (row) => { const b = document.querySelectorAll('.xterm-rows > div')[row].getBoundingClientRect(); return { left: b.left, right: b.right, y: (b.top + b.bottom) / 2 }; };
    window.blocks = () => [...document.querySelectorAll('.xterm-selection div')].filter(d => !d.firstElementChild)
      .map(d => d.getBoundingClientRect()).filter(b => b.width > 0.5 && b.height > 0.5).map(b => [b.left, b.right]).sort((p, q) => p[0] - q[0]);
    return { rows: document.querySelectorAll('.xterm-rows > div').length, spans: [...document.querySelectorAll('.xterm-rows > div')].slice(0, 5).map(r => r.childNodes.length), hook: !!globalThis.__orcaRtlMouse };
  }, { asset, LINES, URL_TEXT });
  if (setup.err) throw new Error(setup.err);

  const rectOf = (row, piece) => page.evaluate(([r, p]) => window.rectOf(r, p), [row, piece]);
  const selection = () => page.evaluate(() => window.term.getSelection());
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  async function drag(x1, x2, y) {
    await page.mouse.move(x1, y);
    await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, y, { steps: 4 });
    await page.mouse.move(x2, y, { steps: 4 });
    await page.mouse.up();
    await settle();
  }
  async function dragOver(row, piece) {
    await page.evaluate(() => window.term.clearSelection());
    const r = await rectOf(row, piece);
    if (!r) return '<not on screen>';
    await drag(r.left + 1.5, r.right - 1.5, r.y);
    return selection();
  }

  // faulty = the row patch alone gets this one wrong, so the fault run must see it fail; the
  // others hold either way and only guard against a regression.
  const results = []; // { name, faulty, ok, got }
  const check = (name, faulty, ok, got) => results.push({ name, faulty, ok: !!ok, got });

  let got = await dragOver(0, 'english');
  check('control: drag over an English word selects it', false, got === 'english', got);

  got = await dragOver(1, 'עולם');
  check('drag over a Hebrew word selects it', true, got === 'עולם', got);

  got = await dragOver(2, 'בקובץ');
  check('drag over a Hebrew word in a row that starts in English', true, got === 'בקובץ', got);
  got = await dragOver(2, 'main.ts');
  check('guard: drag over an English word after Hebrew in the same row', false, got === 'main.ts', got);

  got = await dragOver(4, '123');
  check('drag over digits between Hebrew words', true, got === '123', got);

  // Double click on the middle letter of a three-letter Hebrew word.
  {
    await page.evaluate(() => window.term.clearSelection());
    const r = await rectOf(1, 'טוב');
    await page.mouse.dblclick((r.left + r.right) / 2, r.y);
    await settle();
    got = await selection();
    check('double click on a Hebrew word selects that word', true, got === 'טוב', got);
  }

  // From the empty part of a right-aligned row to the right end of its text: the whole line.
  {
    await page.evaluate(() => window.term.clearSelection());
    const box = await page.evaluate(() => window.rowBox(1));
    const text = await rectOf(1, LINES[1]);
    await drag(box.left + 4, text.right - 1.5, box.y);
    got = await selection();
    check('guard: drag from the empty side of a Hebrew row takes the whole line', false, got === LINES[1], got);
  }

  // A link inside a Hebrew row: hover and click where the link is drawn.
  {
    await page.evaluate(() => window.term.clearSelection());
    const r = await rectOf(3, URL_TEXT);
    await page.mouse.move((r.left + r.right) / 2, r.y, { steps: 3 });
    await page.waitForTimeout(250);
    const hovered = await page.evaluate(() => window.link.hover);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(100);
    const activated = await page.evaluate(() => window.link.activate);
    check('a link in a Hebrew row answers where it is drawn', true, hovered > 0 && activated > 0, `hover ${hovered}, click ${activated}`);
    const w = await rectOf(3, 'לפרטים');
    await page.mouse.move((w.left + w.right) / 2, w.y, { steps: 3 });
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => ({ ...window.link }));
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => ({ ...window.link }));
    // The pointer left the link (one hover, then a leave) and the click did not open it.
    check('a Hebrew word next to the link is not the link', true, hovered === 1 && after.hover === 1 && after.leave > 0 && after.activate === before.activate,
      `hover ${after.hover}, leave ${after.leave}, clicks on the link ${before.activate} -> ${after.activate}`);
  }

  // The selection block is painted on the selected cells, wherever the browser put them, and
  // moves with them when the row is drawn again while the selection stands.
  {
    const same = (x, y) => x.length === y.length && x.every((s, i) => Math.abs(s[0] - y[i][0]) < 1.5 && Math.abs(s[1] - y[i][1]) < 1.5);
    const show = x => x.map(s => s.map(n => n.toFixed(0)).join('..')).join(' ');
    const at = LINES[2].indexOf('בקובץ');
    await page.evaluate(([c, n]) => window.term.select(c, 2, n), [at, 5]);
    await settle();
    let want = await page.evaluate(([c, n]) => window.stretchesOf(2, c, n), [at, 5]);
    let have = await page.evaluate(() => window.blocks());
    check('the selection block sits on the selected Hebrew cells', true, same(have, want), `block ${show(have)}, cells ${show(want)}`);
    // Push the row's text four cells along: the same cells now hold other characters.
    await page.evaluate(() => new Promise(r => window.term.write('\x1b7\x1b[3;1H\x1b[4@\x1b8', r)));
    await settle();
    want = await page.evaluate(([c, n]) => window.stretchesOf(2, c, n), [at, 5]);
    have = await page.evaluate(() => window.blocks());
    check('the block follows its cells when the row is drawn again', true, want.length > 0 && same(have, want), `block ${show(have)}, cells ${show(want)}`);
    await page.evaluate(() => window.term.clearSelection());
  }

  // A click sent to the program in the terminal names the cell of the letter that was clicked.
  {
    await page.evaluate(() => new Promise(r => window.term.write('\x1b[?1000h\x1b[?1006h', r)));
    const letter = await rectOf(4, 'ש');
    await page.evaluate(() => { window.sent.length = 0; });
    await page.mouse.click((letter.left + letter.right) / 2, letter.y);
    await page.waitForTimeout(100);
    const sent = await page.evaluate(() => window.sent.join(''));
    const want = `\x1b[<0;${LINES[4].indexOf('ש') + 1};5M`;
    check('a click reported to the running program names the clicked letter', true, sent.includes(want), JSON.stringify(sent));
    await page.evaluate(() => new Promise(r => window.term.write('\x1b[?1000l\x1b[?1006l', r)));
  }

  // ORCA_RTL_MOUSE_SHOT=<file.png>: a picture of a selection from the middle of one Hebrew row to
  // the middle of another, to look at by eye.
  if (process.env.ORCA_RTL_MOUSE_SHOT) {
    const from = await rectOf(1, 'עולם'), to = await rectOf(3, 'example');
    await page.mouse.move(from.left + 1.5, from.y);
    await page.mouse.down();
    await page.mouse.move(to.right - 1.5, to.y, { steps: 6 });
    await page.mouse.up();
    await settle();
    await page.screenshot({ path: process.env.ORCA_RTL_MOUSE_SHOT, clip: { x: 0, y: 0, width: 700, height: 150 } });
  }

  await browser.close();
  server.close();

  for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '   [got: ' + r.got + ']'));
  if (errors.length) console.log('page errors: ' + errors.join(' | '));
  const control = results.filter(r => !r.faulty), faulty = results.filter(r => r.faulty);
  if (mode === 'pass') {
    if (!setup.hook) { console.log('RESULT: the pointer part is not in this asset'); process.exit(1); }
    const bad = results.filter(r => !r.ok).length + errors.length;
    console.log(bad ? `RESULT: ${bad} check(s) failed` : `RESULT: all ${results.length} checks hold`);
    process.exit(bad ? 1 : 0);
  }
  // fault: every check the row patch alone gets wrong must fail here, and the rest must hold.
  const seen = faulty.filter(r => !r.ok).length;
  const ok = control.every(r => r.ok) && seen === faulty.length && !setup.hook;
  console.log(ok ? `RESULT: without the pointer part all ${seen} checks it is there for fail, and the ${control.length} others hold, as expected`
    : `RESULT: the checks do not show the fault (others hold: ${control.every(r => r.ok)}, failed ${seen} of ${faulty.length}, pointer part present: ${setup.hook})`);
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('orca-rtl-mouse: ' + (e && e.stack || e)); process.exit(1); });
