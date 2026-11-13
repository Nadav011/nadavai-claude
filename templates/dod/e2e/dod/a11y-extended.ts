// Three accessibility states that axe and the standard's checks do not test (nadav-design
// `standard/experience.md`, rules A-01 to A-03, and "The automated checks"):
//   forced-colors  the operating system's high-contrast mode (Playwright `forcedColors: "active"`,
//                  which Chromium renders with the forced palette, not only as a media query)
//   text-reflow    WCAG 2.2 1.4.4 and 1.4.10: 640x512 and 320x256, the 1280x1024 window at 200%
//                  and at 400% zoom
//   text-spacing   WCAG 2.2 1.4.12: the four text-spacing overrides applied
// They run in the checks phase (`extended-checks.spec.ts`) and only report: nothing here reaches a
// score. The page-level functions take a Playwright Page; `a11yInPage` runs INSIDE the page through
// page.evaluate, so it is self-contained.
//
// Each condition that makes a finding is one line ending in `// M:<code>`: the kit's tests
// (`tests/extended-checks.mjs`) delete that line and check that its fixture stops failing.
import type { Page } from "@playwright/test";

export const A11Y_CHECK_IDS = ["forced-colors", "text-reflow", "text-spacing"] as const;
export type A11yCheckId = (typeof A11Y_CHECK_IDS)[number];

export interface A11yResult {
  count: number;
  /** Findings by kind (`boundary`, `focus`, `state`, `mark`, `sideways`, `clipped`, `unreachable`, `overlap`). */
  kinds: Record<string, number>;
  samples: string[];
  error?: string;
}

/** The text-spacing overrides of WCAG 1.4.12, as its Understanding document states them. */
export const TEXT_SPACING_CSS =
  "*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-block-end: 2em !important; }";

/** How many Tab presses the focus walk takes at most: the first controls of the page in order. */
export const FOCUS_STEPS = 25;
const FRAME_MS = 150;
const MAX_SAMPLES = 8;

interface Item {
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
 * (with `overlap`) overlapping text at the current size; `active` describes the focused element.
 */
export function a11yInPage(arg: InPageArg): Item[] | { key: string; rect: { x: number; y: number; width: number; height: number } } | null {
  const ATTR = "data-a11yx";
  const vis = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return !el.closest('[aria-hidden="true"], [inert], [hidden], dialog:not([open])');
  };
  const text = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const readable = (s: string) => /[\p{L}\p{N}]/u.test(s);
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
    items.push({ kind, key: `${kind}|${d}|${extra}`, sample: `${kind}: ${d}${extra ? ` ${extra}` : ""}` });
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
    return { key: describe(el), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
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
      if (!peer || signature(el) === signature(peer)) continue; // nothing tells them apart even in normal colours
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
      if (Math.min(r.width, r.height) < 3 || Math.max(r.width, r.height) > 600) continue;
      const s = cs(el);
      if (transparent(s.backgroundColor) || s.backgroundColor === ancestorBg(el) || hasBorder(s) || s.backgroundImage !== "none") continue;
      if (readable(text(el.parentElement ?? el))) continue; // its meaning is in the words beside it
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
      if (s.forcedColorAdjust === "none") continue; // the page keeps its own colours there
      if ((el.matches('input[type="checkbox"], input[type="radio"]') || el.matches("select")) && s.appearance !== "none") continue; // the system draws it
      if (hasBorder(s) || hasOutline(s)) continue;
      const r = el.getBoundingClientRect();
      let wrapped = false;
      for (let a = el.parentElement, i = 0; a && i < 2; a = a.parentElement, i++) {
        const w = a.getBoundingClientRect();
        if (w.width - r.width > 16 || w.height - r.height > 16) break;
        if (hasBorder(cs(a)) || hasOutline(cs(a))) wrapped = true;
      }
      if (!wrapped) add("boundary", el); // M:boundary
    }
    // A selected item that only a background or a shadow told apart from its neighbour.
    for (const el of Array.from(document.querySelectorAll(`[${ATTR}-state]`))) {
      const peer = document.querySelector(`[${ATTR}-peer="${el.getAttribute(`${ATTR}-state`)}"]`);
      if (peer && cs(el).forcedColorAdjust !== "none" && signature(el) === signature(peer)) add("state", el, "looks like its unselected neighbour"); // M:state
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
  if (arg.sideways && root.scrollWidth > root.clientWidth + 1) {
    items.push({ kind: "sideways", key: "sideways", sample: `sideways: the page scrolls sideways (${root.scrollWidth}>${root.clientWidth})` }); // M:sideways
  }
  const nodes: { node: Text; el: HTMLElement; rects: DOMRect[] }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t && nodes.length < 800; t = walker.nextNode() as Text | null) {
    if (!/\S/.test(t.data)) continue;
    const el = t.parentElement;
    if (!el || el.closest("script, style, noscript, template, textarea, select, option") || !vis(el)) continue;
    const r0 = el.getBoundingClientRect();
    if (r0.width < 2 || r0.height < 2) continue; // visually hidden text (sr-only)
    if (el.closest('[aria-roledescription="carousel"], [aria-roledescription="slide"]')) continue; // a slide is meant to be out of view
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
  for (const { node, el, rects } of nodes) {
    const u = union(rects);
    let hidden = false;
    let clipped = false;
    let scrolls = false;
    for (let a: HTMLElement | null = el; a && a !== document.documentElement; a = a.parentElement) {
      // The body's overflow belongs to the window while the root's is visible: judged below as the page's.
      if (a === document.body && cs(document.documentElement).overflowX === "visible" && cs(document.documentElement).overflowY === "visible") continue;
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
      if ((clipX && (u.right <= box.left || u.left >= box.right)) || (clipY && (u.bottom <= box.top || u.top >= box.bottom))) {
        hidden = true; // wholly outside its box: a closed panel, not a cut line
        break;
      }
      if ((clipX && (u.left < box.left - 1 || u.right > box.right + 1)) || (clipY && (u.top < box.top - 1 || u.bottom > box.bottom + 1))) {
        clipped = true;
        break;
      }
    }
    if (hidden || scrolls) continue;
    if (clipped) {
      add("clipped", el, `"${words(node)}"`); // M:clipped
      continue;
    }
    // Partly beside the window, on a side the page cannot scroll to: on the right of a right-to-left
    // page, on the left of a left-to-right one, or either side when the page does not scroll sideways.
    const w = window.innerWidth;
    const pastRight = u.right > w + 1 && u.left < w;
    const pastLeft = u.left < -1 && u.right > 0;
    if ((pastRight && (rtl || !pageScrolls)) || (pastLeft && (!rtl || !pageScrolls))) add("unreachable", el, `"${words(node)}"`); // M:unreachable
  }
  if (arg.overlap) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const hit = a.rects.some((p) => b.rects.some((q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1));
        if (hit) {
          const pair = [describe(a.el), describe(b.el)].sort();
          items.push({ kind: "overlap", key: `overlap|${pair.join("|")}|${words(a.node)}|${words(b.node)}`, sample: `overlap: "${words(a.node)}" and "${words(b.node)}"` }); // M:overlap
        }
      }
    }
  }
  return items;
}

function result(items: Item[]): A11yResult {
  const seen = new Set<string>();
  const kept = items.filter((i) => !seen.has(i.key) && !!seen.add(i.key));
  const kinds: Record<string, number> = {};
  for (const i of kept) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
  return { count: kept.length, kinds, samples: kept.slice(0, MAX_SAMPLES).map((i) => i.sample) };
}

/** a11yInPage in the page, with its argument typed as the union it takes. */
const inPage = (page: Page, arg: InPageArg) => page.evaluate(a11yInPage, arg);

const settleFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => page.waitForTimeout(FRAME_MS));

/**
 * forced-colors: with the system's high-contrast colours on, every control keeps a visible
 * boundary, every focused element shows a visible change, and nothing that told two things apart
 * by a background or a shadow alone loses that. Leaves forced colours off again.
 */
export async function forcedColorsCheck(page: Page): Promise<A11yResult> {
  const items: Item[] = [];
  try {
    await inPage(page, { op: "prepare" });
    await page.emulateMedia({ forcedColors: "active" });
    await settleFrame(page);
    items.push(...((await inPage(page, { op: "forced" })) as Item[]));
    // The focus walk: Tab, picture the focused element with a margin, take focus away, picture it
    // again. The same pixels both times mean no visible focus indicator in these colours.
    const seen = new Set<string>();
    for (let i = 0; i < FOCUS_STEPS; i++) {
      await page.keyboard.press("Tab");
      const at = (await inPage(page, { op: "active" })) as { key: string; rect: { x: number; y: number; width: number; height: number } } | null;
      if (!at) continue;
      if (seen.has(at.key)) break; // back at the start: the walk went round the page
      seen.add(at.key);
      const vp = page.viewportSize() ?? { width: 1280, height: 800 };
      const x = Math.max(0, Math.floor(at.rect.x - 6));
      const y = Math.max(0, Math.floor(at.rect.y - 6));
      const clip = { x, y, width: Math.min(vp.width - x, Math.ceil(at.rect.width + 12)), height: Math.min(vp.height - y, Math.ceil(at.rect.height + 12)) };
      if (clip.width < 2 || clip.height < 2) continue;
      const focused = await page.screenshot({ clip, animations: "disabled", caret: "hide", scale: "css" });
      await inPage(page, { op: "blur" });
      const blurred = await page.screenshot({ clip, animations: "disabled", caret: "hide", scale: "css" });
      if (focused.equals(blurred)) items.push({ kind: "focus", key: `focus|${at.key}`, sample: `focus: ${at.key} shows no visible change when focused` }); // M:focus
    }
    return result(items);
  } finally {
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
 * page cannot scroll to; at 320x256 also no sideways scroll of the page. Leaves the viewport as it was.
 */
export async function textReflowCheck(page: Page): Promise<A11yResult> {
  const before = page.viewportSize();
  const items: Item[] = [];
  try {
    for (const size of REFLOW_SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await settleFrame(page);
      const at = (await inPage(page, { op: "text", overlap: false, sideways: size.sideways })) as Item[];
      items.push(...at.map((i) => ({ ...i, sample: `${size.width}x${size.height} ${i.sample}` })));
    }
    return result(items);
  } finally {
    if (before) await page.setViewportSize(before).catch(() => {});
  }
}

/**
 * text-spacing: with the four overrides of 1.4.12 applied, no text is cut that was whole before,
 * and no two texts overlap that did not before. Removes the overrides again.
 */
export async function textSpacingCheck(page: Page): Promise<A11yResult> {
  const baseline = (await inPage(page, { op: "text", overlap: true, sideways: false })) as Item[];
  const style = await page.addStyleTag({ content: TEXT_SPACING_CSS });
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
    await style.evaluate((el) => (el as Element).remove()).catch(() => {});
  }
}
