import fs from "node:fs";
import path from "node:path";
import { aggregate, REPORTS_DIR, RESULTS_DIR, type EntryResult } from "./dod-shared";
import routes from "./routes.json";

export default async function globalTeardown() {
  const entries: EntryResult[] = fs.existsSync(RESULTS_DIR)
    ? fs
        .readdirSync(RESULTS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8")) as EntryResult)
    : [];

  const perRoute: Record<string, ReturnType<typeof aggregate> & { entries: EntryResult[] }> = {};
  for (const route of routes as string[]) {
    const es = entries.filter((e) => e.route === route);
    perRoute[route] = { ...aggregate(es), entries: es };
  }

  const report = {
    generated_at: new Date().toISOString(),
    base_url: `http://localhost:${process.env.PORT ?? "3000"}`,
    scoring:
      "100 -15/overflow(entry) -5/axe serious+critical -5/console error -10 if fonts>2 -2/touch-target (cap 20) -10/reduced-motion violation; per-page findings counted once per route (max across viewport×scheme)",
    totals: aggregate(entries),
    routes: perRoute,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, "dod.json"), JSON.stringify(report, null, 2));

  const blocked = entries.filter((e) => e.unreachable);
  if (blocked.length) {
    console.log(`\n[dod] ${blocked.length} entr(ies) the QA account could not open. Every page must be reachable:`);
    for (const e of blocked.slice(0, 20)) console.log(`[dod]   ${e.route} -> ${e.unreachable_reason}`);
    console.log("[dod] Fix the QA account's access (or the seeded data) and run again; the score stays 0 until then.");
  }

  const t = report.totals;
  console.log(
    `\n[dod] score=${t.score} unreachable=${t.unreachable} overflow=${t.overflow_failures} axe=${t.axe_critical_serious} console=${t.console_errors} fonts=${t.font_families} touch=${t.touch_target_failures} reduced-motion=${t.reduced_motion_violations}`,
  );
  for (const [route, r] of Object.entries(perRoute)) {
    console.log(`[dod]   ${route.padEnd(34)} score=${r.score}`);
  }
  console.log(`[dod] report: ${path.join(REPORTS_DIR, "dod.json")}`);
}
