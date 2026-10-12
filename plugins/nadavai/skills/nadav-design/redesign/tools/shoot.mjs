// Screenshot the built redesign demo and probe it for defects a reviewer should never have to find by eye.
//
// usage: node shoot.mjs [--config redesign.json] [--in demo.html] [--dir shots/x] [--theme dark|light]
//                       [--width 320] [--pw <path to playwright/index.mjs>] [screenId ...]
//
// Default pass (no --width): a 1280px page; per screen the whole section (sec-<id>.png) and every phone screenful by
// screenful (ph-<id>-<phone>-<scrollTop>.png: steps of 85% of the visible height, so consecutive shots overlap, and the
// end), then a probe at the config's phone width for horizontal overflow of the document.
// Narrow pass (--width 320): the viewport and every phone are exactly that wide (frame removed), and the
// report adds `clipped`: text cut by overflow or an ellipsis inside a phone (sr-only elements skipped).
// Both passes collect console errors, page errors and failed requests (a missing asset in pub/ shows up here),
// `blocked`: every request that is not a local file, data: or blob: (the demo makes no network request; fonts are
// embedded by build.py), and `cut`: text whose rendered lines run past the box that clips them (the phone, or any
// ancestor with overflow hidden or clip), and media past the phone's edge. Horizontal scrollers are skipped.
//
// report.json in --dir (default work/shots/<theme>[-<width>]): {shot, machine, errors, failed, blocked, overflow, cut
// [, clipped], advisory}; `shot` lists the screens covered, `machine` the load and memory it ran under. Exit 0 only when
// every problem list is empty. `advisory` is not counted: `contrast` (text below 4.5:1, 3:1 when large, on a solid
// background it could measure) and `targets` (controls under 44px) are leads a verifier confirms or dismisses.
// labels.json next to it maps every phone index to its column label: {screen: {n: label}}.
// Playwright comes from --pw, $PLAYWRIGHT_MODULE or the config's "playwright" (the app's own node_modules);
// nothing is installed. One browser per run, closed at the end: never run two shoots at once on a loaded machine.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const opt = { only: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else opt.only.push(a);
}
const cfgPath = path.resolve(opt.config || 'redesign.json');
const C = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const ROOT = path.dirname(cfgPath);
const theme = opt.theme || (C.theme && C.theme.default) || 'dark';
const width = opt.width ? Number(opt.width) : 0;
const IN = path.resolve(opt.in || path.join(ROOT, C.output || 'demo.html'));
const DIR = path.resolve(opt.dir || path.join(ROOT, 'work', 'shots', theme + (width ? `-${width}` : '')));
const pw = opt.pw || process.env.PLAYWRIGHT_MODULE || (C.playwright && path.resolve(ROOT, C.playwright));
if (!pw || !fs.existsSync(pw)) {
  console.error(`playwright not found (${pw || 'none given'}): pass --pw, set PLAYWRIGHT_MODULE or "playwright" in the config: <app>/node_modules/playwright/index.mjs (npm), <app>/node_modules/@playwright/test/index.mjs or <app>/node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs (pnpm)`);
  process.exit(2);
}
const ids = C.screens.map(s => s.id);
const unknown = opt.only.filter(id => !ids.includes(id));
if (unknown.length) {
  console.error(`unknown screen ids: ${unknown.join(', ')}`);
  process.exit(2);
}
const wanted = opt.only.length ? ids.filter(id => opt.only.includes(id)) : ids;
const srOnly = C.sr_only || ['sr-only', 'visually-hidden'];
const phoneW = (C.phone && C.phone.width) || 390;
const phoneH = (C.phone && C.phone.height) || 844;
const [load1] = os.loadavg();
const machine = { load: Number(load1.toFixed(1)), cpus: os.cpus().length, free_gb: Number((os.freemem() / 2 ** 30).toFixed(1)) };
console.error(`machine: load ${machine.load} on ${machine.cpus} cpus, ${machine.free_gb} GB free`);

const { chromium } = await import(pathToFileURL(pw).href);
const url = pathToFileURL(IN).href;
const report = { errors: [], failed: [], blocked: [], overflow: [], cut: [] };
if (width) report.clipped = [];
const advisory = { contrast: [], targets: [] };
const labels = {};
fs.mkdirSync(DIR, { recursive: true });

async function open(browser, viewport, tag) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
  // installed before the page loads: local files only, and no WebSocket at all
  await ctx.routeWebSocket(/.*/, ws => { report.blocked.push(`${tag}: ${ws.url().slice(0, 160)}`); return ws.close(); });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (/^(file|data|blob|about):/.test(u)) return route.continue();
    report.blocked.push(`${tag}: ${u.slice(0, 160)}`);
    return route.abort('blockedbyclient');
  });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') report.errors.push(`${tag}: ${m.text()}`); });
  p.on('pageerror', e => report.errors.push(`${tag}: ${String(e)}`));
  p.on('requestfailed', r => {
    const why = r.failure() ? r.failure().errorText : '';
    if (!/BLOCKED_BY_CLIENT/.test(why)) report.failed.push(`${tag}: ${r.url().slice(0, 160)} ${why}`);
  });
  await p.goto(url, { waitUntil: 'load' });
  // the theme the shoot asked for, through the page's own toggle when it has one
  await p.evaluate(t => {
    const b = document.querySelector(`.tbtn[data-theme="${t}"]`);
    if (b) b.click(); else document.documentElement.setAttribute('data-theme', t);
  }, theme);
  // the sticky switch would cover phones scrolled to the top of the viewport
  await p.addStyleTag({ content: '.switch{position:static!important}' });
  if (width) await p.addStyleTag({ content: `.phone{inline-size:${width}px!important;max-inline-size:none!important;border-width:0!important;border-radius:0!important}.wrap{padding-inline:0!important}` });
  await p.waitForTimeout(600);
  return { ctx, p };
}

async function show(p, id) {
  await p.click(`.switch button[data-s="${id}"]`);
  await p.waitForTimeout(150);
}

async function shootPhones(p, id) {
  const phones = p.locator(`#s-${id} .phone`);
  const n = await phones.count();
  for (let i = 0; i < n; i++) {
    const ph = phones.nth(i);
    const area = (await ph.locator(':scope > .body').count()) ? ph.locator(':scope > .body') : ph;
    const [h, view] = await area.evaluate(el => [el.scrollHeight - el.clientHeight, el.clientHeight]);
    const step = Math.max(200, Math.floor(view * 0.85));
    const steps = [];
    for (let y = 0; y < h; y += step) steps.push(y);
    if (h > 0) steps.push(h); else steps.push(0);
    for (const y of steps) {
      await area.evaluate((el, yy) => { el.scrollTop = yy; }, y);
      await p.waitForTimeout(100);
      await ph.screenshot({ path: path.join(DIR, `ph-${id}-${i}-${y}.png`) });
    }
    await area.evaluate(el => { el.scrollTop = 0; });
  }
}

async function overflow(p, id, tag) {
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (w[0] <= w[1] + 1) return;
  // RTL pages overflow to the left as often as to the right, so both edges count
  const culprits = await p.evaluate(sel => {
    const cw = document.documentElement.clientWidth;
    return [...document.querySelectorAll(sel + ' *')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width && (r.right > cw + 1 || r.left < -1);
    }).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : ''));
  }, `#s-${id}`);
  report.overflow.push({ pass: tag, id, scrollWidth: w[0], clientWidth: w[1], culprits });
}

// Content cut where no reader would see it: text whose rendered lines run past the box that clips them (the phone,
// or any ancestor with overflow hidden or clip, measured by Range rects, so a long line inside a block of the right
// width still counts), and media past the phone's edge. Horizontal scrollers (carousels) run past on purpose.
async function cut(p, id, tag) {
  const found = await p.evaluate(([sid, sr]) => {
    const out = [];
    const skip = el => { for (let e = el; e; e = e.parentElement) if (e.classList && sr.some(c => e.classList.contains(c))) return true; return false; };
    document.querySelectorAll(`#s-${sid} .phone`).forEach((ph, i) => {
      if (ph.classList.contains('shot')) return; // today's screenshot is a picture, cut or not
      const frame = parseFloat(getComputedStyle(ph).borderInlineStartWidth) || 0;
      const pb = ph.getBoundingClientRect();
      const phoneBox = { left: pb.left + frame, right: pb.right - frame };
      const clipOf = el => {
        for (let e = el; e && e !== ph; e = e.parentElement) {
          const ox = getComputedStyle(e).overflowX;
          if (/auto|scroll/.test(ox)) return null; // a scroller
          if (/hidden|clip/.test(ox)) { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right }; }
        }
        return phoneBox;
      };
      const walker = document.createTreeWalker(ph, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || skip(el) || getComputedStyle(el).visibility === 'hidden' || !el.getClientRects().length) continue;
        const box = clipOf(el);
        if (!box) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const off = [...range.getClientRects()].some(r => r.width && (r.left < box.left - 1 || r.right > box.right + 1));
        if (off) out.push({ phone: i, el: el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : ''), text: n.textContent.trim().slice(0, 40) });
      }
      ph.querySelectorAll('img, svg, button, input, select, textarea').forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || skip(el) || getComputedStyle(el).visibility === 'hidden') return;
        if (r.left >= phoneBox.left - 1 && r.right <= phoneBox.right + 1) return;
        if (clipOf(el) === null) return;
        out.push({ phone: i, el: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.getAttribute('alt') || '').slice(0, 40) });
      });
    });
    return out.slice(0, 30);
  }, [id, srOnly]);
  found.forEach(x => report.cut.push({ pass: tag, id, ...x }));
}

async function probes(p, id, tag) {
  const found = await p.evaluate(sid => {
    const out = { contrast: [], targets: [], labels: {} };
    const rgba = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
    const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const bgOf = el => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // over a photo or gradient: not measurable here
        const c = rgba(cs.backgroundColor);
        if (c && c[3] >= 0.99) return c;
        if (c && c[3] > 0) return null; // translucent layers: not measurable here
      }
      return null;
    };
    document.querySelectorAll(`#s-${sid} .phone`).forEach((ph, i) => {
      const col = ph.closest('.col');
      const lab = col && col.querySelector('.col-label');
      // the same text check-anchors reads: child nodes joined by a space, whitespace collapsed
      out.labels[i] = lab ? [...lab.childNodes].map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
      if (ph.classList.contains('shot')) return;
      ph.querySelectorAll('*').forEach(el => {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden' || el.closest('.sr-only,.visually-hidden,[aria-hidden="true"]')) return;
        if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
          const cs = getComputedStyle(el);
          const fg = rgba(cs.color), bg = bgOf(el);
          if (fg && bg) {
            const a = fg[3], mix = [0, 1, 2].map(k => a * fg[k] + (1 - a) * bg[k]);
            const l1 = lum(mix), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
            if (ratio < (large ? 3 : 4.5)) out.contrast.push({ phone: i, text: el.textContent.trim().slice(0, 40), ratio: Number(ratio.toFixed(2)) });
          }
        }
        if (el.matches('button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"]')) {
          const r = el.getBoundingClientRect();
          const inline = getComputedStyle(el).display === 'inline' && [...el.parentElement.childNodes].some(n => n !== el && n.nodeType === 3 && n.textContent.trim());
          if (!inline && (r.width < 44 || r.height < 44)) out.targets.push({ phone: i, el: el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? ` «${el.getAttribute('aria-label')}»` : ''), size: `${Math.round(r.width)}x${Math.round(r.height)}` });
        }
      });
    });
    return out;
  }, id);
  labels[id] = found.labels;
  found.contrast.forEach(x => advisory.contrast.push({ pass: tag, id, ...x }));
  found.targets.forEach(x => advisory.targets.push({ pass: tag, id, ...x }));
}

async function clipped(p, id) {
  const found = await p.evaluate(([sid, sr]) => {
    const hidden = el => { for (let e = el; e; e = e.parentElement) if (e.classList && sr.some(c => e.classList.contains(c))) return true; return false; };
    const out = [];
    document.querySelectorAll(`#s-${sid} .phone *`).forEach(el => {
      if (hidden(el) || !el.getClientRects().length) return;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') return;
      const cut = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
      if (cut && el.scrollWidth > el.clientWidth + 1) out.push({ el: el.tagName.toLowerCase() + '.' + [...el.classList].join('.'), text: el.textContent.trim().slice(0, 60), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    });
    return out;
  }, [id, srOnly]);
  found.forEach(x => report.clipped.push({ id, ...x }));
}

const browser = await chromium.launch();
try {
  if (!width) {
    const { ctx, p } = await open(browser, { width: 1280, height: 1000 }, theme);
    for (const id of wanted) {
      await show(p, id);
      await p.locator(`#s-${id}`).screenshot({ path: path.join(DIR, `sec-${id}.png`) });
      await cut(p, id, theme);
      await probes(p, id, theme);
      await shootPhones(p, id);
    }
    await ctx.close();
    const m = await open(browser, { width: phoneW, height: phoneH }, `${theme} ${phoneW}`);
    for (const id of wanted) {
      await show(m.p, id);
      await overflow(m.p, id, `${theme} ${phoneW}`);
    }
    await m.ctx.close();
  } else {
    const { ctx, p } = await open(browser, { width, height: 900 }, `${theme} ${width}`);
    for (const id of wanted) {
      await show(p, id);
      await overflow(p, id, `${theme} ${width}`);
      await cut(p, id, `${theme} ${width}`);
      await probes(p, id, `${theme} ${width}`);
      await clipped(p, id);
      await shootPhones(p, id);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
const full = { shot: wanted, machine, ...report, advisory };
fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(full, null, 2));
fs.writeFileSync(path.join(DIR, 'labels.json'), JSON.stringify(labels, null, 2));
console.log(JSON.stringify({ shot: wanted, ...report, advisory: { contrast: advisory.contrast.length, targets: advisory.targets.length } }));
process.exit(Object.values(report).some(v => v.length) ? 1 : 0);
