// Definition-of-Done audit. Never fails on findings: everything is recorded to
// reports/results/*.json and merged into reports/dod.json by global-teardown.
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  AXE_TAGS,
  RESULTS_DIR,
  SCHEMES,
  SCREENS_DIR,
  VIEWPORTS,
  loadArgos,
  loadParams,
  loadRoutes,
  loadScoring,
  loadStandard,
  NOT_FOUND_PRINT,
  normalizeRegionText,
  routeSlug,
  type EntryResult,
  type NotFoundPrint,
  type RouteEntry,
  type StandardConfig,
} from "./dod-shared";
import {
  BUILT_IN_FORBIDDEN,
  coreUnitVisible,
  DOM_CHECK_IDS,
  domChecks,
  forbiddenWordSource,
  probeAt,
  watchRemovedErrors,
  type CheckResult,
} from "./standard-dom";

const SETTLE_MS = 1200;
const routes = loadRoutes();
const params = loadParams();
const standard = loadStandard();
const scoring = loadScoring();
// The app's own not-found page, printed once by global-setup (absent: no comparison).
const notFoundPrint: NotFoundPrint | null = fs.existsSync(NOT_FOUND_PRINT)
  ? (JSON.parse(fs.readFileSync(NOT_FOUND_PRINT, "utf8")) as NotFoundPrint)
  : null;
const FORBIDDEN = [...BUILT_IN_FORBIDDEN, ...(standard?.forbiddenWords ?? []).map(forbiddenWordSource)];

/**
 * The mechanical probe's sizes: the smallest phone, a common phone, a tablet both ways, and the
 * short reception desktop. Touch targets are held to 44px at the first three only.
 */
const PROBE_SIZES = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 648 },
] as const;
// The phone and tablet sizes, measured by the 375 entry, which has a touch pointer (hasTouch), so
// a project that sizes its controls by pointer type (S-12) is measured the way a finger meets it.
const PROBE_TOUCH_MAX_WIDTH = 768;
// After a resize: media queries apply at once, a resize listener may need a frame or two.
const RESIZE_MS = 250;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Did the app paint this route, or is the probe about to measure a loading screen?
 * Returns null when the page is really there, otherwise the reason it is not.
 *
 * Every other probe here looks for a defect, and a page that never rendered has none:
 * no contrast failures, no small targets, no console errors. So it scores 100, and the
 * report says the screen passed when what it means is that nobody looked at it. The
 * thresholds are deliberately loose — a short screen is still a screen, and a page that
 * documents a loading state is not stuck in one — because a blunt version of this check
 * fails real screens, which is worse than the hole it closes.
 */
async function reachRoute(page: Page): Promise<string | null> {
  const painted = () =>
    page.evaluate(() => {
      // Read the ROUTE'S OWN region, never the whole body. Any app with a shell —
      // a skip link, a nav, a footer — puts several hundred characters on screen
      // before the route contributes a single one, so a body-length test can never
      // fail there no matter what the page did.
      const region = document.querySelector("main, #main-content, #root, #__next");
      const text = (() => {
        if (region) return (region as HTMLElement).innerText ?? "";
        const clone = document.body.cloneNode(true) as HTMLElement;
        for (const el of clone.querySelectorAll(
          'nav, footer, header, [role="navigation"], [role="banner"], [role="contentinfo"], script, style, [aria-hidden="true"]',
        ))
          el.remove();
        return clone.innerText ?? "";
      })();
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean.length < 10) return `content region has ${clean.length} characters`;
      const busy = [...document.querySelectorAll('[role="status"], [aria-busy="true"]')].some((el) =>
        /loading|טוענים|טוען|רגע/i.test((el as HTMLElement).textContent ?? ""),
      );
      return busy && clean.length < 200 ? "still showing a loading state" : null;
    });

  const deadline = Date.now() + 15_000;
  let reason = await painted();
  while (reason !== null && Date.now() < deadline) {
    await page.waitForTimeout(500);
    reason = await painted();
  }
  return reason;
}

/** The route's own region text, the same region reachRoute reads. */
function regionText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const region = document.querySelector("main, #main-content, #root, #__next") ?? document.body;
    return (region as HTMLElement).innerText ?? "";
  });
}

/**
 * Not-found and denial wording, the fallback when the page carries neither the standard's
 * markers nor the app's printed not-found text. Each is a phrase, never a bare number or a
 * bare word: "forbidden" or a "404" on a stat card is content.
 */
const NOT_FOUND_WORDING =
  /הדף לא נמצא|העמוד לא נמצא|הדף שחיפשת|שגיאה 404|page not found|this page could not be found|404 not found|error 404/i;
const DENIED_WORDING =
  /אין לך הרשאה|אין לך גישה|שגיאה 403|שגיאה 401|access denied|you (do not|don't) have (permission|access)|not authorized to|403 forbidden|401 unauthorized/i;

async function fontFamilies(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const set = new Set<string>();
    document.fonts.forEach((f) => {
      if (f.status !== "loaded") return;
      const fam = f.family.replace(/^["']|["']$/g, "").replace(/\s+Fallback$/i, "");
      set.add(fam);
    });
    return [...set].sort();
  });
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, failed: el.scrollWidth > el.clientWidth + 1 };
  });
}

async function touchTargets(page: Page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'));
    const samples: string[] = [];
    let failures = 0;

    /**
     * WCAG 2.2 SC 2.5.8 exempts a target that "is in a sentence, or its size is
     * otherwise constrained by the line-height of non-target text". A link inside a
     * paragraph cannot be 44px tall without tearing the paragraph apart, and axe —
     * which implements the exemption — agrees: on the run that produced this rule it
     * reported target-size on two routes while the naive measurement below flagged
     * eighteen links sitting in Hebrew sentences. A standalone control is still held
     * to 44px; only prose is let through, and only when there is prose beside it.
     */
    const inSentence = (el: HTMLElement, display: string): boolean => {
      if (display !== "inline") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      // The prose beside the link is not always a bare text node. A component that
      // splits a sentence and wraps each phrase — this app's consent text does
      // exactly that — leaves the link surrounded by <span>s, and a text-node-only
      // test declares a link that plainly sits mid-sentence to be standalone. What
      // has to be there is non-target text: anything readable next to it that is
      // not itself a control, so a row of nothing but links is still measured.
      return Array.from(parent.childNodes).some((n) => {
        if (n === el) return false;
        if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").trim().length > 0;
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const e = n as HTMLElement;
        if (e.matches("a[href], button, [role=\"button\"]")) return false;
        return (e.textContent ?? "").trim().length > 0;
      });
    };

    /**
     * A compact control often reaches 44px through an invisible absolutely-positioned
     * ::before that spills outside its box — the standard way to give a 24px-tall
     * switch a thumb-sized hit area without drawing a 44px switch. The element's own
     * rect says 48x26 and the finger gets 48x44, so measuring the rect alone reports
     * a control that is already correct. Hit-testing with elementFromPoint would be
     * the direct measurement, but it only works above the fold; the pseudo-element's
     * own geometry works wherever the element is.
     */
    const hitAreaOf = (el: HTMLElement, r: DOMRect) => {
      let extraW = 0;
      let extraH = 0;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute") continue;
        const out = (v: string) => Math.max(0, -(Number.parseFloat(v) || 0));
        extraH = Math.max(extraH, out(ps.top) + out(ps.bottom));
        extraW = Math.max(extraW, out(ps.left) + out(ps.right));
      }
      return { w: Math.max(el.clientWidth, r.width) + extraW, h: Math.max(el.clientHeight, r.height) + extraH };
    };

    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (inSentence(el, cs.display)) continue;
      const { w, h } = hitAreaOf(el, r);
      if (h < 44 || w < 44) {
        failures++;
        if (samples.length < 8) {
          const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
          samples.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${label}" ${Math.round(w)}x${Math.round(h)}`);
        }
      }
    }
    return { checked: true, failures, samples };
  });
}

async function reducedMotionViolations(page: Page) {
  return page.evaluate(() => {
    const running = document.getAnimations().filter((a) => a.playState === "running");
    const samples: string[] = [];
    let violations = 0;
    for (const a of running) {
      const eff = a.effect;
      if (!(eff instanceof KeyframeEffect)) continue;
      const usesTransform = eff.getKeyframes().some((k) =>
        ["transform", "translate", "rotate", "scale"].some((p) => p in k),
      );
      const timing = eff.getComputedTiming();
      // A near-zero duration is the accepted "disable" technique.
      const dur = typeof timing.duration === "number" ? timing.duration : 0;
      const target = eff.target as Element | null;
      // The other accepted technique, and the one the WCAG note actually describes:
      // a busy indicator that has to keep turning because it is the only thing saying
      // the app is still working, slowed until it no longer reads as motion. A spinner
      // at 1.4s or more is that, not a defect — and a probe that cannot tell the two
      // apart teaches people to delete the honest fix.
      const slowedSpinner = dur >= 1400 && target?.classList.contains("animate-spin");
      if (usesTransform && dur > 50 && !slowedSpinner) {
        violations++;
        if (samples.length < 8) {
          samples.push(
            `${target?.tagName.toLowerCase() ?? "?"}${target?.className ? "." + String(target.className).split(" ").slice(0, 3).join(".") : ""} ${a.constructor.name} ${dur}ms`,
          );
        }
      }
    }
    return { violations, samples };
  });
}

/** What a `?state=` variant must render: one of these `data-state` values, or null. */
function expectedState(route: string): string[] | null {
  const state = new URLSearchParams(route.split("?")[1] ?? "").get("state");
  if (state === "empty") return ["empty", "clear", "filtered-empty"];
  if (state === "error") return ["error"];
  return null;
}

/**
 * The standard's checks run inside their own budget, apart from the page's own measurements:
 * one try ends at this deadline, whatever is still running, and records an error on every
 * unfinished check instead of failing the entry.
 */
const STANDARD_BUDGET_MS = 30_000;
/** Each wait after a try (putting the viewport back, asking the page to answer, leaving it). */
const AFTER_STANDARD_MS = 5_000;
/** Added to the test's timeout when standard.json exists: two tries and every wait after them. */
const STANDARD_TIMEOUT_MS = 2 * STANDARD_BUDGET_MS + 5 * AFTER_STANDARD_MS;
const OUT_OF_TIME = `out of time (the standard's ${STANDARD_BUDGET_MS / 1000}s budget)`;

/** Stops the standard's steps when the budget is spent or when a resize moved the page. */
interface Guard {
  deadline: number;
  url: string;
  stopped: string | null;
  /** A new document started loading in the main frame (a navigation or a reload). */
  newDocument: boolean;
}

/** What a resize did to the page, if it moved it: a new document, or only a new URL. */
function moved(g: Guard, page: Page): string | null {
  const url = page.url();
  if (g.newDocument)
    return url !== g.url
      ? `the page navigated to ${url} when resized, so later measurements were not taken`
      : "the page reloaded itself when resized, so later measurements were not taken";
  if (url !== g.url) return `the URL changed on resize (to ${url}, without a new page), so later measurements were not taken`;
  return null;
}

async function step<T>(g: Guard, page: Page, fn: () => Promise<T>): Promise<T> {
  if (!g.stopped && Date.now() > g.deadline) g.stopped = OUT_OF_TIME;
  if (g.stopped) throw new Error(g.stopped);
  let r: T;
  try {
    r = await fn();
  } catch (err) {
    // "Execution context was destroyed" is the page reloading under the step: said as that.
    const m = moved(g, page);
    if (m) throw new Error((g.stopped ??= m));
    throw err;
  }
  // A page that navigates when resized (a phone-only screen sending wide windows home) would
  // have every later number taken on another page.
  const m = moved(g, page);
  if (m) throw new Error((g.stopped ??= m));
  return r;
}

/** Resolves true when `p` settles well within `ms`, false on a timeout or an error. */
function bounded(p: Promise<unknown>, ms = AFTER_STANDARD_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), ms))),
  ]).finally(() => clearTimeout(timer));
}

/** One try's results, kept apart from the entry until the try ends, so a step still running
 *  after the deadline cannot write into the entry. */
interface StandardOut {
  standard?: Record<string, CheckResult>;
  probe?: NonNullable<EntryResult["probe"]>;
}

async function runStandard(
  cfg: StandardConfig,
  page: Page,
  entry: RouteEntry,
  viewport: { width: number; height: number },
  scheme: string,
  result: StandardOut,
  g: Guard,
) {
  const { route } = entry;
  const failed = (err: unknown) => ({ count: 0, samples: [], error: err instanceof Error ? err.message.slice(0, 300) : String(err) });
  const checks = await step(g, page, () =>
    page.evaluate(domChecks, {
      noHelp: entry.noHelp,
      navCount: viewport.width === 375,
      phone: viewport.width <= 480,
      forbidden: FORBIDDEN,
      expectState: expectedState(route),
    }),
  );
  result.standard = checks;

  // core-unit: on its own route, at the BRIEF's real small screen, measured from the light
  // entry nearest that size (a resize, not a reload, so the page keeps its state).
  const cu = cfg.coreUnit;
  if (cu && cu.route === route && scheme === "light" && viewport.width === (cu.viewport[0] <= 768 ? 375 : 1440)) {
    try {
      const [width, height] = cu.viewport;
      await step(g, page, () => page.setViewportSize({ width, height }));
      await step(g, page, () => page.waitForTimeout(RESIZE_MS));
      const visible = await step(g, page, () => page.evaluate(coreUnitVisible, cu.selector));
      checks["core-unit"] =
        visible < cu.min
          ? { count: 1, samples: [`${visible} of ${cu.min} "${cu.selector}" fully visible at ${width}x${height}`] }
          : { count: 0, samples: [] };
    } catch (err) {
      checks["core-unit"] = failed(err);
    }
  }

  // probe: the mechanical floor, each size measured once per route by the light entry whose
  // pointer fits it. The 375 entry has a touch pointer (hasTouch) and takes 320, 390 and 768,
  // with touch targets; the 1440 entry has a mouse and takes 1024x768 and 1280x648. Both resize
  // their own page, so the probe adds no page load.
  if (scheme !== "light") return;
  const touch = viewport.width < 768;
  const sizes = PROBE_SIZES.filter((s) => (s.width <= PROBE_TOUCH_MAX_WIDTH) === touch);
  const probe: NonNullable<EntryResult["probe"]> = {};
  const samples: string[] = [];
  let count = 0;
  let error: string | undefined;
  for (const size of sizes) {
    const key = `${size.width}x${size.height}`;
    try {
      await step(g, page, () => page.setViewportSize(size));
      await step(g, page, () => page.waitForTimeout(RESIZE_MS));
      const at = await step(g, page, () => page.evaluate(probeAt, cfg.textFloorPx));
      const t = touch ? await step(g, page, () => touchTargets(page)) : null;
      probe[key] = { ...at, touch: t && { failures: t.failures, samples: t.samples } };
      if (at.overflow) {
        count++;
        samples.push(`${key}: sideways scroll ${at.overflow.scrollWidth}>${at.overflow.clientWidth}`);
      }
      count += at.small_text.count + at.broken_words.count + (t?.failures ?? 0);
      samples.push(
        ...at.small_text.samples.map((x) => `${key}: text under ${cfg.textFloorPx}px ${x}`),
        ...at.broken_words.samples.map((x) => `${key}: word broken across lines ${x}`),
        ...(t?.samples ?? []).map((x) => `${key}: touch target under 44px ${x}`),
      );
    } catch (err) {
      error = `${key}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`;
      break;
    }
  }
  result.probe = probe;
  checks.probe = { count, samples: samples.slice(0, 8), ...(error ? { error } : {}) };
}

/** One try of the standard's checks, ended at the deadline whatever is still running. */
async function tryStandard(
  cfg: StandardConfig,
  page: Page,
  entry: RouteEntry,
  viewport: { width: number; height: number },
  scheme: string,
  g: Guard,
): Promise<{ standard: Record<string, CheckResult>; probe?: EntryResult["probe"]; error?: string }> {
  const out: StandardOut = {};
  let error: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      runStandard(cfg, page, entry, viewport, scheme, out, g),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          g.stopped ??= OUT_OF_TIME;
          resolve();
        }, Math.max(0, g.deadline - Date.now()));
      }),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 500) : String(err);
  } finally {
    clearTimeout(timer);
  }
  // Copied now: what the steps still running write later stays in `out`.
  const standard: Record<string, CheckResult> = { ...(out.standard ?? {}) };
  const probe = out.probe && { ...out.probe };
  if (g.stopped)
    // Every check that did not finish says so; nothing is counted for it.
    for (const id of plannedChecks(cfg, entry.route, viewport, scheme))
      if (!standard[id]) standard[id] = { count: 0, samples: [], error: g.stopped };
  return { standard, probe, error };
}

/** Which of the standard's checks this entry runs, so a run cut short can say which did not finish. */
function plannedChecks(cfg: StandardConfig, route: string, viewport: { width: number }, scheme: string): string[] {
  const ids: string[] = [...DOM_CHECK_IDS];
  if (expectedState(route)) ids.push("state-coverage");
  const cu = cfg.coreUnit;
  if (cu && cu.route === route && scheme === "light" && viewport.width === (cu.viewport[0] <= 768 ? 375 : 1440)) ids.push("core-unit");
  if (scheme === "light") ids.push("probe");
  return ids;
}

for (const entry of routes) {
  const { route } = entry;
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const slug = routeSlug(route);
      const name = `${slug}__${viewport.width}__${scheme}`;

      test.describe(`${route} @${viewport.width} ${scheme}`, () => {
        test.use({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: scheme,
          // A phone-width entry has a touch pointer, as a phone does: `(pointer: coarse)` matches
          // and a control sized by pointer type (S-12) is measured at its touch size. Never
          // isMobile, which would change the viewport handling and text sizing.
          hasTouch: viewport.width < 768,
          // A public page is measured as a visitor sees it: a fresh context with no
          // cookies and no storage, not the QA session from global-setup.
          ...(entry.audience === "anonymous" ? { storageState: { cookies: [], origins: [] } } : {}),
        });

        test(`dod ${name}`, async ({ page }) => {
          // The standard's checks have their own budget on top of the page's.
          if (standard) test.setTimeout(test.info().timeout + STANDARD_TIMEOUT_MS);
          const consoleErrors: string[] = [];
          // Paused while the standard's checks resize the page: an error a resize provokes
          // belongs to those checks, not to the page's console score. Only the page being
          // measured counts: one left behind by the standard's checks never does.
          const console_ = { collecting: true, page };
          const listen = (p: Page) => {
            p.on("console", (m) => {
              if (console_.collecting && console_.page === p && m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
            });
            p.on("pageerror", (e) => {
              if (console_.collecting && console_.page === p) consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`);
            });
          };
          listen(page);

          const result: EntryResult = {
            route,
            slug,
            audience: entry.audience,
            viewport: { ...viewport },
            scheme,
            status: null,
            load_error: null,
            unreachable: false,
            unreachable_reason: null,
            reached: false,
            not_reached_reason: null,
            screenshot: null,
            overflow: { scrollWidth: 0, clientWidth: 0, failed: false },
            axe: { version: null, counted: 0, scored: 0, by_impact: {}, violations: [] },
            console_errors: consoleErrors,
            fonts: { families: [], count: 0 },
            touch_targets: { checked: false, failures: 0, samples: [] },
            reduced_motion: { violations: 0, samples: [] },
          };

          try {
            // error-toast needs to know which error elements left the page by themselves,
            // so the watcher is in place before the first byte of the page runs.
            if (standard) await page.addInitScript(watchRemovedErrors);
            const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
            result.status = resp?.status() ?? null;
            await settle(page);

            // Access check: the QA account must be able to open every page. A non-2xx,
            // a bounce to a login or access-denied screen, or an empty body means the
            // page was not measured, so it must not be scored as if it passed.
            const landed = new URL(page.url()).pathname + new URL(page.url()).search;
            const expected = route.split("?")[0] ?? route;
            // ANY redirect away from the requested path means this page was not
            // measured, wherever it went. The rule used to be `!landed.startsWith(expected)`
            // AND a keyword test for a login-looking destination — two holes at once.
            // A middleware that sends an unauthorised visitor to `/` matches no keyword,
            // so on Green Room 52 admin and coach routes could each have been awarded
            // the HOME PAGE's score, four entries apiece, and the report would have
            // said 100. And `startsWith` let `/admin` stand in for `/adminXYZ`.
            //
            // Apps do have legitimate aliases, so `alias` is the narrow, declared
            // exception: the destination must itself be a route in the list, so it is
            // measured under its own name. A GATED route (an area listed in `_gated`)
            // may leave its own area only if route-params.json says so in writing,
            // under `_alias` — otherwise "it left /admin" is indistinguishable from
            // "the middleware refused it", the very failure this check exists to catch.
            const landedPath = landed.split("?")[0] ?? landed;
            const GATED_AREAS = params._gated ?? [];
            const gated = GATED_AREAS.find(
              (prefix) => expected === prefix || expected.startsWith(`${prefix}/`),
            );
            const leftItsArea =
              !!gated && !(landedPath === gated || landedPath.startsWith(`${gated}/`));
            const declaredAlias = params._alias ?? {};
            const alias =
              landedPath !== expected &&
              (!leftItsArea || route in declaredAlias) &&
              routes.some(({ route: r }) => (r.split("?")[0] ?? r) === landedPath);
            if (alias) result.redirected_to = landed;
            const bounced = landedPath !== expected && !alias;
            const deniedText = await page
              .locator("body")
              .innerText()
              .catch(() => "");
            // The standard's own markers are the first signal: a page that renders its
            // no-access or not-found state says so in markup, whatever its words. A route that
            // asks for that state (?state=no-access) is the designed screen, not a refusal.
            const askedState = new URLSearchParams(route.split("?")[1] ?? "").get("state");
            const marker = await page
              .evaluate(() =>
                ["no-access", "not-found"].find((s) =>
                  [...document.querySelectorAll(`[data-state="${s}"]`)].some((el) =>
                    el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
                  ),
                ),
              )
              .catch(() => undefined);
            // Then the app's real not-found page, printed in global-setup: the same region
            // text means this route rendered it.
            const rendersNotFound =
              !!notFoundPrint &&
              notFoundPrint.text.length > 0 &&
              normalizeRegionText(await regionText(page).catch(() => ""), expected) === notFoundPrint.text;
            if (result.status !== null && result.status >= 400) {
              result.unreachable = true;
              result.unreachable_reason = `HTTP ${result.status}`;
            } else if (bounced) {
              result.unreachable = true;
              result.unreachable_reason = `redirected to ${landed}: the QA account has no access`;
            } else if (marker === "no-access" && askedState !== "no-access") {
              result.unreachable = true;
              result.unreachable_reason = 'access-denied screen rendered ([data-state="no-access"])';
            } else if (
              !route.includes("404") &&
              askedState !== "not-found" &&
              (marker === "not-found" || rendersNotFound || NOT_FOUND_WORDING.test(deniedText))
            ) {
              // A route in the list that answers with the app's own not-found page is
              // not being measured — it is the 404 screen being measured 110 times.
              // /book/confirmed did exactly this: it needs ?bookingId=, so the gate
              // scored the not-found page 100 while the screen that shows a customer
              // their door code was never opened. A route list is only as good as the
              // parameters that make its pages real.
              result.unreachable = true;
              result.unreachable_reason = `renders the not-found page (${
                marker === "not-found" ? "[data-state=\"not-found\"]" : rendersNotFound ? "the app's not-found text" : "not-found wording"
              }) — the route needs a query parameter (add it to routes.json)`;
            } else if (DENIED_WORDING.test(deniedText)) {
              // A phrase, never the digits: a 401 or 403 is a status code and is caught above
              // through the response status, while "401" in a price is content.
              result.unreachable = true;
              result.unreachable_reason = "access-denied screen rendered";
            } else if (askedState !== "error" && /משהו השתבש|שגיאה בטעינה|something went wrong|try again later/i.test(deniedText)) {
              // (A route asked as ?state=error is meant to show the error screen.)
              // An error boundary that caught a failed fetch renders a tidy little
              // card: no overflow, no axe violation, no console error (it was
              // caught), two fonts, no small targets. Indistinguishable from a
              // perfect page unless the copy is matched.
              result.unreachable = true;
              result.unreachable_reason = "the app's own error screen rendered";
            }

            // Only worth asking once the response itself is sound: an access-denied
            // screen has painted perfectly well, it is just the wrong page.
            if (!result.unreachable) {
              result.not_reached_reason = await reachRoute(page);
              result.reached = result.not_reached_reason === null;
            }

            const shot = path.join(SCREENS_DIR, `${name}.png`);
            await page.screenshot({ path: shot, fullPage: true });
            result.screenshot = path.relative(path.resolve(SCREENS_DIR, "..", ".."), shot);

            // Argos compares this frame with the same frame from the previous run and
            // shows what moved. It answers the question the score cannot — "one token
            // changed, which other screens changed with it" — and it is the reason the
            // DoD walks every route rather than a sample. Without ARGOS_TOKEN it is a
            // no-op, so a local run costs nothing and uploads nothing.
            // The package is optional: it is loaded only when ARGOS_TOKEN is set, and
            // global-setup has already stopped the run if the token is set without it.
            if (process.env.ARGOS_TOKEN) await (await loadArgos())(page, name, { threshold: 0.2 });

            result.overflow = await overflow(page);

            // Retried once, because a page that finishes a client-side navigation while
            // axe is walking it throws "Execution context was destroyed" — and the
            // catch below would then record the page as UNREACHABLE, which reads as
            // "the QA account has no access" when what actually happened is that the
            // page moved. axe documents this case itself
            // (dequelabs/axe-core-npm error-handling.md). One settle and one retry.
            const runAxe = () => new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
            let axe: Awaited<ReturnType<typeof runAxe>>;
            try {
              axe = await runAxe();
            } catch {
              await settle(page);
              axe = await runAxe();
            }
            result.axe.violations = axe.violations.map((v) => ({
              id: v.id,
              impact: v.impact ?? "unknown",
              help: v.help,
              nodes: v.nodes.length,
              samples: v.nodes.slice(0, 4).map((n) => ({
                target: n.target.map(String).join(" "),
                html: n.html.replace(/\s+/g, " ").slice(0, 200),
              })),
            }));
            result.axe.version = axe.testEngine?.version ?? null;
            for (const v of axe.violations) {
              const impact = v.impact ?? "unknown";
              result.axe.by_impact[impact] = (result.axe.by_impact[impact] ?? 0) + v.nodes.length;
              result.axe.counted += v.nodes.length;
              if (impact === "critical" || impact === "serious" || scoring.axe.minorModerate === "enforce")
                result.axe.scored += v.nodes.length;
            }

            result.fonts.families = await fontFamilies(page);
            result.fonts.count = result.fonts.families.length;

            if (viewport.width === 375) result.touch_targets = await touchTargets(page);

            // The experience standard's checks, on a page that really painted. Their own try:
            // whatever goes wrong in them is recorded on the check, and never turns the page
            // unreachable or changes any other number, so report mode leaves the score alone.
            const measuredUrl = page.url();
            // The page the reduced-motion load runs on: this one, unless the standard's checks
            // left it unable to answer.
            let rmPage = page;
            if (standard && result.reached && !result.unreachable) {
              console_.collecting = false;
              const nav: { g: Guard | null } = { g: null };
              page.on("request", (r) => {
                if (nav.g && r.isNavigationRequest() && r.frame() === page.mainFrame()) nav.g.newDocument = true;
              });
              // Each try is bounded by its deadline; after it, the viewport goes back and the page
              // must answer within AFTER_STANDARD_MS, or it is left behind.
              const attempt = async () => {
                const g: Guard = { deadline: Date.now() + STANDARD_BUDGET_MS, url: measuredUrl, stopped: null, newDocument: false };
                nav.g = g;
                const r = await tryStandard(standard, page, entry, viewport, scheme, g);
                nav.g = null;
                const answers =
                  (await bounded(page.setViewportSize({ width: viewport.width, height: viewport.height }))) &&
                  (await bounded(page.waitForTimeout(RESIZE_MS).then(() => page.evaluate(() => true))));
                return { ...r, g, answers };
              };
              let t = await attempt();
              // A try that ran out of time on a loaded machine, or any error under CI, gets one
              // more try, on a page that still answers and was not moved by a resize.
              const errored = Object.entries(t.standard).find(([, c]) => c.error);
              if (errored && t.answers && !moved(t.g, page) && (t.g.stopped === OUT_OF_TIME || process.env.CI)) {
                result.standard_retried = `${errored[0]}: ${errored[1].error}`.slice(0, 300);
                t = await attempt();
              }
              result.standard = t.standard;
              if (t.probe) result.probe = t.probe;
              if (t.error) result.standard_error = t.error;
              // The old document ends before the console counts again: a timer a resize started
              // there (an error logged 300 ms later) must not land in the new load's count.
              if (!t.answers || !(await bounded(page.goto("about:blank")))) {
                // A page still busy with what a resize started is left behind; the reduced-motion
                // load runs in a new tab of the same context (same session, same emulation).
                void page.close({ runBeforeUnload: false }).catch(() => {});
                rmPage = await page.context().newPage();
                listen(rmPage);
                console_.page = rmPage;
              }
            }

            await rmPage.emulateMedia({ reducedMotion: "reduce" });
            // The console counts again from this load, as it does without the standard's checks.
            console_.collecting = true;
            // After the standard's checks the page is loaded again from its measured URL; without
            // them it is the same page, reloaded.
            if (rmPage.url() !== measuredUrl) await rmPage.goto(measuredUrl, { waitUntil: "domcontentloaded" });
            else await rmPage.reload({ waitUntil: "domcontentloaded" });
            await settle(rmPage);
            result.reduced_motion = await reducedMotionViolations(rmPage);
          } catch (err) {
            result.load_error = err instanceof Error ? err.message.slice(0, 500) : String(err);
            result.unreachable = true;
            result.unreachable_reason = result.load_error;
          }

          fs.mkdirSync(RESULTS_DIR, { recursive: true });
          fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), JSON.stringify(result, null, 2));
          test.info().annotations.push({
            type: "dod",
            description: `status=${result.status} unreachable=${result.unreachable} reached=${result.reached} overflow=${result.overflow.failed} axe=${result.axe.counted} console=${consoleErrors.length} fonts=${result.fonts.count} touch=${result.touch_targets.failures} rm=${result.reduced_motion.violations}${
              result.standard
                ? ` standard=${Object.entries(result.standard)
                    .filter(([, c]) => c.count)
                    .map(([id, c]) => `${id}:${c.count}`)
                    .join(",") || "clean"}`
                : ""
            }`,
          });
        });
      });
    }
  }
}
