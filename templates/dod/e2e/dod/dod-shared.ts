import path from "node:path";

export const REPORTS_DIR = path.resolve(__dirname, "..", "..", "reports", "dod");
export const SCREENS_DIR = path.join(REPORTS_DIR, "screens");
export const RESULTS_DIR = path.join(REPORTS_DIR, "results");
// QA session reused by every entry, written by global-setup. Untracked: reports/ is git-ignored.
export const STORAGE_STATE = path.join(REPORTS_DIR, "qa-storage-state.json");

export const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

export function routeSlug(route: string): string {
  return (
    route
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "home"
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
  viewport: { width: number; height: number };
  scheme: Scheme;
  status: number | null;
  load_error: string | null;
  // true when the QA session could not open the page: non-2xx, a redirect to a
  // login or access-denied screen, or a load error. Such a page is unmeasured,
  // never "passing", so it forces the score to 0 until access is fixed.
  unreachable: boolean;
  unreachable_reason: string | null;
  screenshot: string | null;
  overflow: { scrollWidth: number; clientWidth: number; failed: boolean };
  axe: { critical_serious: number; violations: AxeViolation[] };
  console_errors: string[];
  fonts: { families: string[]; count: number };
  touch_targets: { checked: boolean; failures: number; samples: string[] };
  reduced_motion: { violations: number; samples: string[] };
}

export interface Totals {
  unreachable: number;
  overflow_failures: number;
  axe_critical_serious: number;
  console_errors: number;
  font_families: number;
  touch_target_failures: number;
  reduced_motion_violations: number;
  score: number;
}

/**
 * Scoring: start at 100.
 *  -15 per overflow (each route × viewport × scheme entry)
 *  -5 per axe serious/critical violation
 *  -5 per console error
 *  -10 if font families > 2
 *  -2 per touch-target failure (capped at -20)
 *  -10 per reduced-motion violation
 *  -100 if any entry was unreachable (non-2xx, a redirect to a login screen, or a load error):
 *     a page the QA account cannot open is not "passing", it is unmeasured.
 */
export function score(t: Omit<Totals, "score">): number {
  if (t.unreachable > 0) return 0;
  let s = 100;
  s -= 15 * t.overflow_failures;
  s -= 5 * t.axe_critical_serious;
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
    overflow_failures: entries.filter((e) => e.overflow.failed).length,
    axe_critical_serious: 0,
    console_errors: 0,
    font_families: max(entries.map((e) => e.fonts.count)),
    touch_target_failures: 0,
    reduced_motion_violations: 0,
  };
  for (const es of byRoute.values()) {
    t.axe_critical_serious += max(es.map((e) => e.axe.critical_serious));
    t.console_errors += max(es.map((e) => e.console_errors.length));
    t.touch_target_failures += max(es.filter((e) => e.touch_targets.checked).map((e) => e.touch_targets.failures));
    t.reduced_motion_violations += max(es.map((e) => e.reduced_motion.violations));
  }
  return { ...t, score: score(t) };
}
