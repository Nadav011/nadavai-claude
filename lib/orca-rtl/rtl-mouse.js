/*orca-rtl-mouse:1*/
// Pointer and selection mapping for terminal rows that hold Hebrew or Arabic.
//
// The RTL patch lets the browser reorder such a row (Unicode bidi), while xterm keeps
// mapping the pointer by a fixed grid: column = x / cell width. In a reordered row the
// character under the pointer is then not the character in that grid cell, so a drag
// selected other text, a double click took another word, a link was clickable somewhere
// else, and the selection block was painted over text that was not selected.
//
// patch.mjs puts this file at the top of the asset that holds xterm's DOM renderer and
// routes three xterm methods through it:
//   MouseService.getCoords             -> coords()  selection, double click, link hover
//   MouseService.getMouseReportCoords  -> report()  clicks sent to the program in the terminal
//   DomRenderer._createSelectionElement -> sel()    the selection block of a partly selected row
// Each one reads where the browser really put every cell of the row and answers from that.
// A row with no RTL character, a renderer that is not the DOM renderer, or anything this
// file does not recognise gets xterm's own answer back unchanged.
globalThis.__orcaRtlMouse || (globalThis.__orcaRtlMouse = (() => {
  // Same ranges as the row patch in patch.mjs (Hebrew, Arabic and their presentation forms).
  const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const EPS = 1.5; // px: two cells closer than this are neighbours on screen
  const cache = new WeakMap(); // row element -> last layout
  const watched = new WeakMap(); // row element -> { observer } of its selection block

  function domRenderer(renderService) {
    const r = renderService && renderService._renderer && renderService._renderer.value;
    return r && r._rowElements && r._bufferService && r._rowFactory && r.dimensions ? r : null;
  }

  // Where each cell of a viewport row is on screen, in px from the row's left edge.
  // null = not an RTL row, or the row on screen is not the row in the buffer right now.
  function layout(r, row) {
    const rowEl = r._rowElements[row];
    if (!rowEl) return null;
    const text = rowEl.textContent;
    if (!text || !RTL.test(text)) return null;
    const rect = rowEl.getBoundingClientRect();
    const cw = r.dimensions.css.cell.width;
    const hit = cache.get(rowEl);
    if (hit && hit.first === rowEl.firstChild && hit.last === rowEl.lastChild && hit.n === rowEl.childNodes.length &&
        hit.text === text && hit.cw === cw && hit.width === rect.width) return hit.v;

    const buf = r._bufferService.buffer;
    const line = buf.lines.get(buf.ydisp + row);
    const cell = r._rowFactory._workCell;
    if (!line || !cell) return null;

    // The row is a list of spans, one text node each, holding the cells' characters in buffer order.
    const nodes = [];
    let at = 0;
    for (const span of rowEl.childNodes) {
      const tn = span.firstChild;
      if (!tn || tn.nodeType !== 3 || span.childNodes.length !== 1) return null;
      nodes.push({ tn, start: at, end: at + tn.data.length });
      at += tn.data.length;
    }
    if (at !== text.length) return null;

    const cells = [];
    const range = rowEl.ownerDocument.createRange();
    let off = 0, ni = 0, left = Infinity, right = -Infinity;
    for (let x = 0; x < line.length && off < text.length; x++) {
      line.loadCell(x, cell);
      const w = cell.getWidth();
      if (w === 0) continue; // second half of a wide character: drawn by the cell before it
      const chars = cell.isInvisible() ? ' ' : (cell.getChars() || ' ');
      const shown = text.substr(off, chars.length);
      if (shown !== chars && !(chars === ' ' && shown === ' ')) return null;
      while (ni < nodes.length && off >= nodes[ni].end) ni++;
      const nd = nodes[ni];
      if (!nd || off + chars.length > nd.end) return null;
      range.setStart(nd.tn, off - nd.start);
      range.setEnd(nd.tn, off - nd.start + chars.length);
      const b = range.getBoundingClientRect();
      const c = { col: x, w, l: b.left - rect.left, r: b.right - rect.left, ch: chars };
      cells.push(c);
      if (c.l < left) left = c.l;
      if (c.r > right) right = c.r;
      off += chars.length;
    }
    if (off !== text.length || !cells.length) return null;
    const lastCell = cells[cells.length - 1];
    const v = {
      cells, left, right, width: rect.width,
      len: lastCell.col + lastCell.w, // columns the row's text takes
      // A row whose first strong character is RTL is laid out from the right edge.
      rtlBase: left > (rect.width - right) + 0.5,
    };
    cache.set(rowEl, { first: rowEl.firstChild, last: rowEl.lastChild, n: rowEl.childNodes.length, text, cw, width: rect.width, v });
    return v;
  }

  // Index of the cell drawn at px, or -1 when px is outside the row's text.
  function cellAt(v, px) {
    if (px < v.left || px >= v.right) return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < v.cells.length; i++) {
      const c = v.cells[i];
      if (px >= c.l && px < c.r) return i;
      const d = px < c.l ? c.l - px : px - c.r;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // true when the cell's logical start (the boundary it shares with the cell before it) is its
  // right edge. Read from where its neighbours ended up, so a digit or a space inside a Hebrew
  // run, and the first and last cell of a run, all come out right.
  function startsRight(v, i) {
    const c = v.cells[i], next = v.cells[i + 1], prev = v.cells[i - 1];
    if (next && Math.abs(next.r - c.l) < EPS) return true;
    if (next && Math.abs(next.l - c.r) < EPS) return false;
    if (prev && Math.abs(prev.l - c.r) < EPS) return true;
    if (prev && Math.abs(prev.r - c.l) < EPS) return false;
    return RTL.test(c.ch) || (v.rtlBase && !/[A-Za-z0-9]/.test(c.ch));
  }

  // Columns past the end of the text: the empty part of the row, which is on the left in a row
  // laid out from the right.
  function emptyCols(v, px, cw, round) {
    const d = v.rtlBase ? (px < v.left ? v.left - px : -1) : (px >= v.right ? px - v.right : -1);
    if (d < 0) return 0;
    return v.len + (round ? Math.round(d / cw) : Math.floor(d / cw));
  }

  // The column of the cell under px.
  function hitCol(v, px, cw) {
    const i = cellAt(v, px);
    if (i < 0) return emptyCols(v, px, cw, false);
    const c = v.cells[i];
    if (c.w < 2) return c.col;
    const firstHalf = startsRight(v, i) ? px >= (c.l + c.r) / 2 : px < (c.l + c.r) / 2;
    return firstHalf ? c.col : c.col + 1;
  }

  // The column boundary nearest to px (0 = before the first cell), as a selection uses it.
  function boundary(v, px, cw) {
    const i = cellAt(v, px);
    if (i < 0) return emptyCols(v, px, cw, true);
    const c = v.cells[i];
    const firstHalf = startsRight(v, i) ? px >= (c.l + c.r) / 2 : px < (c.l + c.r) / 2;
    return firstHalf ? c.col : c.col + c.w;
  }

  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  // res is xterm's own answer: [col, row], both 1-based; with isSelection the col is a boundary.
  function coords(renderService, event, isSelection, res) {
    if (!res) return res;
    try {
      const r = domRenderer(renderService);
      if (!r) return res;
      const v = layout(r, res[1] - 1);
      if (!v) return res;
      const cw = r.dimensions.css.cell.width;
      const cols = r._bufferService.cols;
      const px = event.clientX - r._rowElements[res[1] - 1].getBoundingClientRect().left;
      res[0] = isSelection ? clamp(boundary(v, px, cw), 0, cols) + 1 : clamp(hitCol(v, px, cw), 0, cols - 1) + 1;
    } catch { /* keep xterm's answer */ }
    return res;
  }

  // res is xterm's own answer: { col, row, x, y }, 0-based cells and px inside the screen.
  function report(renderService, event, res) {
    if (!res) return res;
    try {
      const r = domRenderer(renderService);
      if (!r) return res;
      const v = layout(r, res.row);
      if (!v) return res;
      const cw = r.dimensions.css.cell.width;
      const px = event.clientX - r._rowElements[res.row].getBoundingClientRect().left;
      const col = clamp(hitCol(v, px, cw), 0, r._bufferService.cols - 1);
      if (col !== res.col) { res.col = col; res.x = Math.floor((col + 0.5) * cw); }
    } catch { /* keep xterm's answer */ }
    return res;
  }

  // The on-screen stretches [left, right] that columns [c0, c1) of the row cover.
  function stretches(v, c0, c1, cw) {
    const out = [];
    for (const c of v.cells) if (c.col >= c0 && c.col < c1) out.push([c.l, c.r]);
    const a = Math.max(c0, v.len);
    if (c1 > a) {
      const s = v.rtlBase ? [v.left - (c1 - v.len) * cw, v.left - (a - v.len) * cw] : [v.right + (a - v.len) * cw, v.right + (c1 - v.len) * cw];
      s[0] = clamp(s[0], 0, v.width); s[1] = clamp(s[1], 0, v.width);
      if (s[1] > s[0]) out.push(s);
    }
    out.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const s of out) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 0.5) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    return merged;
  }

  // Fill the block of one partly selected row. el stays in place as an empty holder at the row's
  // top; its children are the painted stretches.
  function paint(st) {
    const { r, row, c0, c1, el, line } = st;
    const buf = r._bufferService.buffer;
    el.replaceChildren();
    // Scrolled since this block was made: xterm redraws the selection itself in a moment.
    if (buf.ydisp + row !== line) return;
    const cw = r.dimensions.css.cell.width;
    const v = layout(r, row);
    const parts = v ? stretches(v, c0, c1, cw) : [[c0 * cw, Math.min(c1 * cw, r.dimensions.css.canvas.width)]];
    const doc = el.ownerDocument;
    for (const [l, rr] of parts) {
      const d = doc.createElement('div');
      d.style.top = '0px';
      d.style.height = el.style.height;
      d.style.left = l + 'px';
      d.style.width = (rr - l) + 'px';
      el.appendChild(d);
    }
  }

  // el is the block xterm made for columns [c0, c1) of `rowCount` rows from viewport row `row`.
  function sel(r, row, c0, c1, rowCount, el) {
    const own = el && el.style ? [el.style.left, el.style.width] : null;
    try {
      if (rowCount !== 1 || !r || !r._rowElements || !r._bufferService || !r._rowFactory) return el;
      const rowEl = r._rowElements[row];
      if (!rowEl || !RTL.test(rowEl.textContent || '')) return el;
      const old = watched.get(rowEl);
      if (old) old.observer.disconnect();
      const buf = r._bufferService.buffer;
      const st = { r, row, c0, c1, el, line: buf.ydisp + row };
      el.style.left = '0px';
      el.style.width = '0px';
      try { paint(st); } catch (e) {
        // Could not place the stretches: give xterm's own block back as it was.
        el.replaceChildren(); el.style.left = own[0]; el.style.width = own[1];
        return el;
      }
      // xterm draws the selection first and renders the rows after it, and a selected row can
      // be rendered again while the selection stands: paint again whenever the row changes.
      const View = rowEl.ownerDocument.defaultView;
      if (View && View.MutationObserver) {
        const observer = new View.MutationObserver(() => {
          if (!el.isConnected) { observer.disconnect(); if (watched.get(rowEl) === rec) watched.delete(rowEl); return; }
          try { paint(st); } catch { /* leave the block as it is */ }
        });
        const rec = { observer };
        observer.observe(rowEl, { childList: true });
        watched.set(rowEl, rec);
      }
    } catch { /* keep xterm's block */ }
    return el;
  }

  return { coords, report, sel, version: 1 };
})());
/*orca-rtl-mouse-end*/
