#!/usr/bin/env node
// Fixture tests of the DoD template. Not copied into projects.
//
//   heavy-slot -- node templates/dod/tests/run.mjs [--only esm|cjs] [--skip-browser]
//
// Drives the real template code (copied unmodified into two throwaway projects, one with
// "type": "module" and one without) against small static fixture pages served from
// tests/fixtures, then reads the dod.json it wrote. Every check of the experience standard has
// a fixture that makes it fire, and the clean page fires none. The static checks
// (routes.mjs --check) run against small fake apps.
//
// Dependencies are installed from tests/package.json into DOD_TEST_WORKDIR (default:
// <os tmpdir>/dod-template-tests), never into the repo. Chromium only; DOD_WORKERS sets
// Playwright's workers (default 3).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(HERE, "..");
const REPO = path.resolve(TEMPLATE, "..", "..");
const FIXTURES = path.join(HERE, "fixtures");
const WORK = path.resolve(process.env.DOD_TEST_WORKDIR ?? path.join(os.tmpdir(), "dod-template-tests"));
const args = process.argv.slice(2);
const KINDS = args.includes("--only") ? [args[args.indexOf("--only") + 1]] : ["esm", "cjs"];
const SKIP_BROWSER = args.includes("--skip-browser");

if (!path.relative(REPO, WORK).startsWith("..")) {
  console.error(`DOD_TEST_WORKDIR ${WORK} is inside the repo; choose a directory outside it.`);
  process.exit(2);
}

let failed = 0;
const ok = (cond, what) => {
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${what}`);
  return cond;
};

// --- dependencies ----------------------------------------------------------------------
function ensureDeps() {
  fs.mkdirSync(WORK, { recursive: true });
  const want = fs.readFileSync(path.join(HERE, "package.json"), "utf8");
  const pj = path.join(WORK, "package.json");
  const have = fs.existsSync(pj) ? fs.readFileSync(pj, "utf8") : "";
  if (want === have && fs.existsSync(path.join(WORK, "node_modules", "@playwright", "test"))) return;
  fs.writeFileSync(pj, want);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: WORK, stdio: "inherit" });
  if (r.status !== 0) {
    console.error("npm install failed in " + WORK);
    process.exit(2);
  }
}

// --- a throwaway project with the template copied in, unmodified -------------------------
function project(dir, kind, files) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "e2e"), { recursive: true });
  fs.cpSync(path.join(TEMPLATE, "e2e", "dod"), path.join(dir, "e2e", "dod"), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE, "playwright.dod.config.ts"), path.join(dir, "playwright.dod.config.ts"));
  const pkg = { name: `dod-fixture-${kind}`, private: true, ...(kind === "esm" ? { type: "module" } : {}) };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

// --- the fixture server -------------------------------------------------------------------
// Each fixture is a body fragment; the server wraps it in one shell with the help door and
// the screen entry, so a fixture holds only what makes its check fire. The file name stays in
// <title> only: in the body, "forbidden-words" would match the denial wording. Directives:
//   <!-- no-door -->          leave the door out (help-door)
//   <!-- html: attrs -->      extra attributes on <html> (axe-moderate)
function shell(name, body) {
  const door = body.includes("<!-- no-door -->") ? "" : '<a data-help="door" href="#help">עזרה</a>';
  const htmlAttrs = body.match(/<!-- html: (.*?) -->/)?.[1] ?? "";
  return `<!doctype html><html lang="he" dir="rtl" ${htmlAttrs}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title>
<link rel="stylesheet" href="/fixture.css"></head><body>
<header class="top"><span>מערכת בדיקה</span>${door}</header>
<main><div class="head"><h1>דף בדיקה</h1><a data-help="screen" href="#help">מה עושים כאן</a></div>
${body}</main></body></html>`;
}

function startServer() {
  const server = http.createServer((req, res) => {
    req.resume();
    const url = new URL(req.url ?? "/", "http://fixture");
    const html = (name, body) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(shell(name, body));
    };
    if (url.pathname === "/favicon.ico") return res.writeHead(204).end();
    if (url.pathname === "/fixture.css") {
      res.writeHead(200, { "content-type": "text/css" });
      return res.end(fs.readFileSync(path.join(FIXTURES, "fixture.css")));
    }
    if (url.pathname === "/login") {
      // The QA login global-setup performs: a cookie stands in for a real session.
      if (req.method === "POST") return res.writeHead(303, { "set-cookie": "qa=1; Path=/; HttpOnly", location: "/" }).end();
      return html(
        "login",
        '<form method="post" action="/login"><label for="u">אימייל</label><input id="u" name="u" type="email" autocomplete="username">' +
          '<label for="pw">סיסמה</label><input id="pw" name="pw" type="password" autocomplete="current-password"><button type="submit">כניסה</button></form>',
      );
    }
    if (url.pathname === "/") return html("home", "<p>דף הבית של הבדיקה.</p>");
    if (url.pathname === "/audience") {
      // Signed in, the page is wider than the screen; as a visitor it is not. An anonymous
      // entry that came out with an overflow would have been measured with the QA cookie.
      const staff = /(?:^|;\s*)qa=1(?:;|$)/.test(req.headers.cookie ?? "");
      return html("audience", staff ? '<p>מסך הצוות.</p><div style="width: 2000px">רחב</div>' : "<p>מסך המבקר.</p>");
    }
    const file = path.join(FIXTURES, `${url.pathname.slice(1)}.html`);
    if (/^\/[a-z0-9-]+$/.test(url.pathname) && fs.existsSync(file)) return html(url.pathname.slice(1), fs.readFileSync(file, "utf8"));
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  });
  return new Promise((resolve) => server.listen(0, "::", () => resolve(server)));
}

// --- running the template --------------------------------------------------------------------
const BACKEND_VARS = /^(NEXT_PUBLIC_SUPABASE_URL|VITE_SUPABASE_URL|PUBLIC_SUPABASE_URL|SUPABASE_URL|DATABASE_URL|NEXT_PUBLIC_API_URL|VITE_API_URL|DOD_BACKEND_URL|ARGOS_TOKEN|DOD_ROOT|DOD_VERTICAL|CI)$/;
function playwright(cwd, port, extraEnv = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !BACKEND_VARS.test(k)));
  Object.assign(env, {
    PORT: String(port),
    DOD_USER: "qa@example.com",
    DOD_PASSWORD: "fixture",
    DOD_WORKERS: process.env.DOD_WORKERS ?? "3",
    ...extraEnv,
  });
  const cli = path.join(WORK, "node_modules", "@playwright", "test", "cli.js");
  const log = path.join(cwd, "run.log");
  const fd = fs.openSync(log, "w");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "test", "-c", "playwright.dod.config.ts", "--reporter=dot"], {
      cwd,
      env,
      stdio: ["ignore", fd, fd],
    });
    child.on("exit", (code, signal) => {
      fs.closeSync(fd);
      resolve({ code, signal, log: fs.readFileSync(log, "utf8") });
    });
  });
}
// A run that should have passed and did not: say how it ended, with the end of its log.
const ranClean = (run, what) => {
  const good = ok(run.code === 0, `${what} (exit ${run.code}${run.signal ? `, ${run.signal}` : ""})`);
  if (!good) console.log(run.log.split("\n").slice(-30).join("\n"));
  return good;
};
const report = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "dod.json"), "utf8"));
const fired = (route) =>
  Object.entries(route?.standard ?? {})
    .filter(([, c]) => c.count > 0)
    .map(([id]) => id)
    .sort();

// The check each fixture must fire, and nothing else.
const DOM_CHECKS = {
  "help-door": ["help-door"],
  "tooltip-only": ["tooltip-only"],
  "disabled-reason": ["disabled-reason"],
  "placeholder-label": ["placeholder-label"],
  "input-attrs": ["input-attrs"],
  "one-primary": ["one-primary"],
  "nav-count": ["nav-count"],
  "empty-action": ["empty-action"],
  "error-toast": ["error-toast", "error-toast-timer"],
  "error-field": ["error-field"],
  "forbidden-words": ["forbidden-words"],
  "core-unit": ["core-unit"],
  probe: ["probe"],
};
const STANDARD = {
  profile: "work-tool",
  mode: "enforce",
  textFloorPx: 12,
  coreUnit: { route: "/core-unit", selector: ".row", min: 3, viewport: [390, 700] },
  forbiddenWords: ["שגיאה כללית"],
};
const table = [];

async function browserSuite(kind, port) {
  const fixtureRoutes = Object.values(DOM_CHECKS).flat().map((f) => `/${f}`);
  const dir = project(path.join(WORK, kind), kind, {
    "e2e/dod/routes.json": [
      "/clean",
      ...fixtureRoutes,
      "/one-primary-dialog",
      { route: "/audience?as=visitor", audience: "anonymous" },
      "/audience?as=staff",
      "/price-digits",
      "/denied",
      "/axe-moderate",
    ],
    "e2e/dod/standard.json": STANDARD,
  });
  const run = await playwright(dir, port);
  if (!ranClean(run, `${kind}: playwright run exits 0 (log: ${path.join(dir, "run.log")})`)) return;
  const r = report(dir);
  const R = r.routes;
  const clean = fired(R["/clean"]);
  ok(clean.length === 0, `${kind}: no standard check fires on the clean page (${clean.join(",") || "none"})`);
  ok(R["/clean"]?.score === 100, `${kind}: the clean page scores 100 in enforce mode (${R["/clean"]?.score})`);
  for (const [id, fixtures] of Object.entries(DOM_CHECKS)) {
    for (const f of fixtures) {
      const got = fired(R[`/${f}`]);
      const exact = got.length === 1 && got[0] === id;
      ok(exact, `${kind}: ${f}.html fires exactly ${id} (${got.join(",") || "none"})`);
      ok(R[`/${f}`]?.score <= 100 - 10, `${kind}: enforce mode deducts for ${id} on ${f}.html (score ${R[`/${f}`]?.score})`);
      table.push({ kind, id, fixture: `${f}.html`, fired: exact, onClean: clean.includes(id) });
    }
  }
  const dlg = fired(R["/one-primary-dialog"]);
  ok(dlg.length === 0, `${kind}: one-primary counts the open dialog alone (fired: ${dlg.join(",") || "none"})`);
  const probe = R["/probe"]?.entries.find((e) => e.viewport.width === 375 && e.scheme === "light")?.probe ?? {};
  ok(probe["320x700"]?.overflow && !probe["390x844"]?.overflow, `${kind}: probe sees the sideways scroll at 320 only`);
  ok(Object.values(probe).every((p) => p.small_text.count > 0), `${kind}: probe sees text under the floor at every size`);
  ok(Object.values(probe).some((p) => p.broken_words.count > 0), `${kind}: probe sees a word broken across lines`);
  ok(probe["768x1024"]?.touch?.failures > 0 && probe["1024x768"]?.touch === null, `${kind}: probe holds touch targets at phone and tablet sizes only`);
  ok(R["/core-unit"]?.standard?.["core-unit"]?.samples[0]?.includes("2 of 3"), `${kind}: core-unit counts 2 of 3 rows at 390x700`);
  ok(r.standard?.mode === "enforce" && r.standard?.not_built?.probe, `${kind}: dod.json carries the standard's mode and what is not built`);

  // A3 items 5 to 7
  const vis = R["/audience?as=visitor"]?.entries ?? [];
  const staff = R["/audience?as=staff"]?.entries ?? [];
  ok(
    vis.length === 4 && vis.every((e) => e.audience === "anonymous" && !e.overflow.failed && !e.unreachable),
    `${kind}: an anonymous entry is measured without the QA session (visitor page, no overflow)`,
  );
  ok(staff.length === 4 && staff.every((e) => e.audience === "qa" && e.overflow.failed), `${kind}: the same page as qa gets the session (overflow)`);
  const price = R["/price-digits"]?.entries ?? [];
  ok(price.length === 4 && price.every((e) => !e.unreachable && e.reached), `${kind}: a page with 401, 403 and 404 in its prices stays reachable`);
  const denied = R["/denied"]?.entries ?? [];
  ok(denied.length === 4 && denied.every((e) => e.unreachable_reason === "access-denied screen rendered"), `${kind}: denial wording still marks a page unreachable`);
  const axe = R["/axe-moderate"]?.entries ?? [];
  ok(
    axe.length === 4 &&
      axe.every((e) => e.axe.by_impact.moderate > 0 && e.axe.violations.some((v) => v.id === "html-xml-lang-mismatch" && v.impact === "moderate")),
    `${kind}: a moderate axe violation is counted, with its impact kept`,
  );
  ok(R["/axe-moderate"]?.axe_violations > 0 && R["/axe-moderate"]?.score < 100, `${kind}: the moderate violation costs points (score ${R["/axe-moderate"]?.score})`);
  const axeVersion = JSON.parse(fs.readFileSync(path.join(WORK, "node_modules", "axe-core", "package.json"), "utf8")).version;
  ok(r.axe?.core_version === axeVersion, `${kind}: dod.json records axe-core ${r.axe?.core_version} (installed ${axeVersion})`);
  ok(String(r.axe?.tags) === "wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa", `${kind}: axe runs with the five WCAG tags`);
}

async function smallRuns(kind, port) {
  // report mode: findings written, score untouched.
  let dir = project(path.join(WORK, `${kind}-report`), kind, {
    "e2e/dod/routes.json": ["/clean", "/one-primary"],
    "e2e/dod/standard.json": { ...STANDARD, mode: "report" },
  });
  let run = await playwright(dir, port);
  if (ranClean(run, `${kind}: report-mode run exits 0`)) {
    const r = report(dir);
    ok(
      r.routes["/one-primary"]?.standard?.["one-primary"]?.count > 0 && r.routes["/one-primary"]?.score === 100,
      `${kind}: report mode records one-primary and leaves the score at 100`,
    );
    ok(r.totals.standard_findings > 0 && r.totals.standard_failures > 0, `${kind}: report mode sums the findings in totals`);
  }
  // no standard.json: the checks do not run and dod.json says so.
  dir = project(path.join(WORK, `${kind}-plain`), kind, { "e2e/dod/routes.json": ["/clean", "/one-primary"] });
  run = await playwright(dir, port);
  if (ranClean(run, `${kind}: run without standard.json exits 0`)) {
    const r = report(dir);
    ok(r.standard === "not configured", `${kind}: dod.json says standard: "not configured"`);
    ok(Object.values(r.routes).every((x) => x.entries.every((e) => !e.standard && !e.probe)), `${kind}: no entry carries standard or probe results`);
  }
  // Argos is optional: a token without the package stops the run with words.
  dir = project(path.join(WORK, `${kind}-argos`), kind, { "e2e/dod/routes.json": ["/clean"] });
  run = await playwright(dir, port, { ARGOS_TOKEN: "fixture-token" });
  ok(
    run.code !== 0 && run.log.includes("ARGOS_TOKEN is set but @argos-ci/playwright is not installed"),
    `${kind}: ARGOS_TOKEN without @argos-ci/playwright stops the run with a clear message`,
  );
  // A remote backend stops the run, and the message names the host, never the password.
  run = await playwright(dir, port, { DATABASE_URL: "postgres://user:fixture-secret@db.example.com:5432/app" });
  ok(
    run.code !== 0 && run.log.includes("DATABASE_URL (db.example.com:5432)") && !run.log.includes("fixture-secret"),
    `${kind}: a remote DATABASE_URL stops the run and the message carries no password`,
  );
}

// --- routes.mjs --check and the static checks -------------------------------------------
function staticSuite(kind) {
  const base = {
    "app/page.tsx": "",
    "app/orders/page.tsx": "",
    "app/orders/[id]/page.tsx": "",
    "e2e/dod/route-params.json": { id: "1" },
    "public/logo.svg": "<svg/>",
    "PRODUCT.md": "# Product\n\n## Brand\n\nLogo: [`public/logo.svg`](public/logo.svg). Colours: `src/styles/tokens.css`.\n\n## Voice\n\nPlain, `not/a-file.md` here.\n",
    "src/styles/tokens.css": "",
    "src/help/root.md": "",
    "src/help/orders.md": "",
    "src/help/orders-id.md": "",
  };
  const full = [
    { route: "/", audience: "anonymous", static: true },
    "/orders",
    "/orders?state=empty",
    "/orders?state=error",
    "/orders/1",
    "/orders/1?state=empty",
    "/orders/1?state=error",
    "/orders?lang=en",
    "/orders?lang=en&state=empty",
    "/orders?lang=en&state=error",
  ];
  const std = {
    profile: "work-tool",
    mode: "enforce",
    helpDir: "src/help",
    languages: [
      { lang: "he", dir: "rtl" },
      { lang: "en", dir: "ltr", query: "lang=en" },
    ],
  };
  const scenarios = [
    { name: "complete-no-standard", files: { "e2e/dod/routes.json": ["/", "/orders", "/orders/1"] }, exit: 0, out: /standard's checks are skipped/ },
    { name: "stale", files: { "e2e/dod/routes.json": ["/", "/orders", "/orders?state=empty", "/orders/1", "/gone"] }, exit: 1, out: /no longer has:\n {2}\/gone\n/, not: /\/orders\?state=empty/ },
    { name: "standard-clean", files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 0, out: /0 finding\(s\)/ },
    { name: "state-coverage", check: "state-coverage", files: { "e2e/dod/routes.json": full.filter((r) => r !== "/orders/1?state=error"), "e2e/dod/standard.json": std }, exit: 1, out: /state-coverage: \/orders\/1 has no \?state=error/ },
    { name: "state-coverage-report", files: { "e2e/dod/routes.json": full.filter((r) => r !== "/orders/1?state=error"), "e2e/dod/standard.json": { ...std, mode: "report" } }, exit: 0, out: /^(?=[^]*state-coverage: \/orders\/1)(?=[^]*report mode: not failing)/ },
    { name: "help-route", check: "help-route", drop: ["src/help/orders-id.md"], files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 1, out: /help-route: \/orders\/1 has no help file src\/help\/orders-id/ },
    { name: "brand-assets", check: "brand-assets", files: { "PRODUCT.md": "# Product\n\n## Brand\n\nLogo: `public/missing.svg`.\n", "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 1, out: /brand-assets: .*public\/missing\.svg/ },
    { name: "both-directions", check: "both-directions", files: { "e2e/dod/routes.json": full.filter((r) => !String(r).includes("lang=en")), "e2e/dod/standard.json": std }, exit: 1, out: /both-directions: no route .* en/ },
  ];
  let cleanOut = "";
  for (const s of scenarios) {
    const dir = project(path.join(WORK, `${kind}-static`, s.name), kind, { ...base, ...s.files });
    for (const d of s.drop ?? []) fs.rmSync(path.join(dir, d));
    const r = spawnSync(process.execPath, ["e2e/dod/routes.mjs", "--check"], { cwd: dir, encoding: "utf8" });
    const out = r.stdout + r.stderr;
    if (s.name === "standard-clean") cleanOut = out;
    const fine = ok(r.status === s.exit && s.out.test(out) && !(s.not && s.not.test(out)), `${kind}: routes.mjs --check ${s.name}: exit ${r.status} (want ${s.exit})`);
    if (!fine) console.log(out.replace(/^/gm, "      "));
    if (s.check) {
      const others = (out.match(/dod-standard: ([a-z-]+):/g) ?? []).map((m) => m.slice(14, -1)).filter((c) => c !== s.check);
      table.push({ kind, id: s.check, fixture: `static/${s.name}`, fired: fine && others.length === 0, onClean: null });
    }
  }
  for (const row of table.filter((t) => t.kind === kind && t.onClean === null)) row.onClean = cleanOut.includes(`dod-standard: ${row.id}:`);
}

// --- tsc -------------------------------------------------------------------------------------
function typecheck() {
  const dir = project(path.join(WORK, "tsc"), "esm", {
    "tsconfig.json": {
      compilerOptions: {
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ["es2023", "dom", "dom.iterable"],
        types: ["node"],
      },
      include: ["playwright.dod.config.ts", "e2e/dod/**/*.ts"],
    },
  });
  const r = spawnSync(process.execPath, [path.join(WORK, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" });
  if (!ok(r.status === 0, "tsc --noEmit (strict) on the template's .ts files")) console.log(r.stdout + r.stderr);
}

// --- main ----------------------------------------------------------------------------------------
ensureDeps();
typecheck();
for (const kind of KINDS) staticSuite(kind);
if (!SKIP_BROWSER) {
  const server = await startServer();
  const port = server.address().port;
  try {
    for (const kind of KINDS) {
      await browserSuite(kind, port);
      await smallRuns(kind, port);
    }
  } finally {
    server.close();
  }
}

console.log("\n| run | check id | fixture | fired | fired on the clean page |\n|---|---|---|---|---|");
for (const t of table) console.log(`| ${t.kind} | ${t.id} | ${t.fixture} | ${t.fired ? "yes" : "NO"} | ${t.onClean ? "YES" : "no"} |`);
console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
