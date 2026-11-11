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

/** What stands in for a removed query string or fragment, and for a secret's value. */
const QUERY_REMOVED = "?[query removed]";
const SECRET = "[redacted]";
// An absolute URL, or a path in a sentence ("redirected to /login?next=…"); the query and the
// fragment are what is cut.
const URLISH = /(?:https?|wss?):\/\/[^\s"'<>`]+|(?<![\w:/.-])\/[^\s"'<>`]*/g;

/**
 * The one door for text that comes from a Playwright error, a locator's call log, a page's URL or
 * console, or an environment value, on its way to anything the run writes (reports/, dod.json, a
 * reason, the console). It keeps the first line only (a call log is the lines after it: Playwright
 * puts the value of a fill there), replaces the value of DOD_PASSWORD, of DOD_USER and of any other
 * DOD_* (or ARGOS_TOKEN) whose name looks secret (not a *_SELECTOR or *_PATH), and any JSON Web
 * Token, with "[redacted]", and cuts every URL's query and
 * fragment, except a query equal to `keepQuery` (the route's own, from routes.json).
 */
export function redact(text: unknown, keepQuery?: string): string {
  let s = (text instanceof Error ? text.message : String(text ?? "")).split(/\r?\n/)[0] ?? "";
  s = s.replace(/\x1b\[[0-9;]*m/g, "");
  const secrets = Object.entries(process.env)
    // The user name only from 6 characters on, so a short one ("qa") does not eat route words.
    // A *_SELECTOR or *_PATH (DOD_PASSWORD_SELECTOR) is not a secret: the message that names it is
    // how a user finds the field.
    .filter(([k, v]) => v && v.length >= (k === "DOD_USER" ? 6 : 3) && !/_(SELECTOR|PATH)$/.test(k) && (k === "DOD_PASSWORD" || k === "DOD_USER" || k === "ARGOS_TOKEN" || (k.startsWith("DOD_") && /PASS|SECRET|TOKEN|KEY|COOKIE|SESSION|AUTH/i.test(k))))
    .map(([, v]) => v as string)
    .sort((a, b) => b.length - a.length);
  for (const v of secrets)
    for (const form of new Set([v, JSON.stringify(v).slice(1, -1), encodeURIComponent(v)])) if (form) s = s.split(form).join(SECRET);
  // A JSON Web Token anywhere in the text (an app's own console line can print one).
  s = s.replace(/\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]+/g, SECRET);
  return s.replace(URLISH, (u) => {
    const at = u.search(/[?#]/);
    if (at < 0) return u;
    if (keepQuery && u.slice(at) === keepQuery) return u;
    return u.slice(0, at) + QUERY_REMOVED;
  });
}

/** The query of a route in routes.json ("?state=empty"), or "" when it has none. */
export const routeQuery = (route: string) => (route.includes("?") ? route.slice(route.indexOf("?")) : "");

/**
 * The route's own region, for the fingerprint: the first of these lists that matches, in this
 * order. Its <main> (or [role="main"], #main-content) whenever the page has one, and the app's root
 * (#root, #__next) only when it has none: one selector list would return the first match in
 * document order, and #root wraps <main>, which made the "region" of every Vite, CRA and Next
 * pages-router app its whole shell. (reachRoute and the not-found print still read the first of
 * "main, #main-content, #root, #__next" in document order, the app's painted area: changing that
 * would move scored numbers.)
 */
export const ROUTE_REGION = ['main, [role="main"], #main-content', "#root, #__next"] as const;

/**
 * What the scored phase saw of a page, taken at the moment it measures it (painted, settled), so
 * the checks phase can prove that its own load is the same page before judging it: the landmark
 * kinds on the page, its visible h1-h3 headings, the labels of the visible controls in the route's
 * region, and a sketch of the region's words. Texts are whitespace-collapsed, lower-cased and
 * without digits (a clock, a count), so they stay the same across two loads of one page.
 */
export interface PageFingerprint {
  landmarks: string[];
  headings: string[];
  /** Sorted, a multiset (a label can repeat). At most 80. */
  controls: string[];
  /** The 64 smallest 32-bit hashes of the region's distinct words (a bottom-k sketch). */
  words: number[];
}

/** How far the checks phase's page may differ from the scored one and still be that page. */
export interface FingerprintTolerance {
  /** Whether the landmark kinds must be the same (false: a route whose landmarks change between loads). */
  landmarks: boolean;
  /** Least share of heading words in common (Jaccard), when either page has headings. */
  headings: number;
  /** Controls that may be missing or new, as a share of the larger set (at least one). */
  controls: number;
  /** Least share of region words in common (Jaccard, estimated from the sketches). */
  words: number;
}
export const FINGERPRINT_TOLERANCE: FingerprintTolerance = { landmarks: true, headings: 0.5, controls: 0.2, words: 0.5 };

/**
 * null when `now` is the page `scored` describes, within `tol`; otherwise the difference in a few
 * words. The landmark kinds must be the same; the rest is compared with its tolerance.
 */
export function fingerprintDiff(scored: PageFingerprint, now: PageFingerprint, tol: FingerprintTolerance): string | null {
  const out: string[] = [];
  const a = [...scored.landmarks].sort().join(", ") || "none";
  const b = [...now.landmarks].sort().join(", ") || "none";
  if (tol.landmarks && a !== b) out.push(`landmarks ${a} → ${b}`);
  const words = (hs: string[]) => new Set(hs.flatMap((h) => h.split(" ").filter(Boolean)));
  const ha = words(scored.headings);
  const hb = words(now.headings);
  if (ha.size || hb.size) {
    const both = [...ha].filter((w) => hb.has(w)).length;
    const j = both / new Set([...ha, ...hb]).size;
    if (j < tol.headings) out.push(`headings "${scored.headings.slice(0, 3).join('", "')}" → "${now.headings.slice(0, 3).join('", "')}"`);
  }
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(scored.controls);
  const cb = count(now.controls);
  const missing = [...ca].flatMap(([x, n]) => Array(Math.max(0, n - (cb.get(x) ?? 0))).fill(x) as string[]);
  const added = [...cb].flatMap(([x, n]) => Array(Math.max(0, n - (ca.get(x) ?? 0))).fill(x) as string[]);
  const allowed = Math.max(1, Math.floor(tol.controls * Math.max(scored.controls.length, now.controls.length)));
  if (missing.length + added.length > allowed) {
    const q = (xs: string[]) => xs.slice(0, 3).map((x) => `"${x}"`).join(", ") + (xs.length > 3 ? ", …" : "");
    out.push(
      `controls ${scored.controls.length} → ${now.controls.length}` +
        ` (${[missing.length ? `missing ${q(missing)}` : "", added.length ? `new ${q(added)}` : ""].filter(Boolean).join("; ")})`,
    );
  }
  if (scored.words.length || now.words.length) {
    const A = new Set(scored.words);
    const B = new Set(now.words);
    const union = [...new Set([...scored.words, ...now.words])].sort((x, y) => x - y).slice(0, 64);
    const j = union.filter((h) => A.has(h) && B.has(h)).length / union.length;
    if (j < tol.words) out.push(`${Math.round(j * 100)}% of the words in common (at least ${Math.round(tol.words * 100)}%)`);
  }
  return out.length ? out.join("; ") : null;
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
  /** How far the checks phase's load may differ from the scored page (FINGERPRINT_TOLERANCE, or
   *  the route's own "fingerprint" with its reason). */
  fingerprint: FingerprintTolerance;
}

/** A route's "fingerprint": { "landmarks"?: false, "headings"?, "controls"?, "words"?: 0..1, "reason": "<why>" }. */
function routeTolerance(route: string, raw: unknown): FingerprintTolerance {
  if (raw === undefined) return FINGERPRINT_TOLERANCE;
  const o = raw as Record<string, unknown> | null;
  const bad = (why: string) => new Error(`[dod] routes.json entry ${route}: "fingerprint" ${why}`);
  if (!o || typeof o !== "object" || Array.isArray(o)) throw bad('is an object: { "words": 0.3, "reason": "<why>" }');
  if (typeof o.reason !== "string" || !o.reason.trim()) throw bad('needs a "reason" (a non-empty string)');
  const tol = { ...FINGERPRINT_TOLERANCE };
  for (const [k, v] of Object.entries(o)) {
    if (k === "reason") continue;
    if (!(k in tol)) throw bad(`has an unknown key "${k}" (landmarks, headings, controls, words, reason)`);
    if (k === "landmarks") {
      if (typeof v !== "boolean") throw bad('"landmarks" must be true or false');
      tol.landmarks = v;
      continue;
    }
    if (typeof v !== "number" || v < 0 || v > 1) throw bad(`"${k}" must be a number from 0 to 1`);
    tol[k as "headings" | "controls" | "words"] = v;
  }
  return tol;
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
    if (typeof e === "string") return { route: e, audience: "qa", static: false, noHelp: null, legacyStatic: false, fingerprint: FINGERPRINT_TOLERANCE };
    const o = e as { route?: unknown; audience?: unknown; static?: unknown; noHelp?: unknown; fingerprint?: unknown } | null;
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
    return { route: o.route, audience, static: o.static === true, noHelp, legacyStatic, fingerprint: routeTolerance(o.route, o.fingerprint) };
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
   *  run skips them (default 5). With several workers the run can end with up to
   *  maxTimeouts + workers - 1 timed-out entries: the others were already being checked. */
  maxTimeouts: number;
  /** The checks phase as a whole stops after this many minutes (default 60); run-dod.mjs ends it. */
  checksMinutes: number;
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
  const checksMinutes = raw.checksMinutes ?? 60;
  if (typeof checksMinutes !== "number" || !(checksMinutes > 0)) bad('"checksMinutes" must be a positive number of minutes');
  return { ...raw, profile, mode, textFloorPx, forbiddenWords, maxTimeouts, checksMinutes } as StandardConfig;
}

/** What a `?state=` variant must render: one of these `data-state` values, or null. */
export function expectedState(route: string): string[] | null {
  const state = new URLSearchParams(route.split("?")[1] ?? "").get("state");
  if (state === "empty") return ["empty", "clear", "filtered-empty"];
  if (state === "error") return ["error"];
  return null;
}

/** Which of the standard's checks an entry runs, so a check that never ran can say so. */
export function plannedChecks(cfg: StandardConfig, route: string, viewport: { width: number }, scheme: string): string[] {
  const ids: string[] = [...DOM_CHECK_IDS];
  if (expectedState(route)) ids.push("state-coverage");
  const cu = cfg.coreUnit;
  if (cu && cu.route === route && scheme === "light" && viewport.width === (cu.viewport[0] <= 768 ? 375 : 1440)) ids.push("core-unit");
  if (scheme === "light") ids.push("probe");
  return ids;
}

/** Every planned check, unmeasured for one reason. */
export function notFinished(ids: string[], why: string): Record<string, CheckResult> {
  return Object.fromEntries(ids.map((id) => [id, { count: 0, samples: [], error: why }]));
}

/** Which phase of `pnpm dod` this process is (run-dod.mjs sets DOD_PHASE). */
export const PHASE: "scored" | "checks" = process.env.DOD_PHASE === "checks" ? "checks" : "scored";
/** Written by global-setup of the checks phase when its sign-in did not land: what went wrong. */
export const CHECKS_SIGNIN_FILE = path.join(RESULTS_DIR, "checks-signin-failed.txt");
/** Written by run-dod.mjs when it stopped the checks phase (its `checksMinutes` deadline, or a
 *  signal to the runner), with why. */
export const CHECKS_DEADLINE_FILE = path.join(RESULTS_DIR, "checks-deadline.json");
/** Why run-dod.mjs stopped the checks phase (its deadline, or a signal to the runner). */
export function checksStoppedWhy(minutes: number): string {
  try {
    return (JSON.parse(fs.readFileSync(CHECKS_DEADLINE_FILE, "utf8")) as { why?: string }).why ?? `reached its deadline (checksMinutes ${minutes})`;
  } catch {
    return `reached its deadline (checksMinutes ${minutes})`;
  }
}
/** The checks phase's own file for an entry, next to the scored one. */
export const standardFile = (name: string) => path.join(RESULTS_DIR, `${name}.standard.json`);

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
  /** Set by the aggregation when the checks phase left no result for this entry (it has not
   *  run, it reached its deadline, or its test ended first): every planned check is errored. */
  standard_unchecked?: string;
  /** The URL the scored phase measured (after a declared alias), through redact(): a query that
   *  is not the route's own is cut. The checks phase compares its path with its own load's. */
  measured_url?: string;
  /** Recorded, not scored, with or without standard.json: what the measured page was, so the
   *  checks phase can prove its own load is that page (PageFingerprint). */
  fingerprint?: PageFingerprint;
  /** Whether the measured page showed a sign-in form (a visible password field). The checks phase
   *  compares: a form there that the scored phase did not see means its session is not signed in. */
  signin_form?: boolean;
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
