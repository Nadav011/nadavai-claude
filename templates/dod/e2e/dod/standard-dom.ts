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
  /** The check itself failed (a bad selector in standard.json, a page that threw): recorded and
   *  printed, never counted as a finding and never turned into an unreachable page. */
  error?: string;
}

export interface DomCheckArgs {
  /** Why help-door does not apply (the entry's `noHelp`), or null when it does. */
  noHelp: string | null;
  /** nav-count runs at 375 only. */
  navCount: boolean;
  /** The 16px input text floor is an iOS zoom rule, so it is checked at phone widths only. */
  phone: boolean;
  /** forbidden-words patterns, as RegExp sources (a RegExp does not cross into the page). */
  forbidden: { label: string; source: string }[];
  /** On a `?state=` variant: the `data-state` values one of which the page must render. */
  expectState: string[] | null;
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

/**
 * Text people did not write for the product: a client's message, a name they typed. The
 * interface's words are checked; theirs are not. A project marks it with `data-user-content`
 * (or `translate="no"`, which a message list usually carries already).
 */
export const USER_CONTENT = '[data-user-content], [translate="no"]';

/**
 * Every per-entry DOM check, in one pass over the page. Each check is judged against stock
 * shadcn/Radix markup as well as its own fixture: a check that fails a well-built screen
 * teaches people to ignore the checks.
 */
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
    const label = Array.from(el.getAttribute("aria-label") || text(el) || el.getAttribute("placeholder") || "")
      .slice(0, 40)
      .join("");
    return `${tag}${id}${label ? ` "${label}"` : ""}`;
  };
  const byIds = (ids: string | null) =>
    (ids ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id));
  const pointsAtVisibleText = (el: Element, attr: string) =>
    byIds(el.getAttribute(attr)).some((t) => vis(t) && readable(text(t)));
  const labelText = (el: Element) =>
    [...((el as HTMLInputElement).labels ?? [])].map((l) => text(l)).join(" ");
  const add = (c: CheckResult, s: string) => {
    c.count++;
    if (c.samples.length < MAX) c.samples.push(s);
  };
  const out: Record<string, CheckResult> = {};
  // One check that throws is recorded as that check's error; the others still run.
  const check = (id: string, fn: (c: CheckResult) => void) => {
    const c: CheckResult = { count: 0, samples: [] };
    try {
      fn(c);
      out[id] = c;
    } catch (err) {
      out[id] = { count: 0, samples: [], error: err instanceof Error ? err.message : String(err) };
    }
  };
  const SEARCH = 'input[type="search"], [role="searchbox"], [role="combobox"]';

  // help-door (G-01): the door in the top bar, and the screen's own entry in its header.
  check("help-door", (c) => {
    if (args.noHelp) {
      c.skipped = `noHelp: ${args.noHelp}`;
      return;
    }
    const doors = [...document.querySelectorAll('[data-help="door"]')].filter(vis);
    // The top bar: inside a header or banner, or in the first 120px of the page.
    const inTopBar = doors.some(
      (d) => d.closest('header, [role="banner"]') || d.getBoundingClientRect().top + window.scrollY < 120,
    );
    if (!inTopBar) add(c, doors.length ? 'the [data-help="door"] is not in the top bar' : 'no visible [data-help="door"]');
    if (![...document.querySelectorAll('[data-help="screen"]')].some(vis)) add(c, 'no visible [data-help="screen"]');
  });

  // tooltip-only (G-04): the only words are in a title or a hover tooltip. What it can see: a
  // `title` attribute, and an element described only by a [role=tooltip] that is in the DOM but
  // hidden. A Radix tooltip is not in the DOM until hover, so its trigger is not judged here.
  check("tooltip-only", (c) => {
    const ownWords = (el: HTMLElement) => {
      if (el.matches("input, select, textarea"))
        return readable(labelText(el)) || pointsAtVisibleText(el, "aria-labelledby");
      return readable(text(el)) || pointsAtVisibleText(el, "aria-labelledby");
    };
    // The same words already on screen beside it (within three levels up): an avatar whose
    // title repeats the name next to it explains nothing that is not visible.
    const besideIt = (el: Element, words: string) => {
      let a = el.parentElement;
      for (let i = 0; a && i < 3; i++, a = a.parentElement) if (text(a).includes(words)) return true;
      return false;
    };
    const seen = new Set<Element>();
    for (const el of document.body.querySelectorAll("[title]")) {
      const title = el.getAttribute("title")?.trim() ?? "";
      if (!vis(el) || !title || el.matches("iframe, svg *")) continue;
      if (el.closest("[data-help]") || ownWords(el) || pointsAtVisibleText(el, "aria-describedby")) continue;
      if (besideIt(el, title)) continue;
      seen.add(el);
      add(c, `${describe(el)} title="${title.slice(0, 40)}"`);
    }
    for (const el of document.body.querySelectorAll("[aria-describedby]")) {
      if (seen.has(el) || !vis(el) || el.closest("[data-help]") || ownWords(el)) continue;
      const targets = byIds(el.getAttribute("aria-describedby")).filter(Boolean) as Element[];
      if (targets.length && targets.every((t) => t.matches('[role="tooltip"]') && !vis(t)))
        add(c, `${describe(el)} described only by a hidden tooltip`);
    }
  });

  // disabled-reason (E-02): a disabled control shows why, in a visible line. Not judged where
  // the reason is the control's own position: a day of a calendar grid or a grid row, a pager's
  // previous/next or page number, a stepper at its limit.
  check("disabled-reason", (c) => {
    const PAGER_WORD = /^(הקודם|הבא|הקודמת|הבאה|ראשון|אחרון|previous|prev|next|first|last|[«‹›»<>]|\d+)$/i;
    const pagerLabel = (el: Element) =>
      PAGER_WORD.test((el.getAttribute("aria-label") || text(el)).replace(/\s+/g, " ").trim()) ||
      /^(go to )?(previous|next|first|last) page$|^(לעמוד|עמוד) (הקודם|הבא|הראשון|האחרון)$/i.test(el.getAttribute("aria-label") ?? "");
    const inPager = (el: Element) => {
      if (el.closest('[data-slot="pagination"], [aria-label="pagination" i]')) return true;
      const nav = el.closest("nav[aria-label]");
      return !!nav && [...nav.querySelectorAll('a, button, [role="button"]')].every(pagerLabel);
    };
    const inStepper = (el: Element) =>
      el.matches('[role="spinbutton"], input[type="number"]') ||
      !!el.parentElement?.querySelector('input[type="number"], [role="spinbutton"]');
    for (const el of document.body.querySelectorAll(
      'button:disabled, input:disabled:not([type="hidden"]), select:disabled, textarea:disabled, [aria-disabled="true"]',
    )) {
      if (!vis(el) || el.closest('[aria-busy="true"]')) continue;
      if (el.closest('[role="grid"], [role="row"], [role="gridcell"]') || inPager(el) || pagerLabel(el) || inStepper(el)) continue;
      if (pointsAtVisibleText(el, "aria-describedby")) continue;
      add(c, describe(el));
    }
  });

  // placeholder-label (I-01): a placeholder is never the label. A search box with an accessible
  // name is the exception: its role and icon say what it is, and a label above it is not the
  // stock pattern.
  check("placeholder-label", (c) => {
    for (const el of document.body.querySelectorAll<HTMLInputElement>("input[placeholder], textarea[placeholder]")) {
      if (!vis(el) || !el.placeholder.trim()) continue;
      if (el.matches(SEARCH) && (el.getAttribute("aria-label")?.trim() || el.hasAttribute("aria-labelledby"))) continue;
      const labelled =
        [...(el.labels ?? [])].some((l) => vis(l) && readable(text(l))) || pointsAtVisibleText(el, "aria-labelledby");
      if (!labelled) add(c, describe(el));
    }
  });

  // input-attrs (I-03): autocomplete always; the keyboard that fits; 16px text on a phone.
  check("input-attrs", (c) => {
    const NOT_TEXT = /^(hidden|submit|button|reset|image|checkbox|radio|file|range|color)$/;
    // What a field is for, decided by what the developer declared (type, name, id, autocomplete,
    // inputmode). Words in its label or placeholder are a weak hint: they count only when two
    // of them agree (the label says phone AND the placeholder looks like a number), so "נושא
    // המייל" (an e-mail's subject) is not an e-mail field.
    const KINDS = {
      phone: { declared: /(^|[^a-z])(tel|phone|mobile|cell)([^a-z]|$)/, ac: /^tel/, words: /טלפון|נייד|phone|mobile/i, looks: /^[+\d][\d\s()-]{6,}$/ },
      email: { declared: /(^|[^a-z])e?-?mail([^a-z]|$)/, ac: /^email$/, words: /דוא"ל|אימייל|מייל|e-?mail/i, looks: /@/ },
      number: {
        declared: /(^|[^a-z])(amount|price|qty|quantity|otp|zip|postal)([^a-z]|$)/,
        ac: /^(one-time-code|cc-number|cc-csc|postal-code|transaction-amount)$/,
        words: /סכום|מחיר|כמות|מיקוד|קוד אימות/,
        looks: /^\d+([.,]\d+)?$/,
      },
    } as const;
    const tokens = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    for (const el of document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    )) {
      if (!vis(el)) continue;
      const isInput = el instanceof HTMLInputElement;
      if (isInput && NOT_TEXT.test(el.type)) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (args.phone && px < 16) add(c, `${describe(el)} text ${px}px (under 16px zooms the page on iOS)`);
      if (!isInput || el.matches(SEARCH)) continue;
      if (!el.hasAttribute("autocomplete")) add(c, `${describe(el)} has no autocomplete attribute`);
      const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase().split(/\s+/).pop() ?? "";
      const declared = tokens(`${el.name} ${el.id}`);
      const type = el.type.toLowerCase();
      const mode = (el.getAttribute("inputmode") ?? "").toLowerCase();
      const fits = { phone: type === "tel" || mode === "tel", email: type === "email" || mode === "email", number: type === "number" || /^(numeric|decimal)$/.test(mode) };
      for (const [kind, k] of Object.entries(KINDS) as [keyof typeof KINDS, (typeof KINDS)[keyof typeof KINDS]][]) {
        if (fits[kind]) continue;
        // A field that declares another kind is that kind: a type="email" named "contact" is not a phone.
        if (Object.entries(fits).some(([other, f]) => other !== kind && f)) continue;
        const strong = k.ac.test(ac) || k.declared.test(declared);
        const weak = [labelText(el), el.getAttribute("aria-label") ?? ""].some((w) => k.words.test(w)) && k.looks.test(el.placeholder.trim());
        if (strong || weak) add(c, `${describe(el)} is a ${kind} field without the matching type or inputmode`);
      }
    }
  });

  // one-primary (S-03): one accent-filled action in the top layer. A selected or checked thing
  // (a switch, a checkbox, a selected day, the current tab or page) is filled with the accent
  // to show its state, not because it is an action: those are not counted.
  check("one-primary", (c) => {
    const layers = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')].filter(vis);
    // The top layer is the last open dialog or sheet, alone; the page only when none is open.
    const scope: Element = layers[layers.length - 1] ?? document.body;
    const token = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (!token) {
      c.skipped = "no --primary token on :root";
      return;
    }
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
    if (!accent || TRANSPARENT.test(accent)) {
      c.skipped = `--primary (${token}) does not resolve to a colour`;
      return;
    }
    const STATE =
      '[role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="gridcell"], [role="option"], ' +
      '[role="menuitemcheckbox"], [role="menuitemradio"], [aria-selected], [aria-pressed], [aria-checked], [aria-current]';
    const filled = [
      ...scope.querySelectorAll('button, a[href], [role="button"], input[type="submit"], input[type="button"]'),
    ].filter((el) => vis(el) && !el.matches(STATE) && !el.closest('[role="gridcell"]') && getComputedStyle(el).backgroundColor === accent);
    if (filled.length > 1) {
      c.count = filled.length;
      c.samples = filled.slice(0, MAX).map(describe);
    }
  });

  // nav-count (S-06): at most five destinations in the phone bottom bar; a count is a number.
  check("nav-count", (c) => {
    if (!args.navCount) {
      c.skipped = "phone width only";
      return;
    }
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
        // A badge is a small filled dot or pill; an active-item underline (20x3) is not one.
        const roundish = r.width >= 4 && r.height >= 4 && Math.max(r.width, r.height) / Math.min(r.width, r.height) <= 2.5;
        const badge =
          el.hasAttribute("data-badge") ||
          (cs.position === "absolute" &&
            r.width <= 24 &&
            r.height <= 24 &&
            roundish &&
            !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(cs.backgroundColor));
        if (badge && !/\d/.test(el.textContent ?? "")) add(c, `badge with no number in ${describe(el.closest(ITEM) ?? bar)}`);
      }
    }
  });

  // empty-action (T-02): an empty state gives one action; a "clear" line needs none.
  check("empty-action", (c) => {
    for (const el of document.querySelectorAll('[data-state="empty"]')) {
      if (!vis(el)) continue;
      if (![...el.querySelectorAll('a[href], button, [role="button"]')].some(vis)) add(c, describe(el));
    }
  });

  // error-toast (E-05): an error is never a toast and never leaves by itself.
  check("error-toast", (c) => {
    const REGION =
      '[data-toast-region], [data-sonner-toaster], [data-radix-toast-viewport], ' +
      '[role="region"][aria-label*="otification" i], section[aria-label*="otification" i]';
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
  });

  // error-field (E-01), the static half: an invalid field says why, beside it. The other half
  // (focus on the first invalid field after submit) is not built yet.
  check("error-field", (c) => {
    for (const el of document.querySelectorAll('[aria-invalid="true"]')) {
      if (!vis(el)) continue;
      if (!pointsAtVisibleText(el, "aria-describedby")) add(c, `${describe(el)} is invalid with no visible message`);
    }
  });

  // forbidden-words (E-04, C-01, C-03): on the interface's visible text only, never on what
  // people wrote (USER_CONTENT) and never on the values typed into fields.
  check("forbidden-words", (c) => {
    const res = args.forbidden.map((f) => ({ label: f.label, re: new RegExp(f.source, "gu") }));
    // The same list as USER_CONTENT, written out: a module constant does not reach the page.
    const SKIP = 'script, style, noscript, template, [data-user-content], [translate="no"]';
    const chunks: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || !n.textContent?.trim() || p.closest(SKIP) || !vis(p)) continue;
      chunks.push(n.textContent);
    }
    for (const el of document.body.querySelectorAll<HTMLInputElement>(
      'input[placeholder], textarea[placeholder], input[type="submit"], input[type="button"]',
    )) {
      if (!vis(el) || el.closest(SKIP)) continue;
      if (el.placeholder) chunks.push(el.placeholder);
      if (/^(submit|button)$/.test(el.type) && el.value) chunks.push(el.value);
    }
    for (const chunk of chunks)
      for (const { label, re } of res)
        for (const m of chunk.matchAll(re)) {
          // Context by code point, so an emoji is never cut in half.
          const before = Array.from(chunk.slice(0, m.index ?? 0)).slice(-20).join("");
          const after = Array.from(chunk.slice(m.index ?? 0)).slice(0, 20).join("");
          add(c, `${label}: "${(before + after).replace(/\s+/g, " ").trim()}"`);
        }
  });

  // state-coverage (T-01), the page half: a `?state=empty` or `?state=error` variant that does
  // not render that state is a variant in name only.
  if (args.expectState)
    check("state-coverage", (c) => {
      const want = args.expectState!;
      const shown = [...document.querySelectorAll("[data-state]")].some(
        (el) => vis(el) && want.includes(el.getAttribute("data-state") ?? ""),
      );
      if (!shown) add(c, `the route asks for a state but no visible [data-state] is one of ${want.join(", ")}`);
    });

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
