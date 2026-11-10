import fs from "node:fs";
import path from "node:path";

/**
 * The project root: the directory the run starts from (`pnpm dod` runs in the package
 * root), or DOD_ROOT. Not `__dirname` and not `import.meta`: a project with
 * `"type": "module"` has no `__dirname`, and a CommonJS one cannot parse `import.meta`,
 * so either one breaks the template in half of the projects it is copied into.
 */
export const ROOT = path.resolve(process.env.DOD_ROOT ?? process.cwd());
export const DOD_DIR = path.join(ROOT, "e2e", "dod");
if (!fs.existsSync(path.join(DOD_DIR, "routes.json"))) {
  throw new Error(
    `[dod] ${path.join(DOD_DIR, "routes.json")} not found. Run the DoD from the project root ` +
      "(the directory that holds e2e/dod), or set DOD_ROOT to it.",
  );
}

/**
 * One codebase, sometimes more than one product. Set `DOD_VERTICAL` when a repo
 * ships several apps that cannot share a score: a route list, a QA account, a port
 * and a report directory per product. TherapyFlow (09/2026) has three — a clinic and
 * a salon that are the same bundle switched by a database column, and a customer app
 * that is a separate vite mode with no login of its own. Averaging three designs into
 * one number says nothing about any of them.
 *
 * Unset is the normal case and behaves exactly as before: one product, `reports/dod`.
 */
export const VERTICAL = process.env.DOD_VERTICAL ?? "";

export const REPORTS_DIR = path.join(ROOT, "reports", "dod", VERTICAL);
export const SCREENS_DIR = path.join(REPORTS_DIR, "screens");
export const RESULTS_DIR = path.join(REPORTS_DIR, "results");
// QA session reused by every entry, written by global-setup. Untracked: reports/ is git-ignored.
export const STORAGE_STATE = path.join(REPORTS_DIR, "qa-storage-state.json");

export const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

/** WCAG 2.0, 2.1 and 2.2, levels A and AA. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

type ArgosScreenshot = (page: unknown, name: string, options?: { threshold?: number }) => Promise<unknown>;
// A variable specifier, so neither TypeScript nor a bundler insists the package exists.
const ARGOS_PACKAGE = "@argos-ci/playwright";
let argos: Promise<ArgosScreenshot> | null = null;

/**
 * `@argos-ci/playwright` is optional: a project that does not upload screenshots never
 * installs it. It is loaded only when ARGOS_TOKEN is set, and a token without the package
 * is a configuration error said in words, not a module-not-found stack.
 */
export function loadArgos(): Promise<ArgosScreenshot> {
  argos ??= import(ARGOS_PACKAGE).then(
    (m: { argosScreenshot?: ArgosScreenshot; default?: { argosScreenshot?: ArgosScreenshot } }) => {
      const fn = m.argosScreenshot ?? m.default?.argosScreenshot;
      if (!fn) throw new Error(`[dod] ${ARGOS_PACKAGE} loaded but has no argosScreenshot export`);
      return fn;
    },
    () => {
      throw new Error(
        `[dod] ARGOS_TOKEN is set but ${ARGOS_PACKAGE} is not installed. Install it ` +
          `(pnpm add -D -E ${ARGOS_PACKAGE}) or unset ARGOS_TOKEN to run without visual diffs.`,
      );
    },
  );
  return argos;
}

export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

/**
 * JSON is read with fs, not imported. A static JSON import needs `with { type: "json" }`
 * in an ESM project and is a syntax Playwright's CommonJS transform may not take, so no
 * single import line works in both kinds of project.
 */
function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    throw new Error(`[dod] ${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Who the page is measured as. `qa` (the default) reuses the QA session from
 * global-setup. `anonymous` opens the page in a fresh context with no storage state, so a
 * public page is judged as a visitor sees it, not as the signed-in staff member does.
 */
export type Audience = "anonymous" | "qa";

export interface RouteEntry {
  route: string;
  audience: Audience;
  /** A page with no data states (no empty, no error variant). */
  static: boolean;
}

/**
 * routes.json holds strings ("/plans") or objects
 * ({ "route": "/", "audience": "anonymous", "static": true }); both mean the same thing
 * everywhere, a string being { route, audience: "qa", static: false }.
 */
export function loadRoutes(): RouteEntry[] {
  const raw = readJson<unknown>(path.join(DOD_DIR, "routes.json"), []);
  if (!Array.isArray(raw)) throw new Error("[dod] e2e/dod/routes.json must be a JSON array");
  return raw.map((e: unknown, i): RouteEntry => {
    if (typeof e === "string") return { route: e, audience: "qa", static: false };
    const o = e as { route?: unknown; audience?: unknown; static?: unknown } | null;
    if (!o || typeof o.route !== "string") {
      throw new Error(`[dod] routes.json entry ${i} is neither a string nor an object with a "route"`);
    }
    const audience = o.audience ?? "qa";
    if (audience !== "qa" && audience !== "anonymous") {
      throw new Error(`[dod] routes.json entry ${o.route}: audience must be "qa" or "anonymous"`);
    }
    return { route: o.route, audience, static: o.static === true };
  });
}

export interface RouteParams {
  _exclude?: Record<string, string>;
  _gated?: string[];
  _alias?: Record<string, string>;
  [key: string]: unknown;
}

export function loadParams(): RouteParams {
  return readJson<RouteParams>(path.join(DOD_DIR, "route-params.json"), {});
}

/** The `_exclude` map without its `_comment` keys, which are notes, not routes. */
export function excludedRoutes(params: RouteParams): Record<string, string> {
  return Object.fromEntries(Object.entries(params._exclude ?? {}).filter(([k]) => !k.startsWith("_")));
}

export function routeSlug(route: string): string {
  return (
    route
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      // "root", not "home": `/` and `/home` are two different screens, and when both
      // slug to the same name the second entry overwrites the first, so one route goes
      // unmeasured while the report still counts it. The slug has to be injective.
      .replace(/^-+|-+$/g, "") || "root"
  );
}

export interface AxeViolation {
  id: string;
  impact: string;
  help: string;
  nodes: number;
  /** The first few failing elements, so a finding can be acted on without a
   *  second run. A count alone sends you hunting for an element that may only
   *  appear at one width, in one colour scheme, or at one time of day. */
  samples: { target: string; html: string }[];
}

export interface EntryResult {
  route: string;
  slug: string;
  audience: Audience;
  viewport: { width: number; height: number };
  scheme: Scheme;
  status: number | null;
  load_error: string | null;
  // true when the QA session could not open the page: non-2xx, a redirect to a
  // login or access-denied screen, or a load error. Such a page is unmeasured,
  // never "passing", so it forces the score to 0 until access is fixed.
  unreachable: boolean;
  unreachable_reason: string | null;
  /**
   * Whether the app actually painted this route. `unreachable` above is about the
   * response; this is about the render, and they fail apart. A suspense fallback
   * answers 200, has no contrast defects, no small targets and no console errors, so
   * an unsettled page scores a perfect 100 — which is how TherapyFlow's /mini-site
   * reported 100 on 16/09 while its screenshot showed nothing but "loading your
   * salon…". "Nothing wrong" and "nothing there" read identically to a probe suite
   * that only looks for defects, so presence has to be asserted, not assumed.
   */
  /** Set when the route is a DECLARED alias: where it landed, so the report says
   *  which page was actually measured under this name. An undeclared redirect is
   *  `unreachable`, not an alias — see `_alias` in route-params.json. */
  redirected_to?: string;
  reached: boolean;
  not_reached_reason: string | null;
  screenshot: string | null;
  overflow: { scrollWidth: number; clientWidth: number; failed: boolean };
  /**
   * `counted` is every failing node of every violation, whatever its impact: a
   * `moderate` contrast or language defect is a defect a person meets, and counting only
   * serious and critical let those pass at 100. `by_impact` keeps the split.
   */
  axe: { version: string | null; counted: number; by_impact: Record<string, number>; violations: AxeViolation[] };
  console_errors: string[];
  fonts: { families: string[]; count: number };
  touch_targets: { checked: boolean; failures: number; samples: string[] };
  reduced_motion: { violations: number; samples: string[] };
}

export interface Totals {
  unreachable: number;
  unreached: number;
  overflow_failures: number;
  axe_violations: number;
  console_errors: number;
  font_families: number;
  touch_target_failures: number;
  reduced_motion_violations: number;
  score: number;
}

/**
 * Scoring: start at 100.
 *  -15 per overflow (each route × viewport × scheme entry)
 *  -5 per axe violation node, any impact (minor, moderate, serious, critical)
 *  -5 per console error
 *  -10 if font families > 2
 *  -2 per touch-target failure (capped at -20)
 *  -10 per reduced-motion violation
 *  -100 if any entry was unreachable (non-2xx, a redirect to a login screen, or a load error):
 *     a page the QA account cannot open is not "passing", it is unmeasured.
 *  -100 if any entry was never reached: the response arrived but the app did not paint.
 *     Same reason, one layer up — averaging an unrendered page in as "perfect" is the
 *     single failure mode that makes the whole number a lie.
 */
export function score(t: Omit<Totals, "score">): number {
  if (t.unreachable > 0) return 0;
  if (t.unreached > 0) return 0;
  let s = 100;
  s -= 15 * t.overflow_failures;
  s -= 5 * t.axe_violations;
  s -= 5 * t.console_errors;
  if (t.font_families > 2) s -= 10;
  s -= Math.min(20, 2 * t.touch_target_failures);
  s -= 10 * t.reduced_motion_violations;
  return Math.max(0, Math.min(100, s));
}

/**
 * Aggregates entries for one route (or all routes). Per-page findings (axe, console,
 * touch targets, reduced motion) are counted once per route as the max across its
 * viewport/scheme entries, so the same defect isn't charged four times. Overflow is
 * counted per entry (mobile vs desktop overflow are distinct defects).
 */
export function aggregate(entries: EntryResult[]): Totals {
  const byRoute = new Map<string, EntryResult[]>();
  for (const e of entries) byRoute.set(e.route, [...(byRoute.get(e.route) ?? []), e]);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const t = {
    unreachable: entries.filter((e) => e.unreachable).length,
    unreached: entries.filter((e) => !e.unreachable && !e.reached).length,
    overflow_failures: entries.filter((e) => e.overflow.failed).length,
    axe_violations: 0,
    console_errors: 0,
    font_families: max(entries.map((e) => e.fonts.count)),
    touch_target_failures: 0,
    reduced_motion_violations: 0,
  };
  for (const es of byRoute.values()) {
    t.axe_violations += max(es.map((e) => e.axe.counted));
    t.console_errors += max(es.map((e) => e.console_errors.length));
    t.touch_target_failures += max(es.filter((e) => e.touch_targets.checked).map((e) => e.touch_targets.failures));
    t.reduced_motion_violations += max(es.map((e) => e.reduced_motion.violations));
  }
  return { ...t, score: score(t) };
}
