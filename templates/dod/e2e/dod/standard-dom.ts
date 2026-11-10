// The experience standard's DOM checks (nadav-design `standard/experience.md`, "The automated
// checks"). Each function here runs INSIDE the page through page.evaluate, so it is
// self-contained: everything it needs is defined in it or passed in as an argument.
//
// A check returns { count, samples }: count is the number of offending elements, samples the
// first few, described well enough to find them without a second run.

export interface CheckResult {
  count: number;
  samples: string[];
  /** Why the check did not run on this entry, when it did not. */
  skipped?: string;
}

export interface DomCheckArgs {
  /** help-door does not apply to a route flagged `static`. */
  helpDoor: boolean;
  /** nav-count runs at 375 only. */
  navCount: boolean;
  /** forbidden-words patterns, as RegExp sources (a RegExp does not cross into the page). */
  forbidden: { label: string; source: string }[];
}

/** Built-in forbidden wording, from rules C-01 and C-03. A project adds to it, never removes. */
export const BUILT_IN_FORBIDDEN: { label: string; source: string }[] = [
  // Whole words, with the conjunction ו as the one prefix taken ("ונא" is still "נא"); ש is
  // taken only before ניתן, because "שנא" is another word.
  ...["נא", "אנא", "ניתן", "כעת", "אופס"].map((w) => ({
    label: w,
    source: `(?<!\\p{L})ו?${w}(?!\\p{L})`,
  })),
  { label: "שניתן", source: "(?<!\\p{L})שניתן(?!\\p{L})" },
  { label: "exclamation mark", source: "!" },
  { label: "emoji", source: "\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F" },
  // "מטפל/ית", "הגיע/ה", "מטפלים/ות", and the same with a dot ("מטפל.ת").
  { label: "slash or dot gender form", source: "[א-ת][/.](ה|ת|ית|תה|ות|יות)(?![א-ת])" },
];

/** A project word from standard.json, as a whole word. */
export function forbiddenWordSource(word: string): { label: string; source: string } {
  const esc = word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return { label: word, source: `(?<!\\p{L})${esc}(?!\\p{L})` };
}

/** Every per-entry DOM check, in one pass over the page. */
export function domChecks(args: DomCheckArgs): Record<string, CheckResult> {
  const MAX = 6;
  const vis = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return !el.closest('[aria-hidden="true"], [inert], [hidden], dialog:not([open])');
  };
  const text = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? "").trim();
  // "Visible text" is text a reader can read: a lone icon glyph ("?", "ⓘ") is not.
  const readable = (s: string) => /[\p{L}\p{N}]/u.test(s);
  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const label = (el.getAttribute("aria-label") || text(el) || el.getAttribute("placeholder") || "").slice(0, 40);
    return `${tag}${id}${label ? ` "${label}"` : ""}`;
  };
  const byIds = (ids: string | null) =>
    (ids ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id));
  const pointsAtVisibleText = (el: Element, attr: string) =>
    byIds(el.getAttribute(attr)).some((t) => vis(t) && readable(text(t)));
  const mk = (): CheckResult => ({ count: 0, samples: [] });
  const add = (c: CheckResult, s: string) => {
    c.count++;
    if (c.samples.length < MAX) c.samples.push(s);
  };
  const out: Record<string, CheckResult> = {};

  // help-door (G-01): the door in the top bar, and the screen's own entry in its header.
  {
    const c = mk();
    if (!args.helpDoor) c.skipped = "static route";
    else {
      const doors = [...document.querySelectorAll('[data-help="door"]')].filter(vis);
      // The top bar: inside a header or banner, or in the first 120px of the page.
      const inTopBar = doors.some(
        (d) => d.closest('header, [role="banner"]') || d.getBoundingClientRect().top + window.scrollY < 120,
      );
      if (!inTopBar) add(c, doors.length ? 'the [data-help="door"] is not in the top bar' : 'no visible [data-help="door"]');
      if (![...document.querySelectorAll('[data-help="screen"]')].some(vis)) add(c, 'no visible [data-help="screen"]');
    }
    out["help-door"] = c;
  }

  // tooltip-only (G-04): the only words are in a title or a hover tooltip.
  {
    const c = mk();
    const ownWords = (el: HTMLElement) => {
      if (el.matches("input, select, textarea")) {
        const f = el as HTMLInputElement;
        return [...(f.labels ?? [])].some((l) => vis(l) && readable(text(l))) || pointsAtVisibleText(el, "aria-labelledby");
      }
      return readable(text(el)) || pointsAtVisibleText(el, "aria-labelledby");
    };
    const seen = new Set<Element>();
    for (const el of document.body.querySelectorAll("[title]")) {
      if (!vis(el) || !el.getAttribute("title")?.trim() || el.matches("iframe, svg *")) continue;
      if (el.closest("[data-help]") || ownWords(el) || pointsAtVisibleText(el, "aria-describedby")) continue;
      seen.add(el);
      add(c, `${describe(el)} title="${el.getAttribute("title")!.slice(0, 40)}"`);
    }
    // A tooltip component that is described-by a hidden [role=tooltip] and has no words.
    for (const el of document.body.querySelectorAll("[aria-describedby]")) {
      if (seen.has(el) || !vis(el) || el.closest("[data-help]") || ownWords(el)) continue;
      const targets = byIds(el.getAttribute("aria-describedby")).filter(Boolean) as Element[];
      if (targets.length && targets.every((t) => t.matches('[role="tooltip"]') && !vis(t)))
        add(c, `${describe(el)} described only by a hidden tooltip`);
    }
    out["tooltip-only"] = c;
  }

  // disabled-reason (E-02): a disabled control shows why, in a visible line.
  {
    const c = mk();
    for (const el of document.body.querySelectorAll(
      'button:disabled, input:disabled:not([type="hidden"]), select:disabled, textarea:disabled, [aria-disabled="true"]',
    )) {
      if (!vis(el) || el.closest('[aria-busy="true"]')) continue;
      if (pointsAtVisibleText(el, "aria-describedby")) continue;
      add(c, describe(el));
    }
    out["disabled-reason"] = c;
  }

  // placeholder-label (I-01): a placeholder is never the label.
  {
    const c = mk();
    for (const el of document.body.querySelectorAll<HTMLInputElement>("input[placeholder], textarea[placeholder]")) {
      if (!vis(el) || !el.placeholder.trim()) continue;
      const labelled =
        [...(el.labels ?? [])].some((l) => vis(l) && readable(text(l))) || pointsAtVisibleText(el, "aria-labelledby");
      if (!labelled) add(c, describe(el));
    }
    out["placeholder-label"] = c;
  }

  // input-attrs (I-03): autocomplete always; the keyboard that fits; text of 16px or more.
  {
    const c = mk();
    const NOT_TEXT = /^(hidden|submit|button|reset|image|checkbox|radio|file|range|color)$/;
    for (const el of document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    )) {
      if (!vis(el)) continue;
      const isInput = el instanceof HTMLInputElement;
      if (isInput && NOT_TEXT.test(el.type)) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (px < 16) add(c, `${describe(el)} text ${px}px (under 16px zooms the page on iOS)`);
      if (!isInput) continue;
      if (!el.hasAttribute("autocomplete")) add(c, `${describe(el)} has no autocomplete attribute`);
      const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
      const hint = [
        el.name,
        el.id,
        ac,
        el.getAttribute("aria-label"),
        el.placeholder,
        ...[...(el.labels ?? [])].map((l) => text(l)),
      ]
        .join(" ")
        .toLowerCase();
      const type = el.type.toLowerCase();
      const mode = (el.getAttribute("inputmode") ?? "").toLowerCase();
      if ((/(^|\s)tel/.test(ac) || /\b(tel|phone|mobile)\b|טלפון|נייד/.test(hint)) && type !== "tel" && mode !== "tel")
        add(c, `${describe(el)} is a phone field without type="tel" or inputmode="tel"`);
      else if (
        (/(^|\s)email/.test(ac) || /e-?mail|דוא"ל|אימייל|מייל/.test(hint)) &&
        type !== "email" &&
        mode !== "email"
      )
        add(c, `${describe(el)} is an email field without type="email" or inputmode="email"`);
      else if (
        (/one-time-code|cc-number|cc-csc|postal-code/.test(ac) ||
          /\b(amount|price|qty|quantity|otp|zip)\b|סכום|מחיר|כמות|מיקוד|קוד אימות/.test(hint)) &&
        type !== "number" &&
        !/^(numeric|decimal)$/.test(mode)
      )
        add(c, `${describe(el)} is a number field without type="number" or inputmode="numeric"/"decimal"`);
    }
    out["input-attrs"] = c;
  }

  // one-primary (S-03): one accent-filled action in the top layer.
  {
    const c = mk();
    const layers = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')].filter(vis);
    // The top layer is the last open dialog or sheet, alone; the page only when none is open.
    const scope: Element = layers[layers.length - 1] ?? document.body;
    const token = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (!token) c.skipped = "no --primary token on :root";
    else {
      // The token resolved by the browser itself, in the same layer: a hex, an oklch() or bare
      // HSL channels (`222 47% 11%`, the older shadcn form, used as hsl(var(--primary))).
      const probe = document.createElement("div");
      probe.style.display = "none";
      scope.appendChild(probe);
      const resolve = (v: string) => {
        probe.style.backgroundColor = "";
        probe.style.backgroundColor = v;
        return probe.style.backgroundColor ? getComputedStyle(probe).backgroundColor : "";
      };
      const TRANSPARENT = /^(rgba\(0, 0, 0, 0\)|transparent)$/;
      let accent = resolve("var(--primary)");
      if (!accent || TRANSPARENT.test(accent)) accent = resolve("hsl(var(--primary))");
      probe.remove();
      if (!accent || TRANSPARENT.test(accent)) c.skipped = `--primary (${token}) does not resolve to a colour`;
      else {
        const filled = [
          ...scope.querySelectorAll('button, a[href], [role="button"], input[type="submit"], input[type="button"]'),
        ].filter((el) => vis(el) && getComputedStyle(el).backgroundColor === accent);
        if (filled.length > 1) {
          c.count = filled.length;
          c.samples = filled.slice(0, MAX).map(describe);
        }
      }
    }
    out["one-primary"] = c;
  }

  // nav-count (S-06): at most five destinations in the phone bottom bar; a count is a number.
  {
    const c = mk();
    if (!args.navCount) c.skipped = "phone width only";
    else {
      const pinned = (el: Element) => {
        for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement)
          if (/fixed|sticky/.test(getComputedStyle(a).position)) return true;
        return false;
      };
      const bars = [...document.querySelectorAll('nav, [role="navigation"], [role="tablist"]')].filter((el) => {
        if (!vis(el) || !pinned(el)) return false;
        const r = el.getBoundingClientRect();
        return r.bottom >= window.innerHeight - 4 && r.top >= window.innerHeight / 2;
      });
      for (const bar of bars.filter((b) => !bars.some((o) => o !== b && o.contains(b)))) {
        const ITEM = 'a[href], button, [role="tab"], [role="link"]';
        const items = [...bar.querySelectorAll(ITEM)].filter((el) => vis(el) && !el.parentElement?.closest(ITEM));
        if (items.length > 5) add(c, `bottom bar with ${items.length} items (at most 5; the rest under "עוד")`);
        for (const el of bar.querySelectorAll<HTMLElement>("*")) {
          if (el.closest("svg") || items.includes(el) || !vis(el)) continue;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const badge =
            el.hasAttribute("data-badge") ||
            (cs.position === "absolute" &&
              r.width <= 24 &&
              r.height <= 24 &&
              !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(cs.backgroundColor));
          if (badge && !/\d/.test(el.textContent ?? "")) add(c, `badge with no number in ${describe(el.closest(ITEM) ?? bar)}`);
        }
      }
    }
    out["nav-count"] = c;
  }

  // empty-action (T-02): an empty state gives one action; a "clear" line needs none.
  {
    const c = mk();
    for (const el of document.querySelectorAll('[data-state="empty"]')) {
      if (!vis(el)) continue;
      if (![...el.querySelectorAll('a[href], button, [role="button"]')].some(vis)) add(c, describe(el));
    }
    out["empty-action"] = c;
  }

  // error-toast (E-05): an error is never a toast and never leaves by itself.
  {
    const c = mk();
    const REGION =
      '[data-toast-region], [data-sonner-toaster], [data-radix-toast-viewport], [role="region"][aria-label*="otification" i]';
    const ERROR = '[data-state="error"], [role="alert"], [data-type="error"]';
    for (const region of document.querySelectorAll(REGION))
      for (const el of region.querySelectorAll(ERROR)) add(c, `error inside the toast region: "${text(el).slice(0, 60)}"`);
    // Recorded from page load by the init script in dod.spec.ts: error elements removed from the
    // DOM with nobody touching the page. Gone for good unless the same words are still there.
    const removed = (window as unknown as { __dodRemovedErrors?: string[] }).__dodRemovedErrors ?? [];
    const now = new Set(
      [...document.querySelectorAll('[role="alert"], [data-state="error"]')].map((e) => (e.textContent ?? "").trim().slice(0, 80)),
    );
    for (const t of new Set(removed)) if (!now.has(t)) add(c, `error removed from the page by itself: "${t.slice(0, 60)}"`);
    out["error-toast"] = c;
  }

  // error-field (E-01), the static half: an invalid field says why, beside it. The other half
  // (focus on the first invalid field after submit) is not built yet.
  {
    const c = mk();
    for (const el of document.querySelectorAll('[aria-invalid="true"]')) {
      if (!vis(el)) continue;
      if (!pointsAtVisibleText(el, "aria-describedby")) add(c, `${describe(el)} is invalid with no visible message`);
    }
    out["error-field"] = c;
  }

  // forbidden-words (E-04, C-01, C-03): on visible text only.
  {
    const c = mk();
    const res = args.forbidden.map((f) => ({ label: f.label, re: new RegExp(f.source, "gu") }));
    const chunks: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || !n.textContent?.trim() || p.closest("script, style, noscript, template") || !vis(p)) continue;
      chunks.push(n.textContent);
    }
    for (const el of document.body.querySelectorAll<HTMLInputElement>(
      'input[placeholder], textarea[placeholder], input[type="submit"], input[type="button"]',
    )) {
      if (!vis(el)) continue;
      if (el.placeholder) chunks.push(el.placeholder);
      if (/^(submit|button)$/.test(el.type) && el.value) chunks.push(el.value);
    }
    for (const chunk of chunks)
      for (const { label, re } of res)
        for (const m of chunk.matchAll(re)) {
          const at = m.index ?? 0;
          add(c, `${label}: "${chunk.slice(Math.max(0, at - 20), at + 20).replace(/\s+/g, " ").trim()}"`);
        }
    out["forbidden-words"] = c;
  }

  return out;
}

/**
 * core-unit (S-11, G-15): how many of the core units are fully visible at the BRIEF's real
 * small screen, above any fixed bottom bar and inside every box that clips them.
 */
export function coreUnitVisible(selector: string): number {
  const R = (e: Element) => e.getBoundingClientRect();
  let floor = window.innerHeight;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (!/fixed|sticky/.test(cs.position)) continue;
    const r = R(el);
    if (r.height > 0 && r.top > window.innerHeight / 2 && r.bottom >= window.innerHeight - 2) floor = Math.min(floor, r.top);
  }
  const clipBottom = (e: Element) => {
    let b = floor;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement)
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowY)) b = Math.min(b, R(a).bottom);
    return b;
  };
  return [...document.querySelectorAll(selector)].filter((e) => {
    const r = R(e);
    return r.height > 0 && r.top >= 0 && r.bottom <= clipBottom(e) + 0.5;
  }).length;
}

export interface ProbeAt {
  overflow: { scrollWidth: number; clientWidth: number } | null;
  small_text: CheckResult;
  broken_words: CheckResult;
  /** Filled in by dod.spec.ts at the phone and tablet sizes; null at the others. */
  touch: { failures: number; samples: string[] } | null;
}

/**
 * The mechanical probe at one size: sideways scroll, text under the project's floor, and a word
 * broken across lines inside a control label (one word whose range has rects on two lines).
 * "An icon covered by its badge" is not built.
 */
export function probeAt(floorPx: number): Omit<ProbeAt, "touch"> {
  const MAX = 6;
  const se = document.scrollingElement ?? document.documentElement;
  const small: CheckResult = { count: 0, samples: [] };
  const broken: CheckResult = { count: 0, samples: [] };
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const smallSeen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const CONTROL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], label, summary';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    const t = n.textContent ?? "";
    if (!p || !t.trim() || p.closest("script, style, noscript, template") || !shown(p)) continue;
    const px = Number.parseFloat(getComputedStyle(p).fontSize);
    if (px < floorPx && !smallSeen.has(p)) {
      smallSeen.add(p);
      small.count++;
      if (small.samples.length < MAX) small.samples.push(`"${t.trim().slice(0, 30)}" ${px}px`);
    }
    if (!p.closest(CONTROL)) continue;
    for (const m of t.matchAll(/\S+/g)) {
      range.setStart(n, m.index ?? 0);
      range.setEnd(n, (m.index ?? 0) + m[0].length);
      // On two lines: the rects' tops differ by more than half a line. Rects on one line
      // (bidi runs, a font fallback) differ by a pixel or two.
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const tops = rects.map((r) => r.top);
      const line = Math.min(...rects.map((r) => r.height));
      if (rects.length > 1 && Math.max(...tops) - Math.min(...tops) > line / 2) {
        broken.count++;
        if (broken.samples.length < MAX) broken.samples.push(`"${m[0].slice(0, 30)}" in ${p.closest(CONTROL)!.tagName.toLowerCase()}`);
      }
    }
  }
  return {
    overflow: se.scrollWidth > se.clientWidth + 1 ? { scrollWidth: se.scrollWidth, clientWidth: se.clientWidth } : null,
    small_text: small,
    broken_words: broken,
  };
}

/**
 * Installed with page.addInitScript before the page loads: records the words of every error
 * element (`[role="alert"]`, `[data-state="error"]`) that leaves the DOM, for error-toast.
 */
export function watchRemovedErrors(): void {
  const SEL = '[role="alert"], [data-state="error"]';
  const removed: string[] = [];
  (window as unknown as { __dodRemovedErrors: string[] }).__dodRemovedErrors = removed;
  new MutationObserver((muts) => {
    for (const m of muts)
      for (const n of m.removedNodes) {
        if (!(n instanceof Element)) continue;
        for (const el of [n, ...n.querySelectorAll(SEL)])
          if (el.matches(SEL)) {
            const t = (el.textContent ?? "").trim().slice(0, 80);
            if (t) removed.push(t);
          }
      }
  }).observe(document, { childList: true, subtree: true });
}
