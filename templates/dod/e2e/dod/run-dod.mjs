#!/usr/bin/env node
// `pnpm dod`: the DoD in two Playwright runs of playwright.dod.config.ts, one after the other.
//
//   1. The scored phase (dod.spec.ts): every entry of every route, the same code and the same
//      timeouts with or without standard.json. Its global-teardown writes reports/dod/dod.json.
//   2. With e2e/dod/standard.json, the checks phase (every other spec of e2e/dod: the experience
//      standard's checks, standard.spec.ts), started only after run 1 has exited. Its
//      global-teardown writes dod.json again, with the checks merged in.
//
// The exit code is run 1's, always: nothing in run 2 (a hang, a crash, a red test) can change it,
// and in report mode nothing in run 2 changes a scored number either. In enforce mode the checks'
// deductions reach the score in the aggregation, which the CI score step reads. Run 2 has one
// deadline, `checksMinutes` in standard.json (default 60): then it is interrupted (its teardown
// still writes dod.json, saying which entries were not checked) and, a minute later, killed.
//
// Arguments go to both runs: `pnpm dod -- --grep "<slug>__"` measures and checks one route.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(process.env.DOD_ROOT ?? process.cwd());
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const cli = createRequire(path.join(ROOT, "package.json")).resolve("@playwright/test/cli");
const RESULTS = path.join(ROOT, "reports", "dod", process.env.DOD_VERTICAL ?? "", "results");
const stdFile = path.join(ROOT, "e2e", "dod", "standard.json");
let standard = null;
try {
  standard = fs.existsSync(stdFile) ? JSON.parse(fs.readFileSync(stdFile, "utf8")) : null;
} catch {
  // A broken standard.json is reported by the runs themselves (it fails to load there).
}

// A json reporter's file, if one was asked for, gets its own name per phase.
const jsonOut = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
const run = (phase, env, deadlineMs) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "test", "-c", "playwright.dod.config.ts", ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        ...env,
        DOD_PHASE: phase,
        ...(jsonOut && phase === "checks" ? { PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut.replace(/(\.json)?$/, ".checks.json") } : {}),
      },
    });
    let timer;
    if (deadlineMs)
      timer = setTimeout(() => {
        fs.mkdirSync(RESULTS, { recursive: true });
        fs.writeFileSync(path.join(RESULTS, "checks-deadline.json"), JSON.stringify({ at: new Date().toISOString(), minutes: deadlineMs / 60_000 }));
        console.log(`[dod] the checks phase reached its deadline (${deadlineMs / 60_000} min): stopping it.`);
        child.kill("SIGINT");
        setTimeout(() => child.kill("SIGKILL"), 60_000).unref();
      }, deadlineMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve(code ?? (signal ? 1 : 0));
    });
  });

const scored = await run("scored", standard ? { DOD_CHECKS_NEXT: "1" } : {});
if (standard) {
  const minutes = typeof standard.checksMinutes === "number" && standard.checksMinutes > 0 ? standard.checksMinutes : 60;
  const checks = await run("checks", {}, minutes * 60_000);
  if (checks !== 0) console.log(`[dod] the checks phase exited ${checks}; the run's exit code is the scored phase's (${scored}).`);
}
process.exit(scored);
