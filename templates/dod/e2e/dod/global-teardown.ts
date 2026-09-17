import fs from "node:fs";
import path from "node:path";
import {
  aggregate,
  REPORTS_DIR,
  RESULTS_DIR,
  SCHEMES,
  VIEWPORTS,
  type EntryResult,
} from "./dod-shared";
import params from "./route-params.json";
import routes from "./routes.json";

export default async function globalTeardown() {
  const entries: EntryResult[] = fs.existsSync(RESULTS_DIR)
    ? fs
        .readdirSync(RESULTS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8")) as EntryResult)
    : [];

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
    ReturnType<typeof aggregate> & { entries: EntryResult[]; not_measured?: string }
  > = {};
  const notMeasured: string[] = [];
  for (const route of routes as string[]) {
    const es = entries.filter((e) => e.route === route);
    if (es.length < EXPECTED_ENTRIES) {
      notMeasured.push(`${route} (${es.length}/${EXPECTED_ENTRIES})`);
      perRoute[route] = {
        ...aggregate(es),
        score: 0,
        entries: es,
        not_measured: `${es.length} of ${EXPECTED_ENTRIES} entries produced a result`,
      };
      continue;
    }
    perRoute[route] = { ...aggregate(es), entries: es };
  }

  const report = {
    generated_at: new Date().toISOString(),
    base_url: `http://localhost:${process.env.PORT ?? "3000"}`,
    scoring:
      "100 -15/overflow(entry) -5/axe serious+critical -5/console error -10 if fonts>2 -2/touch-target (cap 20) -10/reduced-motion violation; per-page findings counted once per route (max across viewport×scheme)",
    totals: { ...aggregate(entries), score: notMeasured.length ? 0 : aggregate(entries).score },
    not_measured: notMeasured,
    excluded: params._exclude ?? {},
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

  const excludedKeys = Object.keys(params._exclude ?? {});
  if (excludedKeys.length) {
    console.log(`\n[dod] ${excludedKeys.length} route(s) deliberately outside the score:`);
    for (const k of excludedKeys)
      console.log(`[dod]   ${k} — ${(params._exclude as Record<string, string>)[k]}`);
  }

  const t = report.totals;
  console.log(
    `\n[dod] score=${t.score} unreachable=${t.unreachable} unreached=${t.unreached} overflow=${t.overflow_failures} axe=${t.axe_critical_serious} console=${t.console_errors} fonts=${t.font_families} touch=${t.touch_target_failures} reduced-motion=${t.reduced_motion_violations}`,
  );
  for (const [route, r] of Object.entries(perRoute)) {
    console.log(`[dod]   ${route.padEnd(34)} score=${r.score}`);
  }
  console.log(`[dod] report: ${path.join(REPORTS_DIR, "dod.json")}`);
}
