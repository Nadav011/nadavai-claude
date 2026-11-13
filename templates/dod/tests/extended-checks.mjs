#!/usr/bin/env node
// Fixture tests of the extended checks (e2e/dod/a11y-extended.ts and consent-checks.ts, run by
// extended-checks.spec.ts). Not copied into projects; kept apart from run.mjs so the two can
// change without touching each other.
//
//   heavy-slot -- node templates/dod/tests/extended-checks.mjs [--skip-browser] [--skip-run]
//
// 1. tsc --noEmit (strict) on the new files with the kit's own settings.
// 2. Each check against its fixture (tests/fixtures/extended/<check>.html), which must make it
//    find exactly the kinds listed below, and against clean.html, which must pass them all.
// 3. Each condition of the checks is one line marked `// M:<code>`; a copy of its module without
//    that line must make a fixture test fail, so no condition is untested.
// 4. The checks phase of a real `run-dod.mjs` run on two of the pages (the spec writes its files).
// Dependencies come from tests/package.json in DOD_TEST_WORKDIR (default <tmpdir>/dod-template-tests),
// never the repo. One Chromium at a time; the fixture server listens on 127.0.0.1, port
// DOD_A11Y_PORT (default 8761).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(HERE, "..");
const REPO = path.resolve(HERE, "..", "..", "..");
const FIXTURES = path.join(HERE, "fixtures", "extended");
const MODULES = { a11y: path.join(TEMPLATE, "e2e", "dod", "a11y-extended.ts"), consent: path.join(TEMPLATE, "e2e", "dod", "consent-checks.ts") };
const WORK = path.resolve(process.env.DOD_TEST_WORKDIR ?? path.join(os.tmpdir(), "dod-template-tests"));
const PORT = Number(process.env.DOD_A11Y_PORT ?? 8761);
const args = process.argv.slice(2);

if (!path.relative(REPO, WORK).startsWith("..")) {
  console.error(`DOD_TEST_WORKDIR ${WORK} is inside the repo; choose a directory outside it.`);
  process.exit(2);
}
if (PORT >= 32768) {
  console.error("DOD_A11Y_PORT must be below 32768.");
  process.exit(2);
}

let failed = 0;
const ok = (cond, what, detail = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${what}${!cond && detail ? `\n       ${detail}` : ""}`);
  return cond;
};

// --- dependencies (the same install as run.mjs) ------------------------------------------
function ensureDeps() {
  fs.mkdirSync(WORK, { recursive: true });
  const want = fs.readFileSync(path.join(HERE, "package.json"), "utf8");
  const pj = path.join(WORK, "package.json");
  const have = fs.existsSync(pj) ? fs.readFileSync(pj, "utf8") : "";
  if (want === have && fs.existsSync(path.join(WORK, "node_modules", "@playwright", "test"))) return;
  fs.writeFileSync(pj, want);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: WORK, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`npm install failed in ${WORK}`);
    process.exit(2);
  }
}

// --- what each fixture must make its check find ------------------------------------------
const EXPECT = {
  "forced-colors": { boundary: 1, focus: 1, state: 1, mark: 1 },
  "text-reflow": { clipped: 1, unreachable: 1, sideways: 1 },
  "text-spacing": { clipped: 1, overlap: 1 },
  consent: { prechecked: 1, "no-refuse": 1, "weak-refuse": 1 },
};
// Each marked condition: the check it belongs to, and the page whose result must change without it.
const MUTANTS = {
  boundary: ["forced-colors", "forced-colors"],
  state: ["forced-colors", "forced-colors"],
  mark: ["forced-colors", "forced-colors"],
  focus: ["forced-colors", "forced-colors"],
  sideways: ["text-reflow", "text-reflow"],
  clipped: ["text-reflow", "text-reflow"],
  unreachable: ["text-reflow", "text-reflow"],
  overlap: ["text-spacing", "text-spacing"],
  // Without "only what the overrides made new", clean.html's badge (over its label on purpose,
  // before any override) would be reported.
  "spacing-new": ["text-spacing", "clean"],
  prechecked: ["consent", "consent"],
  "no-refuse": ["consent", "consent"],
  "weak-refuse": ["consent", "consent"],
  // Without the exemption, clean.html's locked "necessary cookies" box would count as pre-ticked.
  necessary: ["consent", "clean"],
};
// Which module and function each check is; consent runs both consent checks and sums them.
const RUN = {
  "forced-colors": ["a11y", (m, p) => m.forcedColorsCheck(p)],
  "text-reflow": ["a11y", (m, p) => m.textReflowCheck(p)],
  "text-spacing": ["a11y", (m, p) => m.textSpacingCheck(p)],
  consent: [
    "consent",
    async (m, p) => {
      const r = Object.values(await m.consentChecks(p));
      return { count: r.reduce((n, x) => n + x.count, 0), kinds: Object.assign({}, ...r.map((x) => x.kinds)), samples: r.flatMap((x) => x.samples) };
    },
  ],
};
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

function serve() {
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, "http://x").pathname.replace(/\/$/, "/clean")) || "clean";
    const file = path.join(FIXTURES, `${name}.html`);
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return res.end("<!doctype html><html lang=\"he\" dir=\"rtl\"><body><main><h1>הדף לא נמצא</h1></main></body></html>");
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function typecheck() {
  const dir = path.join(WORK, "a11y-tsc");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "e2e"), { recursive: true });
  fs.cpSync(path.join(TEMPLATE, "e2e", "dod"), path.join(dir, "e2e", "dod"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "a11y-tsc", private: true, type: "module" }));
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true, skipLibCheck: true, lib: ["es2023", "dom", "dom.iterable"], types: ["node"] },
      include: ["e2e/dod/a11y-extended.ts", "e2e/dod/consent-checks.ts", "e2e/dod/extended-checks.spec.ts"],
    }),
  );
  const r = spawnSync(process.execPath, [path.join(WORK, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" });
  ok(r.status === 0, "tsc --noEmit (strict) on a11y-extended.ts, consent-checks.ts and extended-checks.spec.ts", (r.stdout + r.stderr).slice(0, 1500));
}

/** A copy of the module without the line marked M:<code>, in WORK (outside the repo). */
function mutant(module, code) {
  const src = fs.readFileSync(MODULES[module], "utf8").split("\n");
  const keep = src.filter((l) => !l.trimEnd().endsWith(`// M:${code}`));
  if (src.length - keep.length !== 1) throw new Error(`${path.basename(MODULES[module])} has ${src.length - keep.length} lines marked M:${code}, not one`);
  const dir = fs.mkdtempSync(path.join(WORK, `extended-mutant-${code}-`));
  fs.writeFileSync(path.join(dir, "package.json"), '{ "type": "module" }');
  const file = path.join(dir, path.basename(MODULES[module]));
  fs.writeFileSync(file, keep.join("\n"));
  return file;
}

async function browserTests() {
  const { chromium } = await import(pathToFileURL(path.join(WORK, "node_modules", "@playwright", "test", "index.mjs")).href);
  const real = { a11y: await import(pathToFileURL(MODULES.a11y).href), consent: await import(pathToFileURL(MODULES.consent).href) };
  const server = await serve();
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-dev-shm-usage"] });
  const check = async (mods, id, page) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "he-IL" });
    const p = await ctx.newPage();
    try {
      await p.goto(`http://127.0.0.1:${PORT}/${page}`);
      const [m, fn] = RUN[id];
      return await fn(mods[m], p);
    } finally {
      await ctx.close();
    }
  };
  try {
    for (const id of Object.keys(EXPECT)) {
      const r = await check(real, id, id);
      ok(same(r.kinds, EXPECT[id]) && r.count === Object.values(EXPECT[id]).reduce((a, b) => a + b, 0), `${id}: its fixture finds ${JSON.stringify(EXPECT[id])}`, JSON.stringify(r));
      console.log(`       ${id} on ${id}.html: ${JSON.stringify(r)}`);
    }
    for (const id of Object.keys(EXPECT)) {
      const r = await check(real, id, "clean");
      ok(r.count === 0, `${id}: clean.html passes`, JSON.stringify(r));
      console.log(`       ${id} on clean.html: ${JSON.stringify(r)}`);
    }
    for (const [code, [id, page]] of Object.entries(MUTANTS)) {
      const m = RUN[id][0];
      const mod = await import(pathToFileURL(mutant(m, code)).href);
      const r = await check({ ...real, [m]: mod }, id, page);
      const passes = page === "clean" ? r.count === 0 : same(r.kinds, EXPECT[id]);
      ok(!passes, `${id}: without the line M:${code} the ${page}.html test fails`, `the mutant still gives ${JSON.stringify(r.kinds)}`);
      console.log(`       mutant M:${code} on ${page}.html: ${JSON.stringify(r.kinds)}`);
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

/** The checks phase of a real run: run-dod.mjs on a throwaway project with two anonymous routes. */
async function phaseTest() {
  const dir = path.join(WORK, "extended-run");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "e2e"), { recursive: true });
  fs.cpSync(path.join(TEMPLATE, "e2e", "dod"), path.join(dir, "e2e", "dod"), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE, "playwright.dod.config.ts"), path.join(dir, "playwright.dod.config.ts"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "extended-run", private: true, type: "module" }));
  const route = (r) => ({ route: r, audience: "anonymous", static: true, noHelp: "a fixture page" });
  fs.writeFileSync(path.join(dir, "e2e", "dod", "routes.json"), JSON.stringify([route("/clean"), route("/forced-colors"), route("/consent")], null, 2));
  fs.writeFileSync(path.join(dir, "e2e", "dod", "standard.json"), JSON.stringify({ profile: "work-tool" }));
  const server = await serve();
  try {
    const env = { ...process.env, PORT: String(PORT), DOD_WORKERS: "1", DOD_USER: "", DOD_PASSWORD: "" };
    delete env.CI;
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(dir, "e2e", "dod", "run-dod.mjs"), "--reporter=line"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
      let log = "";
      child.stdout.on("data", (d) => (log += d));
      child.stderr.on("data", (d) => (log += d));
      child.on("exit", (c) => {
        fs.writeFileSync(path.join(dir, "run.log"), log);
        resolve(c);
      });
    });
    const out = path.join(dir, "reports", "dod", "results", "extended");
    const read = (slug) => (fs.existsSync(path.join(out, `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join(out, `${slug}.json`), "utf8")) : null);
    const clean = read("clean");
    const forced = read("forced-colors");
    const consent = read("consent");
    const log = fs.readFileSync(path.join(dir, "run.log"), "utf8");
    console.log(log.split("\n").filter((l) => l.includes("[dod] extended")).map((l) => `       ${l.trim()}`).join("\n"));
    ok(code === 0, "run-dod.mjs exits 0 (the scored phase's code; these checks only report)", `exit ${code}; log in ${dir}/run.log`);
    const IDS = ["forced-colors", "text-reflow", "text-spacing", "consent-prechecked", "consent-refuse"];
    ok(clean && IDS.every((id) => clean.checks[id] && !clean.checks[id].error && clean.checks[id].count === 0), "the checks phase writes results/extended/clean.json: all five clean", JSON.stringify(clean));
    ok(forced && forced.checks["forced-colors"].count === 4 && !forced.checks["forced-colors"].error, "and forced-colors.json with its four forced-colours findings", JSON.stringify(forced && forced.checks["forced-colors"]));
    ok(consent && consent.checks["consent-prechecked"].count === 1 && consent.checks["consent-refuse"].count === 2, "and consent.json with one pre-ticked box and two refuse findings", JSON.stringify(consent && [consent.checks["consent-prechecked"], consent.checks["consent-refuse"]]));
    const dod = JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "dod.json"), "utf8"));
    // No key of dod.json is one of these check ids (a route named /forced-colors is a route, "/forced-colors").
    const keys = new Set();
    const walk = (o) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (keys.add(k), walk(v));
    };
    walk(dod);
    const leaked = [...IDS, "extended"].filter((id) => keys.has(id));
    ok(!leaked.length && dod.totals && typeof dod.totals.score === "number", `dod.json carries nothing of these checks (report only, outside the score); score ${dod.totals && dod.totals.score}`, `keys: ${leaked.join(", ")}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

ensureDeps();
typecheck();
if (!args.includes("--skip-browser")) {
  await browserTests();
  if (!args.includes("--skip-run")) await phaseTest();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
