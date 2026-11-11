#!/usr/bin/env node
// Fixture tests of the DoD template. Not copied into projects.
//
//   heavy-slot -- node templates/dod/tests/run.mjs [--only esm|cjs] [--skip-browser]
//                  [--suite static,dom,browser,small] [--dom-src <standard-dom.ts>] [--template <dir>]
// --template runs another copy of templates/dod (an older commit exported with git archive), to
// show which tests fail on it.
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
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv0 = process.argv.slice(2);
const TEMPLATE = argv0.includes("--template") ? path.resolve(argv0[argv0.indexOf("--template") + 1]) : path.resolve(HERE, "..");
const REPO = path.resolve(HERE, "..", "..", "..");
const FIXTURES = path.join(HERE, "fixtures");
const WORK = path.resolve(process.env.DOD_TEST_WORKDIR ?? path.join(os.tmpdir(), "dod-template-tests"));
const args = process.argv.slice(2);
const KINDS = args.includes("--only") ? [args[args.indexOf("--only") + 1]] : ["esm", "cjs"];
const SKIP_BROWSER = args.includes("--skip-browser");
// How long /slow keeps the network busy: long enough that a second page load inside the
// standard's checks would push a report-mode entry past the test timeout, as it did before.
const SLOW_MS = Number(process.env.DOD_TEST_SLOW_MS ?? 40_000);
// Round 3: how long a page's HTML takes to arrive on the slow variants (a dev server compiling
// the route), how long /busy-once blocks on its first resize (past the standard's 30 s budget, so
// the first try runs out and the second succeeds), and how long /busy-resize blocks on every one.
const SLOW_HTML_MS = 1_500;
const BUSY_ONCE_MS = 32_000;
const BUSY_MS = 70_000;
const SLOWFIRST_MS = 125_000;
const SUITES = new Set((args.includes("--suite") ? args[args.indexOf("--suite") + 1] : "static,dom,browser,small").split(","));
// The DOM lane can run an older standard-dom.ts, to show which of its checks fail real markup.
const DOM_SRC = args.includes("--dom-src") ? path.resolve(args[args.indexOf("--dom-src") + 1]) : path.join(TEMPLATE, "e2e", "dod", "standard-dom.ts");

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
  // Round 5 (the reviewer's B1 and B3): /srv answers 429 from its 9th load since the last sign-in
  // (a per-session rate limit); /slowfirst holds every request until SLOWFIRST_MS after its first
  // one (a dev server's first compile), longer than a test's timeout.
  let srvLoads = 0;
  let slowStart = 0;
  // Round 6: sign-ins per user. A user named once-… signs in the first time only (the checks
  // phase's sign-in fails); every sign-in sets qan=<its count>, and the /e-… pages turn into the
  // wrong page when there is no session or from the second sign-in on (the checks phase).
  const logins = new Map();
  const LOGIN_FORM =
    '<form method="post" action="/login"><label for="u">אימייל</label><input id="u" name="u" type="email" autocomplete="username">' +
    '<label for="pw">סיסמה</label><input id="pw" name="pw" type="password" autocomplete="current-password"><button type="submit">כניסה</button></form>';
  const server = http.createServer((req, res) => {
    req.resume();
    const url = new URL(req.url ?? "/", "http://fixture");
    const html = (name, body) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(shell(name, body));
    };
    if (url.pathname === "/favicon.ico") return res.writeHead(204).end();
    if (url.pathname === "/fixture.css" || url.pathname === "/real.css" || url.pathname === "/real-extra.css") {
      res.writeHead(200, { "content-type": "text/css" });
      return res.end(fs.readFileSync(path.join(FIXTURES, url.pathname.slice(1))));
    }
    if (url.pathname === "/login") {
      // The QA login global-setup performs: a cookie stands in for a real session. Each run (and
      // each phase of `pnpm dod`) signs in once, so it also starts /srv's and /slowfirst's state.
      if (req.method === "POST") {
        srvLoads = 0;
        slowStart = 0;
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const user = new URLSearchParams(body).get("u") ?? "";
          const n = (logins.get(user) ?? 0) + 1;
          logins.set(user, n);
          // A failed sign-in answers with its form again, 200 and no cookie.
          if (user.startsWith("once-") && n > 1) return html("login", "<p>הפרטים שגויים.</p>" + LOGIN_FORM);
          res.writeHead(303, { "set-cookie": ["qa=1; Path=/; HttpOnly", `qan=${n}; Path=/`], location: "/" }).end();
        });
        return;
      }
      return html(
        "login",
        '<form method="post" action="/login"><label for="u">אימייל</label><input id="u" name="u" type="email" autocomplete="username">' +
          '<label for="pw">סיסמה</label><input id="pw" name="pw" type="password" autocomplete="current-password"><button type="submit">כניסה</button></form>',
      );
    }
    if (url.pathname === "/") return html("home", "<p>דף הבית של הבדיקה.</p>");
    // H1 of review round 2: pages whose report-mode run must score exactly as without standard.json.
    // /slow keeps the network busy for SLOW_MS; /resize-log logs a console error 300 ms after a
    // resize; /nav-resize navigates home when the window is made wide, and spins (a reduced-motion
    // finding that must be measured on the route itself, not on the page it went to).
    if (url.pathname === "/api/slow") return setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end("{}"), SLOW_MS);
    if (url.pathname === "/slow") return html("slow", '<p>רשימת התורים של היום נטענת מהשרת.</p><script>fetch("/api/slow")</script>');
    const RESIZE_LOG =
      '<p>לוח שנה שבועי עם הרבה תורים.</p><script>let t;addEventListener("resize",()=>{clearTimeout(t);t=setTimeout(()=>console.error("layout: cannot measure week grid"),300)})</script>';
    if (url.pathname === "/resize-log") return html("resize-log", RESIZE_LOG);
    // Round 3. The same page with its HTML late: the old document must be gone before the console
    // counts again, or its timer lands in the reduced-motion load's count.
    if (url.pathname === "/resize-log-slow") return setTimeout(() => html("resize-log-slow", RESIZE_LOG), SLOW_HTML_MS);
    // A breakpoint hack: a full reload of the same URL when the width crosses 768 (the 375 entry's
    // probe crosses it), with slow HTML.
    if (url.pathname === "/reload-on-resize")
      return setTimeout(
        () =>
          html(
            "reload-on-resize",
            '<p>מסך שנטען מחדש כשהחלון משנה רוחב.</p><script>const w0=innerWidth>=768;addEventListener("resize",()=>{if((innerWidth>=768)!==w0)location.reload()})</script>',
          ),
        SLOW_HTML_MS,
      );
    // The URL changes on resize, the document stays (history.replaceState).
    if (url.pathname === "/replace-resize")
      return html(
        "replace-resize",
        '<p>מסך ששומר את הרוחב בכתובת.</p><script>addEventListener("resize",()=>history.replaceState(null,"",location.pathname+"?w="+innerWidth))</script>',
      );
    // The main thread blocked on the tab's first resize only (a loaded machine; remembered in
    // sessionStorage, since each try of the standard loads the page again), and on every resize.
    if (url.pathname === "/busy-once")
      return html(
        "busy-once",
        `<p>מסך עם חישוב כבד בשינוי הגודל הראשון.</p><script>addEventListener("resize",()=>{if(sessionStorage.getItem("busy"))return;sessionStorage.setItem("busy","1");const e=Date.now()+${BUSY_ONCE_MS};while(Date.now()<e){}})</script>`,
      );
    if (url.pathname === "/busy-resize")
      return html(
        "busy-resize",
        `<p>מסך עם חישוב כבד בכל שינוי גודל.</p><script>addEventListener("resize",()=>{const e=Date.now()+${BUSY_MS};while(Date.now()<e){}})</script>`,
      );
    if (url.pathname === "/nav-resize")
      return html(
        "nav-resize",
        '<p>מסך לטלפון בלבד, עם אנימציה.</p><div style="width:20px;height:20px;background:#333;animation:s 2s linear infinite"></div>' +
          '<style>@keyframes s{to{transform:rotate(360deg)}}</style><script>addEventListener("resize",()=>{if(innerWidth>1000&&!location.search.includes("w"))location.replace("/?w")})</script>',
      );
    // Round 4 (the reviewer's pages): a page that logs on pagehide, logs once per tab without a
    // sessionStorage flag (also while blocking on every resize), logs when loaded as a reload,
    // starts an animation only when the window was scrolled (restored on reload), registers a
    // service worker that reloads once, and one whose checkVisibility throws on dialogs.
    const P = "<p>דף בדיקה עם מספיק תוכן כדי להיחשב כדף שצויר.</p>";
    const SS = '<script>if(!sessionStorage.getItem("seen")){console.error("no session step");sessionStorage.setItem("seen","1")}</script>';
    const R4 = {
      "/pagehide-log": P + '<script>addEventListener("pagehide",()=>console.error("pagehide: flush failed"))</script>',
      "/ss-same": P + SS,
      "/ss-busy": P + SS + `<script>addEventListener("resize",()=>{const e=Date.now()+${BUSY_MS};while(Date.now()<e){}})</script>`,
      "/navtype-log": P + '<script>if(performance.getEntriesByType("navigation")[0]?.type==="reload")console.error("reloaded")</script>',
      "/scroll-anim":
        '<div style="height:3000px">' + P + '</div><div id="b" style="width:40px;height:40px;background:#888"></div>' +
        '<style>@keyframes s{from{transform:translateX(0)}to{transform:translateX(30px)}}</style>' +
        '<script>addEventListener("load",()=>{if(!sessionStorage.getItem("sc")){sessionStorage.setItem("sc","1");scrollTo(0,2000)}setTimeout(()=>{if(scrollY>100)document.getElementById("b").style.animation="s 2s infinite"},50)})</script>',
      "/sw-page": P + '<script>if("serviceWorker" in navigator){let r=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!r){r=true;location.reload()}});navigator.serviceWorker.register("/sw.js")}</script>',
      "/tamper":
        P + '<div role="dialog" aria-label="חלון" style="padding:8px">תוכן החלון</div>' +
        '<script>const o=Element.prototype.checkVisibility;Element.prototype.checkVisibility=function(a){if(this.getAttribute("role")==="dialog")throw new Error("tampered");return o.call(this,a)}</script>',
    };
    if (R4[url.pathname]) return html(url.pathname.slice(1), R4[url.pathname]);
    // Round 6 (B1): the same page in the scored phase, the wrong one in the checks phase: a sign-in
    // form in place at the same URL, a redirect to /login, an HTTP 404 with a clean not-found page.
    if (url.pathname.startsWith("/e-")) {
      const cookie = req.headers.cookie ?? "";
      const stale = !/(?:^|;\s*)qa=1(?:;|$)/.test(cookie) || Number(cookie.match(/(?:^|;\s*)qan=(\d+)/)?.[1] ?? 0) >= 2;
      const defect = fs.readFileSync(path.join(FIXTURES, "one-primary.html"), "utf8");
      if (!stale) return html(url.pathname.slice(1), defect);
      if (url.pathname === "/e-inplace") return html("e-inplace", "<p>יש להתחבר כדי לראות את המסך הזה.</p>" + LOGIN_FORM);
      if (url.pathname === "/e-redir") return res.writeHead(302, { location: "/login" }).end();
      if (url.pathname === "/e-gone") {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        return res.end(shell("e-gone", "<p>לא מצאנו את מה שחיפשת. אפשר לחזור לדף הבית.</p>"));
      }
    }
    if (url.pathname === "/srv" && ++srvLoads >= 9) return res.writeHead(429, { "content-type": "text/html; charset=utf-8" }).end("rate limited");
    if (url.pathname === "/srv") return html("srv", P);
    if (url.pathname === "/slowfirst") {
      slowStart ||= Date.now();
      const wait = slowStart + SLOWFIRST_MS - Date.now();
      return void setTimeout(() => html("slowfirst", P), Math.max(0, wait));
    }
    // B2: a 200 s task when reduced motion goes back to normal (the old checks did exactly that).
    if (url.pathname === "/mq")
      return html("mq", P + '<script>matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change",e=>{if(!e.matches){const end=Date.now()+200000;while(Date.now()<end){}}})</script>');
    // A page that hangs for good on resize: the checks phase can only give up on it.
    if (url.pathname === "/hang-resize") return html("hang-resize", P + '<script>addEventListener("resize",()=>{for(;;){}})</script>');
    if (url.pathname === "/sw.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",e=>e.respondWith(fetch(e.request)))');
    }
    // F5: a session that expires after the first load: the reload is sent to sign-in.
    if (url.pathname === "/expires") {
      if (/(?:^|;\s*)seen-expires=1(?:;|$)/.test(req.headers.cookie ?? "")) return res.writeHead(302, { location: "/login" }).end();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "seen-expires=1; Path=/" });
      return res.end(shell("expires", P));
    }
    if (url.pathname === "/audience") {
      // Signed in, the page is wider than the screen; as a visitor it is not. An anonymous
      // entry that came out with an overflow would have been measured with the QA cookie.
      const staff = /(?:^|;\s*)qa=1(?:;|$)/.test(req.headers.cookie ?? "");
      return html("audience", staff ? '<p>מסך הצוות.</p><div style="width: 2000px">רחב</div>' : "<p>מסך המבקר.</p>");
    }
    const file = path.join(FIXTURES, `${url.pathname.slice(1)}.html`);
    if (/^\/[a-z0-9-]+$/.test(url.pathname) && fs.existsSync(file)) {
      const body = fs.readFileSync(file, "utf8");
      // A real-markup page is a whole document with its own styles, served as it is.
      if (body.startsWith("<!doctype")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(body);
      }
      return html(url.pathname.slice(1), body);
    }
    // Like a single-page app: any other path answers 200 with the app's own not-found screen,
    // in words that match no wording list, so only global-setup's print can recognise it.
    return html("not-found", "<p>לא מצאנו את מה שחיפשת. אפשר לחזור לדף הבית.</p>");
  });
  return new Promise((resolve) => server.listen(0, "::", () => resolve(server)));
}

// --- running the template --------------------------------------------------------------------
const BACKEND_VARS = /^(NEXT_PUBLIC_SUPABASE_URL|VITE_SUPABASE_URL|PUBLIC_SUPABASE_URL|SUPABASE_URL|DATABASE_URL|NEXT_PUBLIC_API_URL|VITE_API_URL|DOD_BACKEND_URL|ARGOS_TOKEN|DOD_ROOT|DOD_VERTICAL|CI)$/;
function playwright(cwd, port, extraEnv = {}, signal = null) {
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
  // The way `pnpm dod` runs the kit: run-dod.mjs (both phases). An older kit given with
  // --template has no run-dod.mjs and is run as it was, Playwright alone.
  const wrapper = path.join(cwd, "e2e", "dod", "run-dod.mjs");
  const argv = fs.existsSync(wrapper) ? [wrapper, "--reporter=dot,json"] : [cli, "test", "-c", "playwright.dod.config.ts", "--reporter=dot,json"];
  const t0 = Date.now();
  return new Promise((resolve) => {
    // dot on the log, json in pw.json (each test's duration; the checks phase in pw.checks.json).
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = path.join(cwd, "pw.json");
    const child = spawn(process.execPath, argv, { cwd, env, stdio: ["ignore", fd, fd] });
    // { after, delayMs, sig }: once the log shows `after`, wait delayMs and send sig to the runner alone.
    let poll;
    if (signal)
      poll = setInterval(() => {
        if (!fs.readFileSync(log, "utf8").includes(signal.after)) return;
        clearInterval(poll);
        setTimeout(() => child.kill(signal.sig), signal.delayMs);
      }, 500);
    child.on("exit", (code, signal) => {
      clearInterval(poll);
      fs.closeSync(fd);
      resolve({ code, signal, secs: Math.round((Date.now() - t0) / 1000), log: fs.readFileSync(log, "utf8") });
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
// Seconds per test ("dod /busy-resize__375__light"), from the json reporter.
const durations = (dir, file = "pw.json") => {
  const out = {};
  const walk = (suite) => {
    for (const x of suite.suites ?? []) walk(x);
    for (const sp of suite.specs ?? []) for (const t of sp.tests) for (const r of t.results) out[sp.title] = r.duration / 1000;
  };
  const f = path.join(dir, file);
  if (fs.existsSync(f)) for (const x of JSON.parse(fs.readFileSync(f, "utf8")).suites) walk(x);
  return out;
};
// The invariant (rounds 4 and 5): every route's score and console count, and every scored field of
// every entry, the same in two runs. Returns the differences.
const SCORED = (e) => ({
  status: e.status,
  load_error: e.load_error,
  unreachable: e.unreachable,
  unreachable_reason: e.unreachable_reason,
  reached: e.reached,
  not_reached_reason: e.not_reached_reason,
  overflow: e.overflow,
  axe: { counted: e.axe.counted, scored: e.axe.scored, by_impact: e.axe.by_impact },
  console_errors: e.console_errors,
  fonts: e.fonts.count,
  touch_targets: e.touch_targets.failures,
  reduced_motion: e.reduced_motion.violations,
});
const invariantDiffs = (p, r, routes) => {
  const diffs = [];
  for (const x of routes) {
    const a = p.routes[x];
    const b = r.routes[x];
    if (a?.score !== b?.score || a?.console_errors !== b?.console_errors) diffs.push(`${x}: score ${a?.score}/${b?.score}, console ${a?.console_errors}/${b?.console_errors}`);
    for (const ea of a?.entries ?? []) {
      const eb = b?.entries.find((e) => e.viewport.width === ea.viewport.width && e.scheme === ea.scheme);
      // A page cut off by its test's timeout fails in whichever call was in flight at that moment
      // (goto aborted, a wait, a closed page), which is a race between the workers in either run,
      // not something standard.json changes: the message is compared as that one fact.
      const CUT = /Test timeout|has been closed|ERR_ABORTED|frame was detached/;
      const norm = (e) => {
        if (!e) return "missing";
        const x = SCORED(e);
        // (Whether the response had already arrived, so whether `status` was set, is part of that race.)
        if (CUT.test(x.load_error ?? "")) x.status = "cut off";
        for (const k of ["load_error", "unreachable_reason"]) if (CUT.test(x[k] ?? "")) x[k] = "cut off by the test's timeout";
        return JSON.stringify(x);
      };
      if (norm(ea) !== norm(eb)) diffs.push(`${x} ${ea.viewport.width}/${ea.scheme}: ${norm(ea)} vs ${norm(eb)}`.slice(0, 400));
    }
  }
  if (p.totals.score !== r.totals.score) diffs.push(`total ${p.totals.score} vs ${r.totals.score}`);
  return diffs;
};
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
  // The page half of state-coverage: a ?state=empty variant that renders no empty state.
  "state-coverage": ["state-missing?state=empty"],
};
// Stock shadcn/Radix markup on which no check may fire: a check that fails a well-built
// screen teaches people to ignore the checks.
const REAL_PAGES = ["real-settings", "real-table"];
// Every real-markup page, for the DOM lane: the two above plus the reviewer's of round 2 (a
// booking screen with cmdk and react-day-picker, a modal dialog form, a modal sheet, the sidebar
// shell with a breadcrumb, and the same shell nested deeper). No check may fire on any.
// Round 3 adds the reviewer's drawer (vaul, the stock drawer-demo stepper) and a page with a
// NavigationMenu, an open range picker and a Carousel at its first slide.
// Round 4 adds the reviewer's AlertDialog, the form controls (Switch form, Slider, Toggle group),
// and two list pages (Pagination with ellipsis, Tabs with a disabled tab, a context menu open as a
// modal and as a non-modal).
const LANE_PAGES = [
  ...REAL_PAGES,
  "real-booking",
  "real-dialog-form",
  "real-sheet",
  "real-shell",
  "real-shell-deep",
  "real-drawer",
  "real-nav-range",
  "real-alert-dialog",
  "real-form-controls",
  "real-list-menus",
  "real-list-nonmodal",
];
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
      ...REAL_PAGES.map((p) => `/${p}`),
      "/clean?state=empty",
      "/marker-no-access",
      "/marker-no-access?state=no-access",
      "/no-such-screen",
      "/notfound-words",
      "/pointer-touch",
      { route: "/help-door?as=nohelp", noHelp: "a fixture page with no door, on purpose" },
      { route: "/help-door?as=legacy", static: true },
      { route: "/help-door?as=static", static: true, noHelp: false },
    ],
    "e2e/dod/standard.json": STANDARD,
    "e2e/dod/scoring.json": { axe: { minorModerate: "enforce" } },
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
      const file = `${f.split("?")[0]}.html${f.includes("?") ? ` (/${f})` : ""}`;
      ok(exact, `${kind}: ${file} fires exactly ${id} (${got.join(",") || "none"})`);
      ok(R[`/${f}`]?.score <= 100 - 10, `${kind}: enforce mode deducts for ${id} on ${file} (score ${R[`/${f}`]?.score})`);
      table.push({ kind, id, fixture: file, fired: exact, onClean: clean.includes(id) });
    }
  }
  const dlg = fired(R["/one-primary-dialog"]);
  ok(dlg.length === 0, `${kind}: one-primary counts the open dialog alone (fired: ${dlg.join(",") || "none"})`);
  // The probe's sizes are split by pointer: the 375 light entry takes 320, 390 and 768 with a
  // touch pointer, the 1440 light entry 1024 and 1280 with a mouse, each size once per route.
  const probeOf = (w) => R["/probe"]?.entries.find((e) => e.viewport.width === w && e.scheme === "light")?.probe ?? {};
  const probe = { ...probeOf(375), ...probeOf(1440) };
  ok(String(Object.keys(probeOf(375))) === "320x700,390x844,768x1024" && String(Object.keys(probeOf(1440))) === "1024x768,1280x648", `${kind}: each probe size is measured once, by the entry whose pointer fits it`);
  ok(R["/probe"]?.entries.filter((e) => e.scheme === "dark").every((e) => !e.probe), `${kind}: the dark entries run no probe`);
  ok(probe["320x700"]?.overflow && !probe["390x844"]?.overflow, `${kind}: probe sees the sideways scroll at 320 only`);
  ok(Object.values(probe).length === 5 && Object.values(probe).every((p) => p.small_text.count > 0), `${kind}: probe sees text under the floor at every size`);
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

  // Real markup: no check fires, at any entry or probe size.
  for (const p of REAL_PAGES) {
    const got = fired(R[`/${p}`]);
    const errs = Object.entries(R[`/${p}`]?.standard ?? {}).filter(([, c]) => c.error).map(([id]) => id);
    ok(got.length === 0 && errs.length === 0, `${kind}: no check fires on ${p}.html (${got.join(",") || "none"}${errs.length ? `; errors ${errs}` : ""})`);
    table.push({ kind, id: "(every check)", fixture: `${p}.html`, fired: got.length > 0, onClean: null, real: true });
  }
  ok(fired(R["/clean?state=empty"]).length === 0, `${kind}: a ?state=empty variant that renders data-state="empty" passes`);
  // The standard's markers, the not-found print and the wording fallback (M3).
  const reason = (r_) => r_?.entries?.[0]?.unreachable_reason ?? "";
  ok(reason(R["/marker-no-access"]).includes('data-state="no-access"'), `${kind}: [data-state="no-access"] marks the page unreachable (${reason(R["/marker-no-access"])})`);
  ok(R["/marker-no-access?state=no-access"]?.entries.every((e) => !e.unreachable), `${kind}: the same marker on its own ?state=no-access variant is the designed screen`);
  ok(reason(R["/no-such-screen"]).includes("the app's not-found text"), `${kind}: the app's own not-found screen is caught by the print (${reason(R["/no-such-screen"])})`);
  ok(reason(R["/notfound-words"]).includes("not-found wording"), `${kind}: "העמוד לא נמצא" is caught by the wording fallback`);
  ok(price.every((e) => !e.unreachable), `${kind}: a "404" stat card and the word "Forbidden" in content stay reachable`);
  // Touch targets in the probe are measured with a touch pointer (M6).
  const pt = R["/pointer-touch"]?.entries.find((e) => e.viewport.width === 375 && e.scheme === "light");
  ok(
    ["320x700", "390x844", "768x1024"].every((k) => pt?.probe?.[k]?.touch?.failures === 0) && pt?.touch_targets.checked && pt?.touch_targets.failures === 0,
    `${kind}: a control that reaches 44px on (pointer: coarse) passes the probe's touch sizes and the score's 375 check, both with a touch pointer`,
  );
  // noHelp and static are separate (M5).
  ok(fired(R["/help-door?as=nohelp"]).length === 0 && R["/help-door?as=nohelp"]?.standard?.["help-door"]?.skipped?.startsWith("noHelp"), `${kind}: noHelp exempts help-door`);
  ok(fired(R["/help-door?as=legacy"]).length === 0 && r.standard?.config_errors?.some((e) => e.includes("deprecated")), `${kind}: the old "static": true still exempts help-door, with a deprecation note`);
  ok(String(fired(R["/help-door?as=static"])) === "help-door", `${kind}: "static": true with "noHelp": false keeps the door required`);
  // forbidden-words: user content is skipped, an emoji sample is not cut in half (M1, LOW).
  ok(R["/forbidden-words"]?.standard?.["forbidden-words"]?.count === 8, `${kind}: forbidden-words counts 8 on its fixture, none in its data-user-content line (${R["/forbidden-words"]?.standard?.["forbidden-words"]?.count})`);
  ok(R["/forbidden-words"]?.entries.some((e) => e.standard?.["forbidden-words"]?.samples.some((x) => x.includes("😀"))), `${kind}: the emoji sample keeps the whole emoji`);
}

async function smallRuns(kind, port) {
  // The same three routes twice: without standard.json, and in report mode with a broken
  // coreUnit selector. Report mode records its findings and its error, and must leave every
  // score, the console counts and the exit code exactly as the plain run has them (H3).
  const ROUTES = [
    "/clean",
    "/one-primary",
    "/axe-moderate",
    "/slow",
    "/resize-log",
    "/nav-resize",
    "/resize-log-slow",
    "/reload-on-resize",
    "/replace-resize",
    "/busy-once",
    "/busy-resize",
    "/pagehide-log",
    "/ss-same",
    "/ss-busy",
    "/navtype-log",
    "/scroll-anim",
    "/sw-page",
    "/tamper",
  ];
  const plainDir = project(path.join(WORK, `${kind}-plain`), kind, { "e2e/dod/routes.json": ROUTES });
  const plain = await playwright(plainDir, port);
  let p = null;
  if (ranClean(plain, `${kind}: run without standard.json exits 0`)) {
    p = report(plainDir);
    // The QA session is gone after the run (M5): global-setup signs in again each time.
    ok(!fs.existsSync(path.join(plainDir, "node_modules", ".cache", "dod", "qa-storage-state.json")), `${kind}: the QA session file is deleted at the end of the run`);
    ok(p.standard === "not configured", `${kind}: dod.json says standard: "not configured"`);
    ok(Object.values(p.routes).every((x) => x.entries.every((e) => !e.standard && !e.probe)), `${kind}: no entry carries standard or probe results`);
    // Default axe scoring: a moderate node is recorded and costs nothing.
    const am = p.routes["/axe-moderate"];
    ok(am?.axe_recorded > 0 && am?.axe_violations === 0 && am?.score === 100, `${kind}: without scoring.json a moderate axe node is recorded and not scored (score ${am?.score})`);
  }
  const dir = project(path.join(WORK, `${kind}-report`), kind, {
    "e2e/dod/routes.json": ROUTES,
    // maxTimeouts above the slow pages' count, so every one of them is checked (and retried).
    "e2e/dod/standard.json": { ...STANDARD, mode: "report", maxTimeouts: 50, coreUnit: { route: "/clean", selector: "[[broken", min: 1, viewport: [390, 700] } },
  });
  const run = await playwright(dir, port);
  ok(run.code === plain.code, `${kind}: report mode with a broken selector exits as the plain run does (${run.code} vs ${plain.code})`);
  if (p && run.code === 0) {
    const r = report(dir);
    // The invariant itself (round 4): for every route, the score, the console count and every
    // scored field of every entry are the same with and without standard.json (report mode, no
    // "enforce" list), and so is the exit code (above).
    const diffs = invariantDiffs(p, r, ROUTES);
    ok(diffs.length === 0 && r.totals.score === p.totals.score, `${kind}: invariant: every route's score, console count and scored entry fields are the same with and without standard.json (${ROUTES.length} routes, total ${r.totals.score} vs ${p.totals.score})`);
    for (const d of diffs.slice(0, 10)) console.log(`      ${d}`);
    ok(Object.values(r.routes).every((x) => x.entries.every((e) => !e.unreachable)), `${kind}: a check that throws never makes a page unreachable`);
    ok(r.routes["/clean"]?.standard?.["core-unit"]?.error && r.standard?.errors?.some((e) => e.includes("core-unit")), `${kind}: the broken selector is recorded as core-unit's error in dod.json`);
    const nav = r.routes["/nav-resize"];
    ok(
      String(nav?.standard?.probe?.error).includes("navigated") && nav?.reduced_motion_violations === p.routes["/nav-resize"]?.reduced_motion_violations,
      `${kind}: a page that navigates on resize records the probe's error and keeps its own measurements (${nav?.standard?.probe?.error})`,
    );
    for (const x of ROUTES.slice(3))
      ok(
        r.routes[x]?.score === p.routes[x]?.score && r.routes[x]?.console_errors === p.routes[x]?.console_errors,
        `${kind}: ${x} scores ${r.routes[x]?.score} with ${r.routes[x]?.console_errors} console error(s) in report mode, and ${p.routes[x]?.score} with ${p.routes[x]?.console_errors} without standard.json`,
      );
    const probeErr = (x) => String(r.routes[x]?.standard?.probe?.error);
    ok(probeErr("/reload-on-resize").includes("reloaded itself"), `${kind}: a same-URL reload on resize is said as one (${probeErr("/reload-on-resize")})`);
    ok(probeErr("/replace-resize").includes("the URL changed on resize"), `${kind}: a replaceState on resize is said as a URL change (${probeErr("/replace-resize")})`);
    // M3: a try that ran out of time gets a second one, and only the second is kept.
    const once = r.routes["/busy-once"]?.entries.filter((e) => e.scheme === "light") ?? [];
    ok(
      once.length === 2 && once.every((e) => e.standard_retried?.includes("out of time") && !e.standard?.probe?.error),
      `${kind}: a first try that ran out of time is retried and the second try's probe is kept (${once.map((e) => `${e.viewport.width}: ${e.standard_retried ?? "no retry"}; ${e.standard?.probe?.error ?? "no error"}`).join(" / ")})`,
    );
    // M4: a page that blocks on every resize ends the standard at its deadline; no entry passes
    // its own timeout.
    const busy = r.routes["/busy-resize"]?.entries.filter((e) => e.scheme === "light") ?? [];
    ok(busy.length === 2 && busy.every((e) => String(e.standard?.probe?.error).includes("out of time") && !e.unreachable), `${kind}: /busy-resize records the probe out of time and stays measured`);
    const dp = durations(plainDir);
    const dr = durations(dir);
    const dc = durations(dir, "pw.checks.json");
    // The scored phase does the same work with or without standard.json; the checks phase's test
    // for a page that blocks on every resize ends at its budget (two tries and the waits at most).
    const scoredSame = ["375__light", "1440__light"].every((v) => Math.abs(dr[`dod busy-resize__${v}`] - dp[`dod busy-resize__${v}`]) < 10);
    const checkSecs = ["375__light", "1440__light"].map((v) => dc[`standard busy-resize__${v}`]);
    ok(scoredSame && checkSecs.every((x) => x > 25 && x < 105), `${kind}: /busy-resize: the scored test takes as long as without standard.json, its checks test ${checkSecs.map((x) => x?.toFixed(1)).join(" s and ")} s (bounded by its 105 s timeout)`);
    console.log(`     ${kind} wall time: ${plain.secs} s without standard.json, ${run.secs} s in report mode (both phases)`);
    // CF3: what dod.json says about an entry's checks is what its checks file holds.
    const files = fs.readdirSync(path.join(dir, "reports", "dod", "results")).filter((f) => f.endsWith(".standard.json"));
    const mismatch = files.filter((f) => {
      const [slug, w, sch] = f.replace(".standard.json", "").split("__");
      const e = Object.values(r.routes).flatMap((x) => x.entries).find((x) => x.slug === slug && String(x.viewport.width) === w && x.scheme === sch);
      return JSON.stringify(e?.standard) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "results", f), "utf8")).standard);
    });
    ok(files.length > 0 && mismatch.length === 0, `${kind}: every checks file is what dod.json shows (${files.length} files, ${mismatch.length} differ)`);
    // Time per light entry, without standard.json and in report mode.
    for (const x of ["slow", "resize-log-slow", "reload-on-resize", "busy-once", "busy-resize", "ss-busy"])
      for (const v of ["375__light", "1440__light"])
        console.log(`     ${kind} ${x}__${v}: ${dp[`dod ${x}__${v}`]?.toFixed(1)} s plain, ${dr[`dod ${x}__${v}`]?.toFixed(1)} s report (scored), ${dc[`standard ${x}__${v}`]?.toFixed(1)} s checks`);
    ok(r.routes["/clean"]?.standard?.["core-unit"]?.verdict === "errored" && !r.routes["/clean"]?.entries.some((e) => e.standard_retried), `${kind}: report mode: the broken selector is "errored", costs nothing and is not retried outside CI`);
    ok(
      r.routes["/one-primary"]?.standard?.["one-primary"]?.count > 0 && r.totals.standard_findings > 0,
      `${kind}: report mode records one-primary and sums the findings in totals`,
    );
  }
  // M3: in enforce mode a check that errored is a failure of that check, said as "errored"; under
  // CI it is tried once more first. DOD_KEEP_STORAGE_STATE=1 keeps the session file (M5).
  const enfDir = project(path.join(WORK, `${kind}-enforce-errored`), kind, {
    "e2e/dod/routes.json": ["/clean", "/tamper"],
    "e2e/dod/standard.json": { ...STANDARD, coreUnit: { route: "/clean", selector: "[[broken", min: 1, viewport: [390, 700] } },
  });
  const enf = await playwright(enfDir, port, { CI: "1", DOD_KEEP_STORAGE_STATE: "1" });
  if (ranClean(enf, `${kind}: enforce run with a broken selector exits 0 (the score says it)`)) {
    const e = report(enfDir);
    const cu = e.routes["/clean"]?.standard?.["core-unit"];
    ok(
      cu?.verdict === "errored" && e.routes["/clean"]?.score === 90 && e.routes["/clean"]?.standard_errored === 1 && e.routes["/clean"]?.standard_scored === 1,
      `${kind}: enforce mode: an errored check costs its 10 points and is "errored", not "found" (${cu?.verdict}, score ${e.routes["/clean"]?.score})`,
    );
    const lightCu = e.routes["/clean"]?.entries.find((x) => x.viewport.width === 375 && x.scheme === "light");
    ok(lightCu?.standard_retried?.includes("core-unit"), `${kind}: under CI the errored check is tried once more (${lightCu?.standard_retried})`);
    const ss = path.join(enfDir, "node_modules", ".cache", "dod", "qa-storage-state.json");
    ok(fs.existsSync(ss) && (fs.statSync(ss).mode & 0o777) === 0o600, `${kind}: DOD_KEEP_STORAGE_STATE=1 keeps the session file, readable by its owner only`);
    // F1: a page that breaks the whole DOM-check call: every planned check is errored, each costs
    // its points in enforce mode, and the entry was tried twice.
    const tp = e.routes["/tamper"];
    const tv = Object.values(tp?.standard ?? {});
    ok(
      tv.length >= 11 && tv.every((c) => c.verdict === "errored" && c.enforced) && tp?.score === Math.max(0, 100 - 10 * tv.length) && tp?.entries.every((x) => x.standard_retried),
      `${kind}: enforce: a DOM-check call that throws as a whole errs every check (${tv.length} checks, score ${tp?.score}), each tried twice`,
    );
  }
  // Report mode with one check enforced: only that one costs points.
  // F2: a static id under "enforce" ("help-route") is accepted by the run; F1 with a list; F5.
  const oneDir = project(path.join(WORK, `${kind}-enforce-one`), kind, {
    "e2e/dod/routes.json": ["/one-primary", "/tooltip-only", "/tamper", "/expires"],
    "e2e/dod/standard.json": { ...STANDARD, mode: "report", enforce: ["one-primary", "help-route"], coreUnit: undefined },
  });
  const one = await playwright(oneDir, port);
  if (ranClean(one, `${kind}: report run with "enforce": ["one-primary"] exits 0`)) {
    const o = report(oneDir);
    ok(
      o.routes["/one-primary"]?.score === 90 && o.routes["/tooltip-only"]?.score === 100 && o.routes["/tooltip-only"]?.standard?.["tooltip-only"]?.count > 0,
      `${kind}: "enforce": ["one-primary"] deducts for one-primary only (${o.routes["/one-primary"]?.score} / ${o.routes["/tooltip-only"]?.score})`,
    );
    const ts = o.routes["/tamper"]?.standard;
    ok(
      o.routes["/tamper"]?.score === 90 && ts?.["one-primary"]?.verdict === "errored" && ts?.["one-primary"]?.enforced === true && ts?.["tooltip-only"]?.enforced === false,
      `${kind}: with an "enforce" list, the thrown DOM-check call costs the enforced check only (score ${o.routes["/tamper"]?.score}), and each check says enforced`,
    );
    const ex = o.routes["/expires"]?.entries ?? [];
    ok(ex.length === 4 && ex.every((x) => x.unreachable && x.unreachable_reason?.includes("reduced-motion reload landed on /login")), `${kind}: a reduced-motion reload sent to sign-in marks the entry unreachable (${ex[0]?.unreachable_reason})`);
  }
  // F2: an unknown id under "enforce" stops the run with words, not "No tests found" alone.
  const badDir = project(path.join(WORK, `${kind}-enforce-unknown`), kind, {
    "e2e/dod/routes.json": ["/clean"],
    "e2e/dod/standard.json": { ...STANDARD, mode: "report", enforce: ["help-rout"] },
  });
  const bad = await playwright(badDir, port);
  ok(bad.code !== 0 && bad.log.includes('"enforce" must be a list of check ids'), `${kind}: an unknown id under "enforce" is a configuration error in the run (exit ${bad.code})`);
  // Round 6 (CF-d, B2): it stops the run in global-setup, before the walk, and leaves no session.
  ok(
    !fs.existsSync(path.join(badDir, "reports", "dod", "results", "clean__375__light.json")) &&
      !fs.existsSync(path.join(badDir, "node_modules", ".cache", "dod", "qa-storage-state.json")),
    `${kind}: a bad standard.json stops the run before the walk and leaves no QA session file`,
  );
  // Round 6 (B1): the checks judge only the page the scored phase measured. "enforce":
  // ["one-primary"], and each page has two accent actions in the scored phase, so a correct
  // result is one-primary "found 2" or, when the checks phase gets another page, "errored" with
  // the real reason: never "clean".
  const STD6 = { ...STANDARD, mode: "report", enforce: ["one-primary"], coreUnit: undefined };
  const opOf = (r, x) => r.routes[x]?.standard?.["one-primary"];
  const gaDir = project(path.join(WORK, `${kind}-gate-signin`), kind, { "e2e/dod/routes.json": ["/e-inplace"], "e2e/dod/standard.json": STD6 });
  const ga = await playwright(gaDir, port, { DOD_USER: `once-${kind}-${Date.now()}@example.com` });
  if (ranClean(ga, `${kind}: a run whose checks-phase sign-in fails exits 0 (the scored phase's code)`)) {
    const g = report(gaDir);
    const op = opOf(g, "/e-inplace");
    ok(
      op?.verdict === "errored" && String(op?.error).includes("could not sign in") && g.routes["/e-inplace"]?.score === 90 && g.standard?.not_checked?.entries === 4 && ga.log.includes("the sign-in did not land"),
      `${kind}: the checks phase's sign-in fails: every check of the signed-in entries is errored, not clean (${op?.verdict}: ${String(op?.error).slice(0, 90)}; score ${g.routes["/e-inplace"]?.score})`,
    );
  }
  const gbDir = project(path.join(WORK, `${kind}-gate-page`), kind, { "e2e/dod/routes.json": ["/e-gone", "/e-inplace", "/e-redir"], "e2e/dod/standard.json": STD6 });
  const gb = await playwright(gbDir, port, { DOD_USER: `twice-${kind}-${Date.now()}@example.com` });
  if (ranClean(gb, `${kind}: a run whose checks phase gets other pages exits 0`)) {
    const g = report(gbDir);
    for (const [x, want] of [
      ["/e-gone", "HTTP 404"],
      ["/e-inplace", "a sign-in form is on the page"],
      ["/e-redir", "/login"],
    ]) {
      const op = opOf(g, x);
      ok(
        op?.verdict === "errored" && String(op?.error).includes(want) && String(op?.error).includes("not the page the scored phase measured") && g.routes[x]?.score === 90,
        `${kind}: ${x} in the checks phase is not the scored page: errored with "${want}", not clean (${op?.verdict}: ${String(op?.error).slice(0, 120)})`,
      );
    }
  }
  // Round 6 (CF-a, B2): SIGTERM to the runner alone. During the checks phase: the checks phase
  // stops, the exit code is the scored phase's (0) and no session file is left; during the scored
  // phase: no checks phase, exit 143, no session file.
  // One worker and two routes, so checks are still running and still waiting 4 s into the phase.
  const sigDir = project(path.join(WORK, `${kind}-signal-checks`), kind, { "e2e/dod/routes.json": ["/busy-resize", "/clean"], "e2e/dod/standard.json": { ...STANDARD, mode: "report", coreUnit: undefined } });
  const sg = await playwright(sigDir, port, { DOD_WORKERS: "1" }, { after: "scored phase done", delayMs: 4000, sig: "SIGTERM" });
  const sgWhy = Object.keys((fs.existsSync(path.join(sigDir, "reports", "dod", "dod.json")) && report(sigDir).standard?.not_checked?.reasons) || {});
  ok(
    sg.code === 0 && !fs.existsSync(path.join(sigDir, "node_modules", ".cache", "dod", "qa-storage-state.json")) && sg.secs < 90 && sgWhy.some((k) => k.includes("stopped by SIGTERM")),
    `${kind}: SIGTERM to the runner during the checks phase: exit ${sg.code} (the scored phase's), no session file, stopped in ${sg.secs} s, dod.json says why (${sgWhy.join("; ").slice(0, 100)})`,
  );
  const sig2Dir = project(path.join(WORK, `${kind}-signal-scored`), kind, { "e2e/dod/routes.json": ["/slow"], "e2e/dod/standard.json": { ...STANDARD, mode: "report", coreUnit: undefined } });
  const sg2 = await playwright(sig2Dir, port, {}, { after: "QA session saved", delayMs: 4000, sig: "SIGTERM" });
  ok(
    sg2.code === 143 && !sg2.log.includes("scored phase done") && !fs.existsSync(path.join(sig2Dir, "node_modules", ".cache", "dod", "qa-storage-state.json")),
    `${kind}: SIGTERM to the runner during the scored phase: exit ${sg2.code}, no checks phase, no session file`,
  );
  // F3: after maxTimeouts entries ran out of time, the rest of the run is not checked: one worker,
  // /busy-once's 375 light entry runs out first, the 7 entries after it are skipped, and in
  // enforce mode each of them is errored.
  const capDir = project(path.join(WORK, `${kind}-cap`), kind, {
    "e2e/dod/routes.json": ["/busy-once", "/clean"],
    "e2e/dod/standard.json": { ...STANDARD, maxTimeouts: 1, coreUnit: undefined },
  });
  const cap = await playwright(capDir, port, { DOD_WORKERS: "1" });
  if (ranClean(cap, `${kind}: a run that reaches maxTimeouts exits 0`)) {
    const c = report(capDir);
    const sk = c.standard?.skipped_after_timeouts;
    ok(
      sk?.max_timeouts === 1 && sk?.entries_not_checked === 7 && cap.log.includes("stopped after 1 entries ran out of time") &&
        Object.values(c.routes["/clean"]?.standard ?? {}).every((x) => x.verdict === "errored") && c.routes["/clean"]?.score < 100,
      `${kind}: maxTimeouts 1 skips the rest of the run, says so, and enforce counts it (${JSON.stringify(sk)}, /clean ${c.routes["/clean"]?.score})`,
    );
  }
  // Round 5: the reviewer's three reproductions, and a page that hangs the checks for good. A
  // route that takes longer than a test's timeout (/slowfirst) makes both runs exit 1 with total 0;
  // /srv rate-limits from its 9th load; /mq blocks when reduced motion goes back to normal. The
  // invariant holds over all of it, the exit code included.
  const R5 = ["/clean", "/slowfirst", "/mq", "/srv", "/hang-resize"];
  const r5p = project(path.join(WORK, `${kind}-r5-plain`), kind, { "e2e/dod/routes.json": R5 });
  const r5pRun = await playwright(r5p, port);
  const r5r = project(path.join(WORK, `${kind}-r5-report`), kind, { "e2e/dod/routes.json": R5, "e2e/dod/standard.json": { ...STANDARD, mode: "report", coreUnit: undefined } });
  const r5rRun = await playwright(r5r, port);
  {
    const a = report(r5p);
    const b = report(r5r);
    const diffs = invariantDiffs(a, b, R5);
    ok(
      r5pRun.code === r5rRun.code && diffs.length === 0,
      `${kind}: invariant with a route over the test timeout, a rate limit, a motion-change hang and a checks hang: exit ${r5pRun.code} vs ${r5rRun.code}, total ${a.totals.score} vs ${b.totals.score}, /slowfirst ${a.routes["/slowfirst"]?.score}/${b.routes["/slowfirst"]?.score}, /srv ${a.routes["/srv"]?.score}/${b.routes["/srv"]?.score}, /mq ${a.routes["/mq"]?.score}/${b.routes["/mq"]?.score}`,
    );
    for (const d of diffs.slice(0, 10)) console.log(`      ${d}`);
    ok(r5pRun.code === 1 && a.routes["/srv"]?.score === 100 && a.routes["/slowfirst"]?.entries.some((e) => e.unreachable), `${kind}: the plain run itself: /slowfirst times out (exit 1), /srv stays under its limit`);
    const hang = b.routes["/hang-resize"]?.entries.filter((e) => e.scheme === "light") ?? [];
    ok(hang.length === 2 && hang.every((e) => e.standard?.probe?.error), `${kind}: the checks give up on the hanging page and say so (${hang.map((e) => e.standard?.probe?.error).join(" / ").slice(0, 160)})`);
    console.log(`     ${kind} round-5 wall time: ${r5pRun.secs} s without standard.json, ${r5rRun.secs} s in report mode`);
  }
  // Point 4: the checks phase's own deadline. One worker, the busy page first: at 0.5 min the
  // phase is stopped, /clean is never checked, dod.json and the summary say so, enforce counts it,
  // and the exit code is the scored phase's.
  const dlDir = project(path.join(WORK, `${kind}-deadline`), kind, {
    "e2e/dod/routes.json": ["/busy-resize", "/clean"],
    "e2e/dod/standard.json": { ...STANDARD, coreUnit: undefined, checksMinutes: 0.5 },
  });
  const dl = await playwright(dlDir, port, { DOD_WORKERS: "1" });
  if (ranClean(dl, `${kind}: a run whose checks phase reaches its deadline exits 0 (the scored phase's code)`)) {
    const d = report(dlDir);
    const nc = d.standard?.not_checked;
    ok(
      Object.keys(nc?.reasons ?? {}).some((k) => k.includes("deadline")) && dl.log.includes("reached its deadline") && d.routes["/clean"]?.standard?.["help-door"]?.verdict === "errored" && d.routes["/clean"]?.score < 100,
      `${kind}: the checks deadline stops the phase, says which entries were not checked (${JSON.stringify(nc)}), and enforce counts them (/clean ${d.routes["/clean"]?.score})`,
    );
  }
  // Argos is optional: a token without the package stops the run with words.
  const dir2 = project(path.join(WORK, `${kind}-argos`), kind, { "e2e/dod/routes.json": ["/clean"] });
  let run2 = await playwright(dir2, port, { ARGOS_TOKEN: "fixture-token" });
  ok(
    run2.code !== 0 && run2.log.includes("ARGOS_TOKEN is set but @argos-ci/playwright is not installed"),
    `${kind}: ARGOS_TOKEN without @argos-ci/playwright stops the run with a clear message`,
  );
  // A remote backend stops the run, and the message names the host, never the password.
  run2 = await playwright(dir2, port, { DATABASE_URL: "postgres://user:fixture-secret@db.example.com:5432/app" });
  ok(
    run2.code !== 0 && run2.log.includes("DATABASE_URL (db.example.com:5432)") && !run2.log.includes("fixture-secret"),
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
    { route: "/", audience: "anonymous", static: true, noHelp: "the public landing page" },
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
    // Round 3: a check id under "enforce" fails in report mode too.
    { name: "state-coverage-enforced", files: { "e2e/dod/routes.json": full.filter((r) => r !== "/orders/1?state=error"), "e2e/dod/standard.json": { ...std, mode: "report", enforce: ["state-coverage"] } }, exit: 1, out: /state-coverage: \/orders\/1/ },
    // Round 4 (F2): one id list for both sides. A static id under "enforce" fails --check in report
    // mode; a page id is accepted and not enforced here; an unknown id is a configuration error.
    { name: "enforce-static-id", drop: ["src/help/orders-id.md"], files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": { ...std, mode: "report", enforce: ["help-route"] } }, exit: 1, out: /help-route: \/orders\/1 has no help file/ },
    { name: "enforce-page-id", files: { "e2e/dod/routes.json": full.filter((r) => r !== "/orders/1?state=error"), "e2e/dod/standard.json": { ...std, mode: "report", enforce: ["one-primary"] } }, exit: 0, out: /report mode: not failing/ },
    { name: "enforce-unknown", files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": { ...std, mode: "report", enforce: ["help-rout"] } }, exit: 1, out: /"enforce" must be a list of check ids/ },
    // Round 5 (CF2): the static checks crashing is a failure when they are enforced, a reported
    // error in report mode (the next scenario, standard-check-error).
    { name: "standard-check-error-enforce", files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": { ...std, helpDir: "PRODUCT.md" } }, exit: 1, out: /standard-check: could not run/ },
    { name: "help-route", check: "help-route", drop: ["src/help/orders-id.md"], files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 1, out: /help-route: \/orders\/1 has no help file src\/help\/orders-id/ },
    { name: "brand-assets", check: "brand-assets", files: { "PRODUCT.md": "# Product\n\n## Brand\n\nLogo: `public/missing.svg`.\n", "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 1, out: /brand-assets: .*public\/missing\.svg/ },
    // H1: a real route the scan cannot see is kept with its reason, never reported stale; a
    // blank reason fails; a write keeps it.
    { name: "listed", files: { "e2e/dod/routes.json": ["/", "/orders", "/orders/1", "/missing-page-sample"], "e2e/dod/route-params.json": { id: "1", _listed: { "/missing-page-sample": "the app's own not-found page, measured on purpose" } } }, exit: 0, out: /all covered/ },
    { name: "listed-blank", files: { "e2e/dod/routes.json": ["/", "/orders", "/orders/1", "/missing-page-sample"], "e2e/dod/route-params.json": { id: "1", _listed: { "/missing-page-sample": " " } } }, exit: 1, out: /_listed in route-params\.json have no reason/ },
    { name: "listed-write", args: [], files: { "e2e/dod/routes.json": ["/"], "e2e/dod/route-params.json": { id: "1", _listed: { "/missing-page-sample": "measured on purpose" } } }, exit: 0, out: /wrote/, after: (dir) => JSON.parse(fs.readFileSync(path.join(dir, "e2e/dod/routes.json"), "utf8")).includes("/missing-page-sample") },
    // Round 2, LOW 1: a _listed route missing from routes.json fails; one the scan finds again is reported.
    { name: "listed-missing", files: { "e2e/dod/routes.json": ["/", "/orders", "/orders/1"], "e2e/dod/route-params.json": { id: "1", _listed: { "/missing-page-sample": "measured on purpose" } } }, exit: 1, out: /under _listed are missing from e2e\/dod\/routes\.json/ },
    { name: "listed-refound", files: { "e2e/dod/routes.json": ["/", "/orders", "/orders/1"], "e2e/dod/route-params.json": { id: "1", _listed: { "/orders": "kept by hand once" } } }, exit: 0, out: /\/orders is under _listed but the scan finds it now/ },
    // Round 2, LOW 8: a public path and an "@/" path resolve where the app reads them.
    { name: "brand-paths", files: { "PRODUCT.md": "# Product\n\n## Brand\n\n`/logo.svg` and `@/assets/mark.svg`.\n", "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }', "src/assets/mark.svg": "<svg/>", "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 0, out: /0 finding\(s\)/ },
    // LOW: routes.mjs honours DOD_ROOT, run from another directory.
    { name: "dod-root", fromElsewhere: true, files: { "e2e/dod/routes.json": ["/", "/orders", "/orders/1"] }, exit: 0, out: /3 app routes, all covered/ },
    // M2: the heading may be "המותג", and code spans that are values are not paths.
    { name: "brand-hebrew", files: { "PRODUCT.md": "# Product\n\n## המותג\n\nהלוגו: `public/logo.svg`. הצבע: `--primary`, `#1d4ed8`, `tokens.ts`.\n", "e2e/dod/routes.json": full, "e2e/dod/standard.json": std }, exit: 0, out: /0 finding\(s\)/ },
    // LOW: a file the static checks cannot read is a reported finding, not a crash.
    { name: "standard-check-error", files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": { ...std, mode: "report", helpDir: "PRODUCT.md" } }, exit: 0, out: /standard-check: could not run/ },
    // M4: a coreUnit route that is not measured is a configuration error, in either mode.
    { name: "core-unit-route", files: { "e2e/dod/routes.json": full, "e2e/dod/standard.json": { ...std, mode: "report", coreUnit: { route: "/nowhere", selector: ".x", min: 1, viewport: [390, 700] } } }, exit: 1, out: /coreUnit\.route \/nowhere is not in routes\.json/ },
    { name: "both-directions", check: "both-directions", files: { "e2e/dod/routes.json": full.filter((r) => !String(r).includes("lang=en")), "e2e/dod/standard.json": std }, exit: 1, out: /both-directions: no route .* en/ },
  ];
  let cleanOut = "";
  for (const s of scenarios) {
    const dir = project(path.join(WORK, `${kind}-static`, s.name), kind, { ...base, ...s.files });
    for (const d of s.drop ?? []) fs.rmSync(path.join(dir, d));
    const r = spawnSync(process.execPath, [path.join(dir, "e2e/dod/routes.mjs"), ...(s.args ?? ["--check"])], {
      cwd: s.fromElsewhere ? os.tmpdir() : dir,
      env: { ...process.env, ...(s.fromElsewhere ? { DOD_ROOT: dir } : {}) },
      encoding: "utf8",
    });
    const out = r.stdout + r.stderr;
    if (s.name === "standard-clean") cleanOut = out;
    const fine = ok(
      r.status === s.exit && s.out.test(out) && !(s.not && s.not.test(out)) && (!s.after || s.after(dir)),
      `${kind}: routes.mjs ${s.args ? "(write)" : "--check"} ${s.name}: exit ${r.status} (want ${s.exit})`,
    );
    if (!fine) console.log(out.replace(/^/gm, "      "));
    if (s.check) {
      const others = (out.match(/dod-standard: ([a-z-]+):/g) ?? []).map((m) => m.slice(14, -1)).filter((c) => c !== s.check && c !== "deprecated");
      table.push({ kind, id: s.check, fixture: `static/${s.name}`, fired: fine && others.length === 0, onClean: null });
    }
  }
  for (const row of table.filter((t) => t.kind === kind && t.onClean === null)) row.onClean = cleanOut.includes(`dod-standard: ${row.id}:`);
}

// --- the DOM lane: stock markup, then one defect per check -------------------------------------
// standard-dom.ts transpiled and run straight in a page, without the DoD around it: fast enough
// to try every check on the real-markup pages at two widths, and once per injected defect.
const M = (html) => `document.querySelector("main").insertAdjacentHTML("beforeend", ${JSON.stringify(html)})`;
const DEFECTS = [
  ["help-door", "real-settings", 390, `document.querySelector('[data-help="door"]').remove()`],
  ["tooltip-only", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<button data-slot="button" class="size-9" title="ייצוא" aria-label="ייצוא"><svg width="16" height="16"></svg></button>')`],
  ["disabled-reason", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<button data-slot="button" class="border" disabled>שליחת תזכורת</button>')`],
  ["placeholder-label", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<input data-slot="input" name="city" autocomplete="address-level2" placeholder="עיר">')`],
  ["input-attrs", "real-shell", 390, `document.getElementById("sp").name = "phone"`],
  ["one-primary", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<button data-slot="button" class="bg-primary">ייבוא לקוחות</button>')`],
  ["nav-count", "real-table", 390, `document.querySelector("nav.bottom a").insertAdjacentHTML("beforeend", '<span style="position:absolute;top:8px;width:8px;height:8px;border-radius:4px;background:#b91c1c"></span>')`],
  ["empty-action", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<div data-state="empty"><p>עוד אין לקוחות.</p></div>')`],
  ["error-toast", "real-shell", 1440, `document.querySelector("[data-sonner-toaster]").insertAdjacentHTML("beforeend", '<li data-sonner-toast="" data-type="error">השמירה לא הצליחה.</li>')`],
  ["error-field", "real-shell", 1440, `document.getElementById("es").setAttribute("aria-invalid", "true")`],
  ["forbidden-words", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<p>נא למלא את כל השדות.</p>')`],
  ["state-coverage", "real-table", 1440, null, ["error"]],
  ["core-unit", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("afterbegin", '<div style="height:600px">ככה זה עובד</div>')`],
  ["probe", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<p style="font-size:10px">הערה קטנה</p>')`],
  // The reviewer's d-hidden cases (round 2): real defects that the first round's exemptions hid.
  ["disabled-reason", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<div class="row"><button type="button" data-slot="button" class="border" disabled>הבא</button></div>')`, null, "a wizard's lone disabled הבא"],
  ["disabled-reason", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<div role="grid" aria-label="משתתפים"><div role="row"><span role="gridcell">דנה כהן</span><span role="gridcell"><button type="button" data-slot="button" class="border" disabled>שליחת תזכורת</button></span></div></div>')`, null, "a disabled action in a grid row"],
  ["disabled-reason", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<div><label for="q">כמות</label><input id="q" type="number" name="qty" value="1" autocomplete="off" data-slot="input"><button type="button" data-slot="button" class="border" disabled>הוספה לסל</button></div>')`, null, "a disabled add-to-cart beside a number field"],
  ["placeholder-label", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<input data-slot="input" role="combobox" aria-expanded="false" aria-label="מדריכה" placeholder="מדריכה" name="instructor" autocomplete="off">')`, null, "a form combobox labelled only by its placeholder"],
  ["input-attrs", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<input data-slot="input" role="combobox" aria-expanded="false" aria-labelledby="ph-l" name="phone" type="text" autocomplete="off"><span id="ph-l">טלפון</span>')`, null, "a phone field built as a combobox"],
  ["forbidden-words", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<p>לחץ/י על הכפתור. בחר/י מדריך(ה) מהרשימה.</p>')`, null, "imperative slash and bracket gender forms"],
  ["forbidden-words", "real-table", 390, `document.querySelector("main").insertAdjacentHTML("beforeend", '<p>נָא לְמַלֵּא אֶת כָּל הַשָּׂדוֹת.</p>')`, null, "a forbidden word with niqqud"],
  ["tooltip-only", "real-table", 1440, `document.querySelector("main").insertAdjacentHTML("beforeend", '<div><h2>מחיקה</h2><div><span><button type="button" data-slot="button" class="size-9" title="מחיקה"><svg aria-hidden="true" width="16" height="16"></svg></button></span></div></div>')`, null, "an icon button whose title repeats a heading above it"],
  // Round 3: the reviewer's cases that the round-2 exemptions still passed.
  ["disabled-reason", "real-table", 390, M('<form><div class="row"><button type="button" data-slot="button" class="border">הקודם</button><button type="submit" data-slot="button" class="border" disabled>הבא</button></div></form>'), null, "a wizard mid-way: הבא disabled beside הקודם, in a form"],
  ["disabled-reason", "real-table", 390, M('<div><label for="q2">כמות</label><input id="q2" type="number" name="qty" value="1" autocomplete="off" data-slot="input"><button type="button" data-slot="button" class="size-9 border" aria-label="הוספה לסל" disabled><svg aria-hidden="true" width="16" height="16"></svg></button></div>'), null, "an icon-only הוספה לסל beside a quantity field"],
  ["disabled-reason", "real-table", 390, M('<div role="menu" aria-label="פעולות"><div role="menuitem" aria-disabled="true" data-disabled="" tabindex="-1">מחיקה - לצמיתות</div></div>'), null, "a menu item with one word after a dash"],
  ["disabled-reason", "real-table", 390, M('<div role="listbox" aria-label="שעות פנויות"><div role="option" aria-selected="false" aria-disabled="true">09:00 - 09:45</div><div role="option" aria-selected="false">10:00 - 10:45</div></div>'), null, "a time slot whose dash holds no words"],
  ["disabled-reason", "real-table", 390, M('<div cmdk-root=""><div cmdk-list=""><div cmdk-item="" role="option" aria-disabled="true" data-disabled="true">ייצוא (CSV)</div></div></div>'), null, "a command item with one word in brackets"],
  ["disabled-reason", "real-table", 390, M('<a role="link" aria-disabled="true" aria-current="false">דוח שנתי</a>'), null, 'aria-current="false" is not the current page'],
  ["disabled-reason", "real-nav-range", 390, `document.querySelector('[data-slot="carousel-item"] .card').insertAdjacentHTML("beforeend", '<button type="button" data-slot="button" class="border" disabled>הזמנת מקום</button>')`, null, "a disabled action inside a carousel slide"],
  ["tooltip-only", "real-table", 1440, M('<table><tr><td>עריכה אחרונה: אתמול</td><td><button type="button" data-slot="button" class="size-9" title="עריכה"><svg aria-hidden="true" width="16" height="16"></svg></button></td></tr></table>'), null, "an icon whose title is one word of the next cell"],
  // Round 4.
  ["disabled-reason", "real-form-controls", 390, M('<span dir="rtl" data-orientation="horizontal" aria-disabled="true" data-disabled="" data-slot="slider" style="display:flex;position:relative;width:200px;height:20px"><span data-slot="slider-track" style="flex-grow:1;height:6px;background:#eee"></span><span style="position:absolute;right:50%"><span role="slider" aria-label="עוצמה" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" data-disabled="" data-slot="slider-thumb" style="display:block;width:16px;height:16px;border:1px solid #000"></span></span></span>'), null, "a disabled Slider with no reason"],
  ["disabled-reason", "real-form-controls", 390, M('<button type="button" aria-pressed="false" data-state="off" data-slot="toggle" aria-label="קו תחתון" disabled data-disabled="" style="width:36px;height:36px"><svg aria-hidden="true" width="16" height="16"></svg></button>'), null, "a disabled icon Toggle with no reason"],
  ["tooltip-only", "real-form-controls", 390, M('<button type="button" aria-pressed="false" data-state="off" data-slot="toggle" aria-label="הדגשה" title="הדגשה (Ctrl+B)" style="width:36px;height:36px"><svg aria-hidden="true" width="16" height="16"></svg></button>'), null, "a Toggle with its shortcut only in its title"],
];
// Round 3: markup that looked like a defect to a round-2 check and is not one. Nothing may fire.
const CLEAN_CASES = [
  ["real-table", 390, M('<label for="lg">אימייל או שם משתמש</label><input data-slot="input" id="lg" name="login" autocomplete="username" placeholder="name@example.com">'), "a login field: autocomplete=username, label אימייל, a placeholder with @"],
  ["real-table", 390, M("<p>לזכר סבא משה ע.ה, ז.ל, נ.ב. הקובץ דוח.תשפו. אפשר לשלם במזומן ו/או בכרטיס.</p>"), "the abbreviations ע.ה, ז.ל and נ.ב, a file name, and ו/או"],
  // Round 4.
  ["real-form-controls", 390, M('<span class="rdp-dropdown_root" style="position:relative;display:inline-flex"><select class="rdp-dropdown" aria-label="בחירת חודש" name="months" style="position:absolute;inset:0;opacity:0"><option value="10">נוב׳</option><option value="11">דצמ׳</option></select><span class="rdp-caption_label" aria-hidden="true" style="display:flex;height:32px;align-items:center;font-size:14px">נוב׳<svg aria-hidden="true" width="16" height="16"></svg></span></span>'), "a Calendar dropdown caption (an invisible native select over its label)"],
  ["real-form-controls", 390, M('<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-slot="button" class="border" disabled>הקודם</button><button type="button" data-slot="button" class="border">הבא</button></div>'), "a data-table pager outside a form, הקודם disabled"],
  ["real-form-controls", 390, M('<section aria-label="Notifications alt+T" tabindex="-1" aria-live="polite" aria-relevant="additions text" aria-atomic="false"><ol dir="rtl" tabindex="-1" data-sonner-toaster="true" data-theme="light" data-y-position="bottom" data-x-position="right" style="position:fixed;bottom:24px;right:24px;list-style:none;margin:0;padding:0"><li tabindex="0" data-sonner-toast="" data-styled="true" data-mounted="true" data-type="success" data-visible="true" style="display:flex;gap:8px;padding:12px;border:1px solid #ddd;background:#fff;font-size:14px"><div data-content=""><div data-title="">התור נקבע</div><div data-description="">יום ראשון, 08:00</div></div><button data-button="true" data-action="true" style="height:24px;font-size:12px">ביטול</button></li></ol></section>'), "a Sonner success toast with an action"],
  ["real-form-controls", 390, M('<div role="menu" aria-label="פעולות"><div role="menuitem" aria-disabled="true" data-disabled="" aria-describedby="why-m">ייצוא</div></div><p id="why-m">ייצוא זמין למנהלים בלבד.</p>'), "a disabled menu item whose reason is a linked line"],
];
async function domLane(port) {
  const req = createRequire(path.join(WORK, "package.json"));
  const ts = req("typescript");
  const { chromium } = req("@playwright/test");
  const js = ts
    .transpileModule(fs.readFileSync(DOM_SRC, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
    .outputText.replace(/^export\s+/gm, "");
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-dev-shm-usage"] });
  const runOn = async (pageName, width, mutate, expectState) => {
    const height = width <= 480 ? 700 : 900;
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(`http://localhost:${port}/${pageName}`, { waitUntil: "load" });
      if (mutate) await page.evaluate(mutate);
      await page.addScriptTag({ content: `${js}\nwindow.__std = { domChecks, probeAt, coreUnitVisible, BUILT_IN_FORBIDDEN };` });
      return await page.evaluate(
        ({ phone, width, expectState, core }) => {
          const std = window.__std;
          const a = { noHelp: null, helpDoor: true, navCount: width === 375 || width === 390, phone, forbidden: std.BUILT_IN_FORBIDDEN, expectState };
          const res = std.domChecks(a);
          const fired = Object.entries(res).filter(([, c]) => c.count > 0).map(([id]) => id);
          const errors = Object.entries(res).filter(([, c]) => c.error).map(([id, c]) => `${id}: ${c.error}`);
          const pr = std.probeAt(12);
          if (pr.overflow || pr.small_text.count || pr.broken_words.count) fired.push("probe");
          if (core && std.coreUnitVisible("tr.tr") < 3) fired.push("core-unit");
          const samples = Object.entries(res).filter(([, c]) => c.count > 0).map(([id, c]) => `${id}: ${c.samples.slice(0, 2).join(" | ")}`);
          return { fired: fired.sort(), errors, samples };
        },
        { phone: width <= 480, width, expectState: expectState ?? null, core: pageName === "real-table" && width <= 480 },
      );
    } finally {
      await page.close();
    }
  };
  const onClean = {};
  try {
    for (const p of LANE_PAGES)
      for (const w of [375, 390, 1440]) {
        const r = await runOn(p, w, null, null);
        onClean[`${p}@${w}`] = r.fired;
        ok(r.fired.length === 0 && r.errors.length === 0, `dom: no check fires on ${p}.html at ${w} (${r.fired.join(",") || "none"}${r.errors.length ? `; errors ${r.errors}` : ""})`);
        if (r.fired.length) console.log(r.samples.map((x) => `      ${x}`).join("\n"));
      }
    for (const [id, p, w, mutate, expectState, what] of DEFECTS) {
      const r = await runOn(p, w, mutate, expectState);
      const exact = r.fired.length === 1 && r.fired[0] === id;
      ok(exact, `dom: one ${id} defect${what ? ` (${what})` : ""} in ${p}.html at ${w} fires exactly ${id} (${r.fired.join(",") || "none"})`);
      table.push({ kind: "dom", id, fixture: `${p}.html + ${what ?? "one defect"}`, fired: exact, onClean: (onClean[`${p}@${w}`] ?? []).includes(id) });
    }
    for (const [p, w, mutate, what] of CLEAN_CASES) {
      const r = await runOn(p, w, mutate, null);
      ok(r.fired.length === 0 && r.errors.length === 0, `dom: nothing fires on ${p}.html at ${w} with ${what} (${r.fired.join(",") || "none"})`);
      if (r.fired.length) console.log(r.samples.map((x) => `      ${x}`).join("\n"));
    }
  } finally {
    await browser.close();
  }
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
if (SUITES.has("static")) for (const kind of KINDS) staticSuite(kind);
if (!SKIP_BROWSER) {
  const server = await startServer();
  const port = server.address().port;
  try {
    if (SUITES.has("dom")) await domLane(port);
    for (const kind of KINDS) {
      if (SUITES.has("browser")) await browserSuite(kind, port);
      if (SUITES.has("small")) await smallRuns(kind, port);
    }
  } finally {
    server.close();
  }
}

console.log("\n| run | check id | fixture | fired | fired on the clean page |\n|---|---|---|---|---|");
for (const t of table)
  console.log(
    t.real
      ? `| ${t.kind} | ${t.id} | ${t.fixture} | ${t.fired ? "YES" : "none, as required"} | - |`
      : `| ${t.kind} | ${t.id} | ${t.fixture} | ${t.fired ? "yes" : "NO"} | ${t.onClean ? "YES" : "no"} |`,
  );
console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
