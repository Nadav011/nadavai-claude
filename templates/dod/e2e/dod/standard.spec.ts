// The experience standard's checks: the second phase of `pnpm dod` (run-dod.mjs), run after every
// entry of the scored phase (dod.spec.ts) has finished and the scored result of the whole run is
// written. Each test loads its route again in a fresh context and writes only its own file,
// results/<name>.standard.json, which global-teardown merges. Nothing here can reach a scored
// number, and in report mode this phase's exit code is not the run's.
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import {
  expectedState,
  loadRoutes,
  loadStandard,
  notFinished,
  plannedChecks,
  RESULTS_DIR,
  routeSlug,
  SCHEMES,
  standardFile,
  VIEWPORTS,
  type EntryResult,
  type RouteEntry,
  type StandardConfig,
} from "./dod-shared";
import { reachRoute, settle, touchTargets } from "./dod-page";
import {
  BUILT_IN_FORBIDDEN,
  coreUnitVisible,
  domChecks,
  forbiddenWordSource,
  probeAt,
  watchRemovedErrors,
  type CheckResult,
} from "./standard-dom";

const routes = loadRoutes();
const standard = loadStandard();
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


/**
 * Each entry's checks run inside their own budget: one try ends at this deadline, whatever is
 * still running, and records an error on every unfinished check instead of failing the entry.
 */
const STANDARD_BUDGET_MS = 30_000;
/** Each wait between tries (putting the viewport back, asking the page to answer). */
const AFTER_STANDARD_MS = 5_000;
/** A checks test's whole time: two tries, the waits between them, and room for the loads. */
const STANDARD_TIMEOUT_MS = 2 * STANDARD_BUDGET_MS + 3 * AFTER_STANDARD_MS + 30_000;
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
  // The page loaded again, as the checks expect it: the reduced-motion copy the scored part left
  // is not the page people see. Its own navigation is not a move.
  await step(g, page, async () => {
    try {
      await page.goto(g.url, { waitUntil: "domcontentloaded" });
      await settle(page);
      await reachRoute(page);
    } finally {
      g.newDocument = false;
    }
  });
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
  // Every check that did not finish says so, also when the whole DOM-check call threw (a page
  // that broke checkVisibility, a renderer crash); nothing is counted for it.
  const why = g.stopped ?? error;
  if (why)
    for (const id of plannedChecks(cfg, entry.route, viewport, scheme))
      if (!standard[id]) standard[id] = { count: 0, samples: [], error: why };
  return { standard, probe, error };
}

/** What the standard's checks may add to an entry: their own fields, never a scored one. */
type StandardPart = Pick<EntryResult, "standard" | "probe" | "standard_error" | "standard_retried" | "standard_skipped">;

/** Entries whose checks ran out of time in this run, across workers (one line each). */
const TIMEOUTS_FILE = path.join(RESULTS_DIR, "standard-timeouts.txt");
const timeoutsSoFar = () => {
  try {
    return fs.readFileSync(TIMEOUTS_FILE, "utf8").split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
};

/**
 * The standard's checks for one entry, after its scored measurements are frozen. One try, and a
 * second when the first ran out of time, when the whole DOM-check call threw, or on any error
 * under CI, on a page that still answers; after `maxTimeouts` entries of the run ran out of time,
 * no more retries and no more checks.
 */
async function checkStandard(
  cfg: StandardConfig,
  page: Page,
  entry: RouteEntry,
  viewport: { width: number; height: number },
  scheme: string,
  name: string,
  measuredUrl: string,
): Promise<StandardPart> {
  const planned = plannedChecks(cfg, entry.route, viewport, scheme);
  if (timeoutsSoFar() >= cfg.maxTimeouts) {
    const why = `not checked: ${cfg.maxTimeouts} entries of this run ran out of time, so the standard's checks stopped for the rest of it`;
    return { standard: notFinished(planned, why), standard_skipped: why };
  }
  // The removed-errors watcher in place before the page's first byte (error-toast). The page is a
  // fresh one of this phase, so nothing of the scored phase is left to undo.
  await page.addInitScript(watchRemovedErrors).catch(() => {});
  const nav: { g: Guard | null } = { g: null };
  page.on("request", (r) => {
    if (nav.g && r.isNavigationRequest() && r.frame() === page.mainFrame()) nav.g.newDocument = true;
  });
  const attempt = async () => {
    const g: Guard = { deadline: Date.now() + STANDARD_BUDGET_MS, url: measuredUrl, stopped: null, newDocument: false };
    nav.g = g;
    const r = await tryStandard(cfg, page, entry, viewport, scheme, g);
    nav.g = null;
    if (g.stopped === OUT_OF_TIME) fs.appendFileSync(TIMEOUTS_FILE, `${name}\n`);
    return { ...r, g };
  };
  const first = await attempt();
  let t = first;
  let retried: string | undefined;
  const errored = Object.entries(first.standard).find(([, c]) => c.error);
  const ci = process.env.CI === "true" || process.env.CI === "1";
  if (errored && !moved(first.g, page) && (first.g.stopped === OUT_OF_TIME || first.error || ci) && timeoutsSoFar() < cfg.maxTimeouts) {
    // Only on a page that answers: the viewport back, then a trivial evaluate, each bounded.
    const answers =
      (await bounded(page.setViewportSize({ width: viewport.width, height: viewport.height }))) &&
      (await bounded(page.evaluate(() => true)));
    if (answers) {
      retried = `${errored[0]}: ${errored[1].error}`.slice(0, 300);
      t = await attempt();
      // The first try's result stands for every check that did not error in it.
      for (const [id, c] of Object.entries(first.standard)) if (!c.error) t.standard[id] = c;
      if (first.probe && !first.standard.probe?.error) t.probe = first.probe;
    }
  }
  return {
    standard: t.standard,
    ...(t.probe ? { probe: t.probe } : {}),
    ...(t.error ? { standard_error: t.error } : {}),
    ...(retried ? { standard_retried: retried } : {}),
  };
}

/** The scored phase's result for an entry, or null when it left none. */
function scoredResult(name: string): EntryResult | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, `${name}.json`), "utf8")) as EntryResult;
  } catch {
    return null;
  }
}

if (standard)
  for (const entry of routes) {
    const { route } = entry;
    for (const viewport of VIEWPORTS) {
      for (const scheme of SCHEMES) {
        const name = `${routeSlug(route)}__${viewport.width}__${scheme}`;
        test.describe(`${route} @${viewport.width} ${scheme}`, () => {
          // The same context as the scored entry: viewport, scheme, touch at phone width, and the
          // visitor's empty storage for an anonymous route.
          test.use({
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme: scheme,
            hasTouch: viewport.width < 768,
            ...(entry.audience === "anonymous" ? { storageState: { cookies: [], origins: [] } } : {}),
          });
          test(`standard ${name}`, async ({ page }) => {
            const scored = scoredResult(name);
            // Only a page the scored phase reached is checked; the aggregation says why not.
            if (!scored || !scored.reached || scored.unreachable) return;
            test.setTimeout(STANDARD_TIMEOUT_MS);
            const planned = plannedChecks(standard, route, viewport, scheme);
            // The checks end before the test does, whatever is still running in them, and this
            // body is the only writer of the entry's file: nothing can write it after the test (and
            // so after the aggregation) has ended.
            let timer: ReturnType<typeof setTimeout> | undefined;
            const part: StandardPart = await Promise.race([
              checkStandard(standard, page, entry, viewport, scheme, name, scored.measured_url ?? route).catch(
                (err: unknown): StandardPart => ({
                  standard: notFinished(planned, `the checks failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`),
                }),
              ),
              new Promise<StandardPart>((resolve) => {
                timer = setTimeout(
                  () => resolve({ standard: notFinished(planned, "the checks did not finish in their test's time") }),
                  STANDARD_TIMEOUT_MS - 10_000,
                );
              }),
            ]);
            clearTimeout(timer);
            fs.writeFileSync(standardFile(name), JSON.stringify(part, null, 2));
          });
        });
      }
    }
  }
