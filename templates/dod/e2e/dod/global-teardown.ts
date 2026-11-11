import fs from "node:fs";
import path from "node:path";
import {
  aggregate,
  CHECKS_DEADLINE_FILE,
  checksStoppedWhy,
  loadScoring,
  notFinished,
  PHASE,
  plannedChecks,
  standardFile,
  AXE_TAGS,
  excludedRoutes,
  loadParams,
  loadRoutes,
  loadStandard,
  REPORTS_DIR,
  RESULTS_DIR,
  routeStandard,
  SCHEMES,
  STANDARD_NOT_BUILT,
  STANDARD_PENALTY,
  standardEnforced,
  STORAGE_STATE,
  VIEWPORTS,
  type EntryResult,
} from "./dod-shared";

export default async function globalTeardown() {
  // First, before anything that can throw (a bad standard.json, a missing routes.json): the QA
  // session is needed only while the run lasts, and global-setup signs in again on every run.
  // DOD_KEEP_STORAGE_STATE=1 keeps it for a tool that needs the session afterwards.
  if (process.env.DOD_KEEP_STORAGE_STATE !== "1") fs.rmSync(STORAGE_STATE, { force: true });
  const routes = loadRoutes();
  const excluded = excludedRoutes(loadParams());
  const standard = loadStandard();
  const enforce = standardEnforced(standard);
  const scoring = loadScoring();
  // Configuration the run could not act on: said in dod.json and on the console, never silent.
  const configErrors: string[] = [];
  if (standard?.coreUnit && !routes.some((r) => r.route === standard.coreUnit!.route))
    configErrors.push(`coreUnit.route ${standard.coreUnit.route} is not in routes.json, so core-unit never ran`);
  const legacy = routes.filter((r) => r.legacyStatic).map((r) => r.route);
  if (standard && legacy.length)
    configErrors.push(
      `deprecated: "static": true without "noHelp" also exempts the help door (${legacy.slice(0, 5).join(", ")}${legacy.length > 5 ? ", …" : ""}); add "noHelp": "<reason>" or "noHelp": false`,
    );
  // The scored phase's files only: an entry's checks live in <name>.standard.json, written by the
  // checks phase, and are merged below field by field, never over a scored field.
  const entries: EntryResult[] = fs.existsSync(RESULTS_DIR)
    ? fs
        .readdirSync(RESULTS_DIR)
        .filter((f) => f.endsWith(".json") && !f.endsWith(".standard.json") && path.join(RESULTS_DIR, f) !== CHECKS_DEADLINE_FILE)
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8")) as EntryResult)
    : [];
  // The checks phase's results, per entry. An entry it left nothing for (the phase has not run,
  // reached its deadline, or its test ended first) has every planned check errored: never a pass
  // where enforced, nothing at all in report mode.
  const notChecked: Record<string, number> = {};
  if (standard)
    for (const e of entries) {
      if (!e.reached || e.unreachable) continue;
      const name = `${e.slug}__${e.viewport.width}__${e.scheme}`;
      const file = standardFile(name);
      if (fs.existsSync(file)) {
        const part = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<EntryResult>;
        e.standard = part.standard;
        if (part.probe) e.probe = part.probe;
        if (part.standard_error) e.standard_error = part.standard_error;
        if (part.standard_retried) e.standard_retried = part.standard_retried;
        if (part.standard_skipped) e.standard_skipped = part.standard_skipped;
        // Judged nothing (not the scored page, or no session): "not checked", with its reason.
        if (part.standard_unchecked) {
          e.standard_unchecked = part.standard_unchecked;
          notChecked[part.standard_unchecked] = (notChecked[part.standard_unchecked] ?? 0) + 1;
        }
        continue;
      }
      const why =
        PHASE === "scored"
          ? "not checked: the checks phase has not run (pnpm dod runs it after the scored phase)"
          : fs.existsSync(CHECKS_DEADLINE_FILE)
            ? `not checked: the checks phase ${checksStoppedWhy(standard.checksMinutes)}`
            : "not checked: its checks test left no result (it failed or was cut short)";
      e.standard = notFinished(plannedChecks(standard, e.route, e.viewport, e.scheme), why);
      e.standard_unchecked = why;
      notChecked[why] = (notChecked[why] ?? 0) + 1;
    }

  // A route is measured in every viewport × scheme, or it is not measured.
  //
  // `aggregate([])` returns 100: every counter is 0, `unreachable` is 0, so
  // `score()` sees a flawless route. That is the exact number the CI workflow
  // reads, so a route whose test timed out — its result file is written as the
  // LAST action of the test — passed the gate in silence, and the job printed
  // "All routes at 100". The only thing keeping CI honest was the non-zero exit
  // code of a PREVIOUS step; the gate itself verified nothing about coverage.
  // Any partial run (`--grep`, `--shard`, `--last-failed`, a `.skip`) produced a
  // report claiming 100 on pages that were never opened.
  const EXPECTED_ENTRIES = VIEWPORTS.length * SCHEMES.length;
  const perRoute: Record<
    string,
    ReturnType<typeof aggregate> & {
      standard?: ReturnType<typeof routeStandard>;
      entries: EntryResult[];
      not_measured?: string;
    }
  > = {};
  const notMeasured: string[] = [];
  for (const { route } of routes) {
    const es = entries.filter((e) => e.route === route);
    if (es.length < EXPECTED_ENTRIES) {
      notMeasured.push(`${route} (${es.length}/${EXPECTED_ENTRIES})`);
      perRoute[route] = {
        ...aggregate(es, enforce),
        score: 0,
        ...(standard ? { standard: routeStandard(es, enforce) } : {}),
        entries: es,
        not_measured: `${es.length} of ${EXPECTED_ENTRIES} entries produced a result`,
      };
      continue;
    }
    perRoute[route] = { ...aggregate(es, enforce), ...(standard ? { standard: routeStandard(es, enforce) } : {}), entries: es };
  }

  // The standard's checks, summed: per check id, how many routes have findings and how many.
  const standardSummary = standard
    ? (() => {
        // Per check id: routes with findings, findings, routes where it failed to run, and routes
        // where it did not apply (skipped, with its reason on the route).
        const checks: Record<string, { routes: number; findings: number; errors: number; skipped: number }> = {};
        const errors: string[] = [];
        for (const [route, r] of Object.entries(perRoute)) {
          for (const [id, c] of Object.entries(r.standard ?? {})) {
            const cur = (checks[id] ??= { routes: 0, findings: 0, errors: 0, skipped: 0 });
            cur.findings += c.count;
            if (c.count) cur.routes++;
            if (c.skipped) cur.skipped++;
            if (c.error) {
              cur.errors++;
              errors.push(`${route} ${id}: ${c.error}`);
            }
          }
          for (const e of r.entries) if (e.standard_error) errors.push(`${route} (${e.viewport.width}/${e.scheme}): ${e.standard_error}`);
        }
        return {
          mode: standard.mode,
          profile: standard.profile,
          text_floor_px: standard.textFloorPx,
          penalty:
            standard.mode === "enforce"
              ? `-${STANDARD_PENALTY} per check id with findings or an error on a route`
              : standard.enforce?.length
                ? `-${STANDARD_PENALTY} per enforced check id (${standard.enforce.join(", ")}) with findings or an error on a route; none for the rest`
                : "none (report mode)",
          enforced: standard.mode === "enforce" ? "all" : (standard.enforce ?? []),
          checks,
          errors,
          config_errors: configErrors,
          // The run stopped the standard's checks after `maxTimeouts` entries ran out of time:
          // how many entries were not checked (each one "errored" for an enforced check).
          skipped_after_timeouts: entries.some((e) => e.standard_skipped)
            ? { max_timeouts: standard.maxTimeouts, entries_not_checked: entries.filter((e) => e.standard_skipped).length }
            : null,
          // Entries the checks phase left no result for, by reason (each "errored" where enforced).
          not_checked: Object.keys(notChecked).length
            ? { entries: Object.values(notChecked).reduce((a, b) => a + b, 0), reasons: notChecked }
            : null,
          not_built: STANDARD_NOT_BUILT,
        };
      })()
    : "not configured";

  const report = {
    generated_at: new Date().toISOString(),
    base_url: `http://localhost:${process.env.PORT ?? "3000"}`,
    scoring:
      `100 -15/overflow(entry) -5/axe violation node (critical, serious${
        scoring.axe.minorModerate === "enforce" ? ", moderate, minor" : "; moderate and minor recorded only"
      }) -5/console error` +
      " -10 if fonts>2 -2/touch-target (cap 20) -10/reduced-motion violation" +
      (standard && (standard.mode === "enforce" || standard.enforce?.length)
        ? ` -${STANDARD_PENALTY}/enforced standard check id with findings or an error (route)`
        : "") +
      "; per-page findings counted once per route (max across viewport×scheme)",
    axe: {
      // The engine that judged this run: a new axe-core adds rules, so a score that moved
      // with no code change is read against this first.
      core_version: entries.find((e) => e.axe.version)?.axe.version ?? null,
      tags: AXE_TAGS,
      minor_moderate: scoring.axe.minorModerate,
    },
    standard: standardSummary,
    totals: { ...aggregate(entries, enforce), score: notMeasured.length ? 0 : aggregate(entries, enforce).score },
    not_measured: notMeasured,
    excluded,
    routes: perRoute,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, "dod.json"), JSON.stringify(report, null, 2));

  const unpainted = entries.filter((e) => !e.unreachable && !e.reached);
  if (unpainted.length) {
    console.log(
      `\n[dod] ${unpainted.length} entr(ies) answered 200 on the right path and never painted their own content:`,
    );
    for (const e of unpainted.slice(0, 20))
      console.log(`[dod]   ${e.route} (${e.viewport.width}/${e.scheme}) -> ${e.not_reached_reason}`);
    console.log("[dod] A page that renders nothing has nothing to violate. The score stays 0.");
  }

  const blocked = entries.filter((e) => e.unreachable);
  if (blocked.length) {
    console.log(`\n[dod] ${blocked.length} entr(ies) the QA account could not open. Every page must be reachable:`);
    for (const e of blocked.slice(0, 20)) console.log(`[dod]   ${e.route} -> ${e.unreachable_reason}`);
    console.log("[dod] Fix the QA account's access (or the seeded data) and run again; the score stays 0 until then.");
  }

  if (notMeasured.length) {
    console.log(
      `\n[dod] ${notMeasured.length} route(s) produced fewer results than entries — they were NOT measured:`,
    );
    for (const r of notMeasured.slice(0, 20)) console.log(`[dod]   ${r}`);
    console.log("[dod] A route with no result is not a route that passed. Each scores 0.");
  }

  const excludedKeys = Object.keys(excluded);
  if (excludedKeys.length) {
    console.log(`\n[dod] ${excludedKeys.length} route(s) deliberately outside the score:`);
    for (const k of excludedKeys) console.log(`[dod]   ${k} — ${excluded[k]}`);
  }

  if (typeof standardSummary === "object" && (standardSummary.errors.length || standardSummary.config_errors.length)) {
    console.log(
      `\n[dod] the experience standard's checks could not all run (recorded in dod.json; an enforced check that errored is "errored" and costs its points, a check in report mode costs nothing):`,
    );
    for (const e of [...standardSummary.config_errors, ...standardSummary.errors].slice(0, 20)) console.log(`[dod]   ${e}`);
  }

  if (typeof standardSummary === "object" && standardSummary.not_checked) {
    if (PHASE === "scored" && process.env.DOD_CHECKS_NEXT === "1")
      console.log(`\n[dod] scored phase done; the experience standard's checks run next (${standardSummary.not_checked.entries} entries).`);
    else {
      console.log(`\n[dod] ${standardSummary.not_checked.entries} entr(ies) have no result from the standard's checks (errored where enforced):`);
      for (const [why, n] of Object.entries(standardSummary.not_checked.reasons)) console.log(`[dod]   ${n} × ${why}`);
    }
  }
  if (typeof standardSummary === "object" && standardSummary.skipped_after_timeouts)
    console.log(
      `\n[dod] the standard's checks stopped after ${standardSummary.skipped_after_timeouts.max_timeouts} entries ran out of time: ` +
        `${standardSummary.skipped_after_timeouts.entries_not_checked} entr(ies) not checked (errored where enforced). A loaded machine or a page that blocks on resize; see standard.errors.`,
    );

  const t = report.totals;
  console.log(
    `\n[dod] score=${t.score} unreachable=${t.unreachable} unreached=${t.unreached} overflow=${t.overflow_failures} axe=${t.axe_violations} (recorded ${t.axe_recorded}) console=${t.console_errors} fonts=${t.font_families} touch=${t.touch_target_failures} reduced-motion=${t.reduced_motion_violations}` +
      (standard
        ? ` standard(${standard.mode})=${t.standard_failures} check(s), ${t.standard_findings} finding(s), ${t.standard_errored} errored, ${t.standard_scored} scored`
        : ""),
  );
  for (const [route, r] of Object.entries(perRoute)) {
    console.log(`[dod]   ${route.padEnd(34)} score=${r.score}`);
  }
  console.log(`[dod] report: ${path.join(REPORTS_DIR, "dod.json")}`);
}
