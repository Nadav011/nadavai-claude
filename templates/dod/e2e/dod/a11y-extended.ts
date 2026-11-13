// Three accessibility states that axe and the standard's checks do not test (nadav-design
// `standard/experience.md`, rules A-01 to A-03, and "The automated checks"):
//   forced-colors  the operating system's high-contrast mode (Playwright `forcedColors: "active"`,
//                  which Chromium renders with the forced palette, not only as a media query)
//   text-reflow    WCAG 2.2 1.4.4 at 640x512 (the 1280x1024 window at 200%) and 1.4.10 at 320x256
//                  (at 400%), with 1.4.10's exception for a part that needs two dimensions
//   text-spacing   WCAG 2.2 1.4.12: the four text-spacing overrides applied
// They run in the checks phase (`extended-checks.spec.ts`) and only report: nothing here reaches a
// score. The page-level functions take a Playwright Page; `a11yInPage` runs INSIDE the page through
// page.evaluate, so it is self-contained.
//
// The focus walk of forced-colors presses Tab and moves focus away, and every check changes the
// window, which runs the page's own handlers. So every check runs under `installWriteGuard`: every
// write of the context (a request that is not GET, HEAD or OPTIONS) is aborted and recorded, except a
// page's own while it loads, and the caller reports it as a `write-held` finding. The caller never
// closes a check's page (see installWriteGuard).
//
// Each condition that makes or withholds a finding is one line ending in `// M:<code>`: the kit's
// tests (`tests/extended-checks.mjs`) delete that line, and change the thresholds one at a time, and
// check that a fixture test fails.
import type { BrowserContext, Page } from "@playwright/test";

export const A11Y_CHECK_IDS = ["forced-colors", "text-reflow", "text-spacing"] as const;
export type A11yCheckId = (typeof A11Y_CHECK_IDS)[number];

export interface A11yResult {
  /** Findings, one per element (two elements with the same words are two findings). */
  count: number;
  /** Findings by kind (`boundary`, `focus`, `state`, `mark`, `sideways`, `clipped`, `unreachable`, `overlap`, `write-held`). */
  kinds: Record<string, number>;
  samples: string[];
  /** What the check could not judge, said so; never a finding. */
  notes?: string[];
  error?: string;
}

/** The text-spacing overrides of WCAG 1.4.12, as its Understanding document states them. */
export const TEXT_SPACING_CSS =
  "*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-block-end: 2em !important; }";

/** How many Tab presses the focus walk takes at most: the first controls of the page in order. */
export const FOCUS_STEPS = 25;
/** The margin around a focused element that its picture takes, so an outline drawn outside it counts. */
export const FOCUS_MARGIN = 6;
const FRAME_MS = 150;
const MAX_SAMPLES = 8;
/** The methods the guard lets through while a check runs. */
export const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export interface Item {
  kind: string;
  key: string;
  sample: string;
}

type InPageArg =
  | { op: "prepare" }
  | { op: "forced" }
  | { op: "text"; overlap: boolean; sideways: boolean }
  | { op: "active" }
  | { op: "blur" }
  | { op: "cleanup" };

/**
 * Everything measured inside the page. `prepare` runs in normal colours and marks what forced
 * colours must keep apart (a selected item and its unselected neighbour; a small mark painted only
 * by its background); `forced` runs with forced colours on; `text` lists clipped, unreachable and
 * (with `overlap`) overlapping text at the current size, and (with `sideways`) a sideways scroll of
 * the page that is not 1.4.10's exception; `active` describes the focused element.
 */
export function a11yInPage(arg: InPageArg): Item[] | { key: string; label: string; rect: { x: number; y: number; width: number; height: number } } | null {
  const ATTR = "data-a11yx";
  const vis = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false; // M:vis-opacity
    return !el.closest('[aria-hidden="true"], [inert], [hidden], dialog:not([open])');
  };
  const text = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const readable = (s: string) => /[\p{L}\p{N}]/u.test(s);
  // An element's place in the body: the same before and after a style change (a stylesheet goes into
  // the head), and different for two elements with the same words, so each element is its own finding.
  const all = Array.from(document.body.getElementsByTagName("*"));
  const indexOf = (el: Element) => all.indexOf(el);
  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const label = (el.getAttribute("aria-label") || text(el) || el.getAttribute("placeholder") || "").slice(0, 30);
    return `<${tag}${id}>${label ? ` "${label}"` : ""}`;
  };
  const cs = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo);
  const sides = ["Top", "Right", "Bottom", "Left"] as const;
  const hasBorder = (s: CSSStyleDeclaration) =>
    sides.some((d) => parseFloat(s.getPropertyValue(`border-${d.toLowerCase()}-width`)) >= 1 && !["none", "hidden"].includes(s.getPropertyValue(`border-${d.toLowerCase()}-style`)));
  const hasOutline = (s: CSSStyleDeclaration) => s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 1;
  const transparent = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  const ancestorBg = (el: Element) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const bg = cs(a).backgroundColor;
      if (!transparent(bg)) return bg;
    }
    return "rgb(255, 255, 255)";
  };
  const items: Item[] = [];
  const add = (kind: string, el: Element, extra = "") => {
    const d = describe(el);
    items.push({ kind, key: `${kind}|${indexOf(el)}|${extra}`, sample: `${kind}: ${d}${extra ? ` ${extra}` : ""}` });
  };

  if (arg.op === "cleanup") {
    for (const el of Array.from(document.querySelectorAll(`[${ATTR}-state], [${ATTR}-peer], [${ATTR}-mark]`))) {
      el.removeAttribute(`${ATTR}-state`);
      el.removeAttribute(`${ATTR}-peer`);
      el.removeAttribute(`${ATTR}-mark`);
    }
    return null;
  }

  if (arg.op === "active") {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement || !vis(el)) return null;
    const r = el.getBoundingClientRect();
    return { key: String(indexOf(el)), label: describe(el), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  }

  if (arg.op === "blur") {
    (document.activeElement as HTMLElement | null)?.blur();
    return null;
  }

  // How a state element and its neighbour differ: in normal colours every paint counts; in forced
  // colours a background and a shadow are what the forced palette removes, so they are left out
  // only by the palette itself (it computes them as Canvas and none).
  const signature = (el: Element) => {
    const s = cs(el);
    const pseudo = ["::before", "::after"].map((p) => {
      const q = cs(el, p);
      return [q.content, hasBorder(q), q.backgroundColor, q.backgroundImage !== "none"].join("/");
    });
    const kids = Array.from(el.children).filter((c) => vis(c)).length;
    return JSON.stringify([
      sides.map((d) => [s.getPropertyValue(`border-${d.toLowerCase()}-width`), s.getPropertyValue(`border-${d.toLowerCase()}-style`), s.getPropertyValue(`border-${d.toLowerCase()}-color`)]),
      s.outlineStyle,
      s.outlineWidth,
      s.fontWeight,
      s.fontStyle,
      s.textDecorationLine,
      s.color,
      s.backgroundColor,
      s.backgroundImage !== "none",
      s.boxShadow,
      s.opacity,
      kids,
      pseudo,
    ]);
  };
  const STATE = '[aria-selected="true"], [aria-current]:not([aria-current="false"]), [aria-pressed="true"], [aria-checked="true"]:not(input), [data-state="active"], [data-state="on"], [data-state="checked"]:not(input)';

  if (arg.op === "prepare") {
    let n = 0;
    for (const el of Array.from(document.querySelectorAll(STATE))) {
      if (!vis(el)) continue;
      const role = el.getAttribute("role");
      const box = el.parentElement?.parentElement ?? el.parentElement;
      const peer = Array.from(box?.querySelectorAll(el.tagName) ?? []).find(
        (p) => p !== el && !p.matches(STATE) && p.getAttribute("role") === role && !p.contains(el) && !el.contains(p) && vis(p),
      );
      if (!peer) continue;
      if (signature(el) === signature(peer)) continue; // nothing tells them apart even in normal colours // M:state-differs
      el.setAttribute(`${ATTR}-state`, String(n));
      peer.setAttribute(`${ATTR}-peer`, String(n));
      n++;
    }
    // A small mark with no words of its own or beside it, painted only by its background: a status
    // dot, a progress fill, a colour swatch. Forced colours paint every background the page colour.
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.children.length || readable(el.textContent ?? "") || !vis(el)) continue;
      if (el.matches('img, svg, svg *, input, select, textarea, button, video, canvas, iframe, hr, br, [role="separator"], [role="none"], [role="presentation"], [data-slot="skeleton"]') || el.closest('[aria-busy="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (Math.min(r.width, r.height) < 3 || Math.max(r.width, r.height) > 600) continue; // M:mark-size
      const s = cs(el);
      if (transparent(s.backgroundColor) || hasBorder(s) || s.backgroundImage !== "none") continue;
      if (s.backgroundColor === ancestorBg(el)) continue; // painted like what is behind it: nothing to lose // M:mark-bgeq
      if (readable(text(el.parentElement ?? el))) continue; // its meaning is in the words beside it // M:mark-words
      el.setAttribute(`${ATTR}-mark`, "1");
    }
    return null;
  }

  if (arg.op === "forced") {
    // Controls keep a visible boundary: a border on some side, an outline, or a wrapper that hugs it.
    const CONTROLS =
      'button, [role="button"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), input[type="checkbox"], input[type="radio"], select, textarea, [role="combobox"], [role="textbox"], [role="spinbutton"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"]';
    for (const el of Array.from(document.querySelectorAll(CONTROLS))) {
      if (!vis(el) || el.closest('[data-sidebar="rail"]')) continue;
      const s = cs(el);
      if (s.forcedColorAdjust === "none") continue; // the page keeps its own colours there // M:boundary-fca
      if ((el.matches('input[type="checkbox"], input[type="radio"]') || el.matches("select")) && s.appearance !== "none") continue; // the system draws it // M:boundary-native
      if (hasBorder(s) || hasOutline(s)) continue;
      const r = el.getBoundingClientRect();
      let wrapped = false;
      for (let a = el.parentElement, i = 0; a && i < 2; a = a.parentElement, i++) {
        const w = a.getBoundingClientRect();
        if (w.width - r.width > 16 || w.height - r.height > 16) break;
        if (hasBorder(cs(a)) || hasOutline(cs(a))) wrapped = true; // M:boundary-wrap
      }
      if (!wrapped) add("boundary", el); // M:boundary
    }
    // A selected item that only a background or a shadow told apart from its neighbour.
    for (const el of Array.from(document.querySelectorAll(`[${ATTR}-state]`))) {
      const peer = document.querySelector(`[${ATTR}-peer="${el.getAttribute(`${ATTR}-state`)}"]`);
      if (!peer) continue;
      if (cs(el).forcedColorAdjust === "none") continue;
      if (signature(el) === signature(peer)) add("state", el, "looks like its unselected neighbour"); // M:state
    }
    for (const el of Array.from(document.querySelectorAll(`[${ATTR}-mark]`))) {
      const s = cs(el);
      if (s.forcedColorAdjust === "none") continue;
      if (!hasBorder(s) && !hasOutline(s) && s.backgroundImage === "none" && s.backgroundColor === ancestorBg(el)) add("mark", el, "painted only by its background"); // M:mark
    }
    return items;
  }

  // op "text": text that cannot be read whole at this size.
  const root = document.scrollingElement ?? document.documentElement;
  const rtl = cs(document.documentElement).direction === "rtl" || cs(document.body).direction === "rtl";
  const pageScrolls =
    root.scrollWidth > root.clientWidth + 1 && ![cs(document.documentElement).overflowX, cs(document.body).overflowX].some((o) => o === "hidden" || o === "clip");
  const w = window.innerWidth;
  // 1.4.10's exception: a part that needs two dimensions to be used. It may make the page scroll
  // sideways; anything else that does is a finding, named by the widest such element.
  // `role="application"` is not here: put on an app's root it would excuse the whole page.
  const TWO_D = 'table, [role="table"], [role="grid"], [role="treegrid"], img, svg, canvas, video, iframe, [role="img"]';
  // A table used only for layout (one column, no header cell or caption, or role none) is not data.
  const isTwoD = (t: Element) => {
    if (t.tagName !== "TABLE") return true;
    if (t.matches('[role="none"], [role="presentation"]')) return false; // M:layout-role
    if (!t.querySelector("th, caption") && !Array.from((t as HTMLTableElement).rows).some((row) => row.cells.length > 1)) return false; // M:layout-table
    return true;
  };
  const inTwoD = (el: Element) => {
    for (let t = el.closest(TWO_D); t; t = t.parentElement ? t.parentElement.closest(TWO_D) : null) if (isTwoD(t)) return true;
    return false;
  };
  if (arg.sideways && pageScrolls) {
    let widest: Element | null = null;
    let widestW = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (!(r.right > w + 1 || r.left < -1)) continue; // M:sideways-edge
      if (inTwoD(el)) continue; // M:two-d
      // A wrapper that is wide only because a two-dimensional part inside it is.
      if (Array.from(el.querySelectorAll(TWO_D)).some((t) => isTwoD(t) && t.getBoundingClientRect().width >= r.width - 1)) continue; // M:two-d-wrap
      if (r.width > widestW) {
        widest = el;
        widestW = r.width;
      }
    }
    if (widest) items.push({ kind: "sideways", key: "sideways", sample: `sideways: the page scrolls sideways (${root.scrollWidth}>${root.clientWidth}), widest ${describe(widest)} ${Math.round(widestW)}px` }); // M:sideways
  }
  const nodes: { node: Text; el: HTMLElement; rects: DOMRect[]; hidden?: boolean }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t && nodes.length < 800; t = walker.nextNode() as Text | null) {
    if (!/\S/.test(t.data)) continue;
    const el = t.parentElement;
    if (!el || el.closest("script, style, noscript, template, textarea, select, option") || !vis(el)) continue;
    const r0 = el.getBoundingClientRect();
    if (r0.width < 2 || r0.height < 2) continue; // visually hidden text (sr-only) // M:text-sronly
    if (el.closest('[aria-roledescription="carousel"], [aria-roledescription="slide"]')) continue; // a slide is meant to be out of view // M:text-carousel
    const range = document.createRange();
    range.selectNodeContents(t);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width >= 1 && r.height >= 1);
    if (rects.length) nodes.push({ node: t, el, rects });
  }
  const union = (rs: DOMRect[]) => ({
    left: Math.min(...rs.map((r) => r.left)),
    right: Math.max(...rs.map((r) => r.right)),
    top: Math.min(...rs.map((r) => r.top)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  });
  const words = (t: Text) => t.data.replace(/\s+/g, " ").trim().slice(0, 24);
  const bodyIsWindow = () => cs(document.documentElement).overflowX === "visible" && cs(document.documentElement).overflowY === "visible";
  for (const n of nodes) {
    const { node, el, rects } = n;
    const u = union(rects);
    let hidden = false;
    let clipped = false;
    let scrolls = false;
    for (let a: HTMLElement | null = el; a && a !== document.documentElement; a = a.parentElement) {
      // The body's overflow belongs to the window while the root's is visible: judged below as the page's.
      if (a === document.body && bodyIsWindow()) continue; // M:body-skip
      const s = cs(a);
      const ox = s.overflowX;
      const oy = s.overflowY;
      const clipX = ox === "hidden" || ox === "clip";
      const clipY = oy === "hidden" || oy === "clip";
      if (!clipX && !clipY) {
        if (["auto", "scroll"].includes(ox) || ["auto", "scroll"].includes(oy)) {
          scrolls = true; // reachable by scrolling its box: a wide table in its own scroller, the 1.4.10 exception // M:scroller
          break;
        }
        continue;
      }
      const b = a.getBoundingClientRect();
      const box = { left: b.left + a.clientLeft, top: b.top + a.clientTop, right: b.left + a.clientLeft + a.clientWidth, bottom: b.top + a.clientTop + a.clientHeight };
      // Wholly outside its box: a closed panel, not a cut line.
      if ((clipX && (u.right <= box.left || u.left >= box.right)) || (clipY && (u.bottom <= box.top || u.top >= box.bottom))) { hidden = true; break; } // M:text-hidden
      if ((clipX && (u.left < box.left - 1 || u.right > box.right + 1)) || (clipY && (u.top < box.top - 1 || u.bottom > box.bottom + 1))) {
        clipped = true;
        break;
      }
    }
    n.hidden = hidden;
    if (hidden || scrolls) continue;
    if (clipped) {
      add("clipped", el, `"${words(node)}"`); // M:clipped
      continue;
    }
    // Partly beside the window, on a side the page cannot scroll to: on the right of a right-to-left
    // page, on the left of a left-to-right one, or either side when the page does not scroll sideways.
    const pastRight = u.right > w + 1 && u.left < w;
    const pastLeft = u.left < -1 && u.right > 0;
    if ((pastRight && (rtl || !pageScrolls)) || (pastLeft && (!rtl || !pageScrolls))) add("unreachable", el, `"${words(node)}"`); // M:unreachable
  }
  if (arg.overlap) {
    // Text no one sees (wholly outside the box that hides it) overlaps nothing.
    const seen = nodes.filter((n) => !n.hidden);
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const a = seen[i];
        const b = seen[j];
        const hit = a.rects.some((p) => b.rects.some((q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1));
        if (hit) {
          const pair = [indexOf(a.el), indexOf(b.el)].sort((x, y) => x - y);
          items.push({ kind: "overlap", key: `overlap|${pair.join("|")}|${words(a.node)}|${words(b.node)}`, sample: `overlap: "${words(a.node)}" and "${words(b.node)}"` }); // M:overlap
        }
      }
    }
  }
  return items;
}

/** One finding per key; the samples are the first few. */
export function result(items: Item[], notes: string[] = []): A11yResult {
  const seen = new Set<string>();
  const kept = items.filter((i) => !seen.has(i.key) && !!seen.add(i.key));
  const kinds: Record<string, number> = {};
  for (const i of kept) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
  return { count: kept.length, kinds, samples: kept.slice(0, MAX_SAMPLES).map((i) => i.sample), ...(notes.length ? { notes } : {}) };
}

/** A write the guard held: the method, the path (no query, no host), where it came from, and the moment of the check. */
export interface HeldWrite {
  method: string;
  path: string;
  /** "the page", "another page of the check (a popup)" or "a worker (no page)". */
  from: string;
  moment: string;
}

export interface WriteGuard {
  /** A page about to load for a check: its requests pass until `watch`, so it loads as the scored phase saw it. */
  loading(page: Page): void;
  /** The check starts on this page; `moment` says what it is doing. */
  watch(page: Page, moment: string): void;
  /** What the check is doing now, for the record of a write held from here on. */
  moment(page: Page, moment: string): void;
  /** The writes held since the last call (and forgets them). */
  take(): HeldWrite[];
}

/**
 * The extended checks' write guard, on the whole context, before any page loads. Every request of the
 * context whose method is not GET, HEAD or OPTIONS is aborted and recorded, whatever sent it: the
 * check's page, a popup it opened, a dedicated worker, a request a service worker forwards or makes;
 * except a request of a page that is loading for a check (`loading`, until `watch`), so that page
 * loads as the scored phase saw it, reads through POST included. A SharedWorker's requests never reach
 * a context route, so the guard takes `SharedWorker` away from the context's pages before they load.
 * What the guard cannot stop is what leaves while a page closes (its pagehide, visibilitychange and
 * unload handlers' beacons and keepalive fetches go out from the browser process, unseen): the caller
 * never closes a check's page, and the test's context closes them all at its end, which, measured on
 * Playwright 1.60.0 and 1.64.1, runs none of those handlers. Not held: a WebSocket message, and a GET
 * that changes data.
 */
export async function installWriteGuard(context: BrowserContext): Promise<WriteGuard> {
  const loadingPages = new Set<Page>();
  const known = new Set<Page>();
  const held: HeldWrite[] = [];
  let now = "the check started";
  await context.addInitScript(() => Object.defineProperty(window, "SharedWorker", { value: undefined, configurable: true })); // M:shared-worker
  await context.route("**/*", (route) => {
    const req = route.request();
    let page: Page | null = null;
    try {
      page = req.frame().page();
    } catch {
      page = null; // a service worker's request, or a worker's, has no frame
    }
    let hold = !SAFE_METHODS.includes(req.method());
    if (page && loadingPages.has(page)) hold = false; // M:guard-loading
    if (hold) {
      const from = !page ? "a worker (no page)" : known.has(page) ? "the page" : "another page of the check (a popup)";
      held.push({ method: req.method(), path: new URL(req.url()).pathname, from, moment: now });
      return route.abort("blockedbyclient"); // M:guard
    }
    return route.fallback();
  });
  return {
    loading: (page) => void loadingPages.add(page),
    watch: (page, moment) => {
      loadingPages.delete(page);
      known.add(page);
      now = moment;
    },
    moment: (_page, moment) => {
      now = moment;
    },
    take: () => held.splice(0),
  };
}

/** A check's result with the writes the guard held during it added, one `write-held` finding each. */
export function withHeld(r: A11yResult, held: HeldWrite[]): A11yResult {
  if (!held.length) return r;
  const kinds = { ...r.kinds, "write-held": (r.kinds["write-held"] ?? 0) + held.length };
  const samples = [...held.map((h) => `write-held: ${h.from} tried to save (${h.method} ${h.path}) when ${h.moment}; the guard stopped it`), ...r.samples].slice(0, MAX_SAMPLES);
  return { ...r, count: r.count + held.length, kinds, samples };
}

/** a11yInPage in the page, with its argument typed as the union it takes. */
const inPage = (page: Page, arg: InPageArg) => page.evaluate(a11yInPage, arg);

const settleFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => page.waitForTimeout(FRAME_MS));

/**
 * forced-colors: with the system's high-contrast colours on, every control keeps a visible
 * boundary, every focused element shows a visible change, and nothing that told two things apart
 * by a background or a shadow alone loses that. Leaves forced colours off again.
 */
export async function forcedColorsCheck(page: Page, guard: WriteGuard): Promise<A11yResult> {
  const items: Item[] = [];
  guard.watch(page, "forced colours were switched on");
  try {
    await inPage(page, { op: "prepare" });
    await page.emulateMedia({ forcedColors: "active" });
    await settleFrame(page);
    items.push(...((await inPage(page, { op: "forced" })) as Item[]));
    // The focus walk: Tab, picture the focused element with a margin, take focus away, picture it
    // again. The same pixels both times mean no visible focus indicator in these colours.
    const seen = new Set<string>();
    for (let i = 0; i < FOCUS_STEPS; i++) {
      guard.moment(page, "focus moved on with Tab");
      await page.keyboard.press("Tab");
      const at = (await inPage(page, { op: "active" })) as { key: string; label: string; rect: { x: number; y: number; width: number; height: number } } | null;
      if (!at) continue;
      if (seen.has(at.key)) break; // back at the start: the walk went round the page
      seen.add(at.key);
      guard.moment(page, `focus moved to ${at.label}`);
      const vp = page.viewportSize() ?? { width: 1280, height: 800 };
      const x = Math.max(0, Math.floor(at.rect.x - FOCUS_MARGIN));
      const y = Math.max(0, Math.floor(at.rect.y - FOCUS_MARGIN));
      const clip = { x, y, width: Math.min(vp.width - x, Math.ceil(at.rect.width + 2 * FOCUS_MARGIN)), height: Math.min(vp.height - y, Math.ceil(at.rect.height + 2 * FOCUS_MARGIN)) };
      if (clip.width < 2 || clip.height < 2) continue;
      const focused = await page.screenshot({ clip, animations: "disabled", caret: "hide", scale: "css" });
      guard.moment(page, `focus left ${at.label}`);
      await inPage(page, { op: "blur" });
      const blurred = await page.screenshot({ clip, animations: "disabled", caret: "hide", scale: "css" });
      if (focused.equals(blurred)) items.push({ kind: "focus", key: `focus|${at.key}`, sample: `focus: ${at.label} shows no visible change when focused` }); // M:focus
    }
    return result(items);
  } finally {
    guard.moment(page, "the check ended");
    await page.emulateMedia({ forcedColors: "none" }).catch(() => {});
    await inPage(page, { op: "cleanup" }).catch(() => {});
  }
}

/** The two sizes of text-reflow: the 1280x1024 window at 200% zoom (1.4.4) and at 400% (1.4.10). */
export const REFLOW_SIZES = [
  { width: 640, height: 512, sideways: false },
  { width: 320, height: 256, sideways: true },
] as const;

/**
 * text-reflow: at 640x512 no text is cut by a box that hides its overflow or pushed off a side the
 * page cannot scroll to (1.4.4: scrolling sideways is allowed); at 320x256 the same, and the page
 * scrolls sideways only for a part that needs two dimensions (1.4.10). Leaves the viewport as it was.
 */
export async function textReflowCheck(page: Page, guard: WriteGuard): Promise<A11yResult> {
  const before = page.viewportSize();
  const items: Item[] = [];
  guard.watch(page, "the check started");
  try {
    for (const size of REFLOW_SIZES) {
      guard.moment(page, `the window was resized to ${size.width}x${size.height}`);
      await page.setViewportSize({ width: size.width, height: size.height });
      await settleFrame(page);
      const at = (await inPage(page, { op: "text", overlap: false, sideways: size.sideways })) as Item[];
      items.push(...at.map((i) => ({ ...i, sample: `${size.width}x${size.height} ${i.sample}` })));
    }
    return result(items);
  } finally {
    guard.moment(page, "the window was put back");
    if (before) await page.setViewportSize(before).catch(() => {});
  }
}

/**
 * text-spacing: with the four overrides of 1.4.12 applied, no text is cut that was whole before,
 * and no two texts overlap that did not before. Removes the overrides again.
 */
export async function textSpacingCheck(page: Page, guard: WriteGuard, css: string = TEXT_SPACING_CSS): Promise<A11yResult> {
  guard.watch(page, "the check started");
  const baseline = (await inPage(page, { op: "text", overlap: true, sideways: false })) as Item[];
  guard.moment(page, "text spacing was enlarged");
  const style = await page.addStyleTag({ content: css });
  try {
    await settleFrame(page);
    const after = (await inPage(page, { op: "text", overlap: true, sideways: false })) as Item[];
    const had = new Set(baseline.map((i) => i.key));
    const fresh: Item[] = [];
    for (const i of after) {
      if (had.has(i.key)) continue; // M:spacing-new
      fresh.push(i);
    }
    return result(fresh);
  } finally {
    guard.moment(page, "text spacing was put back");
    await style.evaluate((el) => (el as Element).remove()).catch(() => {});
  }
}
