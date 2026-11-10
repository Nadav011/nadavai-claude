import fs from "node:fs";
import path from "node:path";
import { DOM_CHECK_IDS, type CheckResult, type ProbeAt } from "./standard-dom";

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
// The QA session reused by every entry, written by global-setup. It holds the QA account's
// session cookies, so it never sits in reports/, which CI uploads as an artifact: it lives in
// node_modules/.cache, which every project git-ignores and no workflow uploads. DOD_STORAGE_STATE
// moves it.
export const STORAGE_STATE = path.resolve(
  process.env.DOD_STORAGE_STATE ?? path.join(ROOT, "node_modules", ".cache", "dod", VERTICAL, "qa-storage-state.json"),
);
// What the app shows for a route that does not exist, taken once by global-setup.
export const NOT_FOUND_PRINT = path.join(REPORTS_DIR, "not-found-print.json");

export interface NotFoundPrint {
  /** The made-up path that was requested; removed from texts before they are compared. */
  path: string;
  status: number | null;
  /** Where the request landed: a catch-all redirect makes the print useless. */
  landed: string;
  /** The page's own region text, whitespace collapsed, without the requested path. */
  text: string;
}

/** Text of the route's own region, the way reachRoute reads it, for the not-found print. */
export function normalizeRegionText(text: string, requestedPath: string): string {
  const without = requestedPath.length > 1 ? text.split(requestedPath).join("") : text;
  return without.replace(/\s+/g, " ").trim();
}

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

/**
 * How axe findings cost points, from the optional e2e/dod/scoring.json:
 * { "axe": { "minorModerate": "report" | "enforce" } }. Critical and serious nodes always cost
 * 5 each. Minor and moderate nodes are always recorded; they cost points only with "enforce".
 * The default is "report", so adopting the template's wider axe run does not turn a nightly red
 * on the first day; a project switches to "enforce" once its minor and moderate findings are fixed.
 */
export interface Scoring {
  axe: { minorModerate: "report" | "enforce" };
}

export function loadScoring(): Scoring {
  const raw = readJson<{ axe?: { minorModerate?: unknown } }>(path.join(DOD_DIR, "scoring.json"), {});
  const mm = raw.axe?.minorModerate ?? "report";
  if (mm !== "report" && mm !== "enforce") {
    throw new Error('[dod] e2e/dod/scoring.json: "axe.minorModerate" must be "report" or "enforce"');
  }
  return { axe: { minorModerate: mm } };
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
  /** A page with no data states: exempt from state-coverage only. */
  static: boolean;
  /** Why the page has no help door (exempts help-door and help-route); null when it must have one. */
  noHelp: string | null;
  /** `static: true` with no `noHelp` key: the old form, which still exempts help as well. */
  legacyStatic: boolean;
}

/**
 * routes.json holds strings ("/plans") or objects
 * ({ "route": "/", "audience": "anonymous", "static": true, "noHelp": "the sign-in page" });
 * a string is { route, audience: "qa", static: false, noHelp: null }.
 *
 * `static` used to exempt a page from the help door as well. An entry that has `static: true`
 * and no `noHelp` key is read that old way, with a deprecation note; `"noHelp": false` says
 * the static page must still have its door.
 */
export function loadRoutes(): RouteEntry[] {
  const raw = readJson<unknown>(path.join(DOD_DIR, "routes.json"), []);
  if (!Array.isArray(raw)) throw new Error("[dod] e2e/dod/routes.json must be a JSON array");
  return raw.map((e: unknown, i): RouteEntry => {
    if (typeof e === "string") return { route: e, audience: "qa", static: false, noHelp: null, legacyStatic: false };
    const o = e as { route?: unknown; audience?: unknown; static?: unknown; noHelp?: unknown } | null;
    if (!o || typeof o.route !== "string") {
      throw new Error(`[dod] routes.json entry ${i} is neither a string nor an object with a "route"`);
    }
    const audience = o.audience ?? "qa";
    if (audience !== "qa" && audience !== "anonymous") {
      throw new Error(`[dod] routes.json entry ${o.route}: audience must be "qa" or "anonymous"`);
    }
    if (o.noHelp !== undefined && o.noHelp !== false && (typeof o.noHelp !== "string" || !o.noHelp.trim())) {
      throw new Error(`[dod] routes.json entry ${o.route}: "noHelp" is a reason (a non-empty string) or false`);
    }
    const legacyStatic = o.static === true && o.noHelp === undefined;
    const noHelp = typeof o.noHelp === "string" ? o.noHelp : legacyStatic ? "static (old form: add \"noHelp\")" : null;
    return { route: o.route, audience, static: o.static === true, noHelp, legacyStatic };
  });
}

export interface RouteParams {
  _exclude?: Record<string, string>;
  /** Routes kept in routes.json although the route scan cannot find them, each with its reason. */
  _listed?: Record<string, string>;
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

/**
 * The experience standard (nadav-design `standard/experience.md`), configured per project in
 * e2e/dod/standard.json. No file: the standard's checks do not run, and dod.json says
 * `standard: "not configured"`.
 */
export interface StandardConfig {
  profile: "work-tool" | "consumer";
  /** `report` writes findings to dod.json and leaves the score alone; `enforce` deducts. */
  mode: "enforce" | "report";
  /** In `report` mode, the check ids that already deduct, so a project moves them one at a time.
   *  Ids from standard-checks.json; the static ones are enforced by routes.mjs --check. */
  enforce?: string[];
  /** After this many entries of a run ran out of time in the standard's checks, the rest of the
   *  run skips them (default 5). */
  maxTimeouts: number;
  /** Smallest text the probe accepts, in px. */
  textFloorPx: number;
  helpDir?: string;
  coreUnit?: { route: string; selector: string; min: number; viewport: [number, number] };
  languages?: { lang: string; dir: "rtl" | "ltr"; routePrefix?: string; query?: string }[];
  /** Added to the built-in Hebrew list (standard-dom.ts), never replacing it. */
  forbiddenWords: string[];
}

/** In `enforce` mode: deducted once per check id that has findings on a route. */
export const STANDARD_PENALTY = 10;

/** Conditions of the standard's check table that this template does not measure yet. */
export const STANDARD_NOT_BUILT: Record<string, string> = {
  "error-field": "the focus half (focus on the first invalid field after submit) is a later step; only the static half runs",
  probe: "an icon covered by its badge is not measured",
  "tour-no-commit": "not built until a project defines a tour manifest",
};

export function loadStandard(): StandardConfig | null {
  const file = path.join(DOD_DIR, "standard.json");
  if (!fs.existsSync(file)) return null;
  const raw = readJson<Partial<StandardConfig>>(file, {});
  const bad = (why: string): never => {
    throw new Error(`[dod] e2e/dod/standard.json: ${why}`);
  };
  const profile = raw.profile ?? bad('"profile" is required: "work-tool" or "consumer"');
  if (profile !== "work-tool" && profile !== "consumer") bad('"profile" must be "work-tool" or "consumer"');
  const mode = raw.mode ?? "report";
  if (mode !== "enforce" && mode !== "report") bad('"mode" must be "enforce" or "report"');
  const textFloorPx = raw.textFloorPx ?? 12;
  if (typeof textFloorPx !== "number" || !(textFloorPx > 0)) bad('"textFloorPx" must be a positive number');
  const cu = raw.coreUnit;
  if (
    cu &&
    (typeof cu.route !== "string" ||
      typeof cu.selector !== "string" ||
      typeof cu.min !== "number" ||
      !Array.isArray(cu.viewport) ||
      cu.viewport.length !== 2)
  )
    bad('"coreUnit" must be { "route", "selector", "min", "viewport": [width, height] }');
  const forbiddenWords = raw.forbiddenWords ?? [];
  if (!Array.isArray(forbiddenWords) || forbiddenWords.some((w) => typeof w !== "string" || !w.trim()))
    bad('"forbiddenWords" must be a list of non-empty strings');
  const known = [...new Set([...CHECK_IDS.page, ...CHECK_IDS.static])];
  if (raw.enforce !== undefined && (!Array.isArray(raw.enforce) || raw.enforce.some((id) => !known.includes(id))))
    bad(`"enforce" must be a list of check ids (${known.join(", ")})`);
  const maxTimeouts = raw.maxTimeouts ?? 5;
  if (!Number.isInteger(maxTimeouts) || maxTimeouts < 1) bad('"maxTimeouts" must be a whole number of entries, 1 or more');
  return { ...raw, profile, mode, textFloorPx, forbiddenWords, maxTimeouts } as StandardConfig;
}

/**
 * The standard's check ids, one list for both sides (e2e/dod/standard-checks.json): `page` for
 * this run, `static` for routes.mjs --check.
 */
export const CHECK_IDS: { page: string[]; static: string[] } = JSON.parse(
  fs.readFileSync(path.join(DOD_DIR, "standard-checks.json"), "utf8"),
);
for (const id of DOM_CHECK_IDS)
  if (!CHECK_IDS.page.includes(id)) throw new Error(`[dod] e2e/dod/standard-checks.json: page check "${id}" is missing`);

/** Whether a check id costs points: every id in `enforce` mode, the ids listed in `enforce` in `report`. */
export function standardEnforced(cfg: StandardConfig | null): (id: string) => boolean {
  if (!cfg) return () => false;
  return (id) => cfg.mode === "enforce" || (cfg.enforce ?? []).includes(id);
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
  /** `scored` is the part that costs points: critical and serious nodes, plus minor and
   *  moderate ones when scoring.json says "enforce". */
  axe: {
    version: string | null;
    counted: number;
    scored: number;
    by_impact: Record<string, number>;
    violations: AxeViolation[];
  };
  console_errors: string[];
  fonts: { families: string[]; count: number };
  touch_targets: { checked: boolean; failures: number; samples: string[] };
  reduced_motion: { violations: number; samples: string[] };
  /** The standard's checks on this entry, by check id; absent when standard.json is. */
  standard?: Record<string, CheckResult>;
  /** A failure of the standard's machinery itself (never of the page): recorded, never scored. */
  standard_error?: string;
  /** Why the standard's checks ran a second time on this entry (the first try's error): set
   *  when a check errored on the time budget, or on any error under CI, and the page still
   *  answered. Only the second try's results are kept. */
  standard_retried?: string;
  /** Set when the standard's checks did not run on this entry because the run reached its
   *  `maxTimeouts`: every planned check carries the same error. */
  standard_skipped?: string;
  /** The mechanical probe, by size ("320x700"); light scheme only. */
  probe?: Record<string, ProbeAt>;
}

export interface Totals {
  unreachable: number;
  unreached: number;
  overflow_failures: number;
  /** Scored axe nodes (they cost points). */
  axe_violations: number;
  /** Every axe node found, scored or not. */
  axe_recorded: number;
  console_errors: number;
  font_families: number;
  touch_target_failures: number;
  reduced_motion_violations: number;
  /** The standard's findings: every count, summed over routes (each route's highest entry). */
  standard_findings: number;
  /** Check ids with findings, one per route and check id, enforced or not. */
  standard_failures: number;
  /** Check ids that could not finish (an error), one per route and check id, enforced or not. */
  standard_errored: number;
  /** Check ids that cost points: enforced ones with findings or an error, one per route and check id. */
  standard_scored: number;
  score: number;
}

/**
 * Scoring: start at 100.
 *  -15 per overflow (each route × viewport × scheme entry)
 *  -5 per axe violation node that is scored: critical and serious always, minor and moderate
 *     only with scoring.json "axe.minorModerate": "enforce"
 *  -5 per console error
 *  -10 if font families > 2
 *  -2 per touch-target failure (capped at -20)
 *  -10 per reduced-motion violation
 *  -10 (STANDARD_PENALTY) per enforced standard check id on a route with findings or an error (a
 *     check that could not measure is never a pass); none for a check id in `report` mode
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
  s -= STANDARD_PENALTY * t.standard_scored;
  return Math.max(0, Math.min(100, s));
}

/**
 * Aggregates entries for one route (or all routes). Per-page findings (axe, console,
 * touch targets, reduced motion) are counted once per route as the max across its
 * viewport/scheme entries, so the same defect isn't charged four times. Overflow is
 * counted per entry (mobile vs desktop overflow are distinct defects). The standard's
 * checks are per page too: a check id counts once per route, at its highest entry. `enforced`
 * says which check ids cost points (standardEnforced).
 */
export function aggregate(entries: EntryResult[], enforced: (id: string) => boolean = () => false): Totals {
  const byRoute = new Map<string, EntryResult[]>();
  for (const e of entries) byRoute.set(e.route, [...(byRoute.get(e.route) ?? []), e]);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const t = {
    unreachable: entries.filter((e) => e.unreachable).length,
    unreached: entries.filter((e) => !e.unreachable && !e.reached).length,
    overflow_failures: entries.filter((e) => e.overflow.failed).length,
    axe_violations: 0,
    axe_recorded: 0,
    console_errors: 0,
    font_families: max(entries.map((e) => e.fonts.count)),
    touch_target_failures: 0,
    reduced_motion_violations: 0,
    standard_findings: 0,
    standard_failures: 0,
    standard_errored: 0,
    standard_scored: 0,
  };
  for (const es of byRoute.values()) {
    for (const [id, c] of Object.entries(routeStandard(es, enforced))) {
      t.standard_findings += c.count;
      if (c.count > 0) t.standard_failures++;
      if (c.error) t.standard_errored++;
      if (enforced(id) && (c.count > 0 || c.error)) t.standard_scored++;
    }
    t.axe_violations += max(es.map((e) => e.axe.scored));
    t.axe_recorded += max(es.map((e) => e.axe.counted));
    t.console_errors += max(es.map((e) => e.console_errors.length));
    t.touch_target_failures += max(es.filter((e) => e.touch_targets.checked).map((e) => e.touch_targets.failures));
    t.reduced_motion_violations += max(es.map((e) => e.reduced_motion.violations));
  }
  return { ...t, score: score(t) };
}

/**
 * One route's standard checks from its entries: each check id at its highest entry, with
 * that entry's samples labelled by viewport and scheme. `skipped` only when every entry
 * that ran the check skipped it. `verdict` says it in words: "errored" (the check could not
 * finish on some entry, whatever it found), "found N", "skipped" or "clean"; `enforced` says
 * whether it costs points.
 */
export function routeStandard(
  es: EntryResult[],
  enforced: (id: string) => boolean = () => false,
): Record<string, CheckResult & { verdict: string; enforced: boolean }> {
  const out: Record<string, CheckResult> = {};
  for (const e of es) {
    for (const [id, c] of Object.entries(e.standard ?? {})) {
      const at = `${e.viewport.width}/${e.scheme}`;
      // The probe's sizes are split between the two light entries (the 375 entry takes the
      // phone and tablet sizes, the 1440 entry the desktop ones), so the route's probe is their sum.
      if (id === "probe") {
        const cur = (out.probe ??= { count: 0, samples: [] });
        cur.count += c.count;
        cur.samples.push(...c.samples.map((x) => `${at}: ${x}`));
        if (c.error) cur.error = cur.error ? `${cur.error}; ${at}: ${c.error}` : `${at}: ${c.error}`;
        continue;
      }
      const cur = out[id];
      if (!cur || c.count > cur.count || (cur.skipped && !c.skipped))
        out[id] = {
          count: c.count,
          samples: c.samples.map((x) => `${at}: ${x}`),
          ...(c.skipped ? { skipped: c.skipped } : {}),
          ...(cur?.error ? { error: cur.error } : {}),
        };
      // A check that failed on any entry says so on the route, whatever its count.
      if (c.error) out[id].error ??= `${at}: ${c.error}`;
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([id, c]) => [
      id,
      { ...c, verdict: c.error ? "errored" : c.count ? `found ${c.count}` : c.skipped ? "skipped" : "clean", enforced: enforced(id) },
    ]),
  );
}
