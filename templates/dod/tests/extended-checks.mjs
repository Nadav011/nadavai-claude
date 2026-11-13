#!/usr/bin/env node
// Fixture tests of the extended checks (e2e/dod/a11y-extended.ts and consent-checks.ts, run by
// extended-checks.spec.ts). Not copied into projects; kept apart from run.mjs so the two can
// change without touching each other.
//
//   heavy-slot -- node templates/dod/tests/extended-checks.mjs [--skip-browser] [--skip-run] [--only-phase]
//
// 1. tsc --noEmit (strict) on the new files and the config, with the kit's own settings.
// 2. CASES: each check on its fixture pages (tests/fixtures/extended/<page>.html), each of which must
//    make it find exactly the kinds listed (and, for consent, the notes); pass.html and clean.html
//    hold the cases each check must not report, so an exemption is tested by a page that needs it.
// 3. Mutants: each condition of the checks is one line marked `// M:<code>` (a copy of its module
//    without that line), and each threshold or operator a line deletion cannot reach has a
//    replacement mutant (REPLACE); each must change the result of the page named beside it.
// 4. The checks phase of a real `run-dod.mjs` run on three of the pages (the spec writes its files),
//    and the deadline: run-dod.mjs in enforce mode with checksMinutes 0.6, with and without the
//    spec, must write the same dod.json (times aside), since the extended checks run last.
// Dependencies come from tests/package.json in DOD_TEST_WORKDIR (default <tmpdir>/dod-template-tests),
// never the repo; every project and mutant of a run gets its own new directory inside it. One Chromium
// at a time; the fixture server listens on 127.0.0.1, port DOD_A11Y_PORT, or a free one in 20000-32000.
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
const FIXED_PORT = process.env.DOD_A11Y_PORT ? Number(process.env.DOD_A11Y_PORT) : null;
const args = process.argv.slice(2);

if (!path.relative(REPO, WORK).startsWith("..")) {
  console.error(`DOD_TEST_WORKDIR ${WORK} is inside the repo; choose a directory outside it.`);
  process.exit(2);
}
if (FIXED_PORT !== null && !(FIXED_PORT > 0 && FIXED_PORT < 32768)) {
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
/** A new directory of this run inside WORK, where node_modules resolves. */
const fresh = (name) => fs.mkdtempSync(path.join(WORK, `${name}-`));

// --- what each fixture page must make its check find ---------------------------------------
// [check, page, kinds, notes, reads]; kinds "write-held" counts at least one (the walk's exact number
// of focus and blur events is the browser's). On every page no /save reaches the server, the context's
// close included; `reads` is a page whose own POST while it loads (/read) must reach it and never be
// held. The save-* pages are the second review's B1 and B2: a page that saves on leaving, a service
// worker that forwards, a popup, a SharedWorker.
const CASES = [
  ["forced-colors", "forced-colors", { boundary: 5, focus: 1, state: 1, mark: 1 }],
  ["forced-colors", "pass", {}],
  ["forced-colors", "clean", {}],
  ["forced-colors", "save-on-focus", { "write-held": "1+" }],
  ["forced-colors", "save-on-leave", {}],
  ["forced-colors", "save-via-sw", { "write-held": "1+" }],
  ["forced-colors", "save-in-popup", { "write-held": "1+" }],
  ["forced-colors", "save-in-shared-worker", {}],
  ["forced-colors", "reads-on-load", {}, 0, true],
  ["text-reflow", "save-on-leave", {}],
  ["text-reflow", "text-reflow", { clipped: 3, unreachable: 1, sideways: 1 }],
  ["text-reflow", "text-reflow-cut", { unreachable: 1 }],
  ["text-reflow", "text-reflow-ltr", { unreachable: 1 }],
  ["text-reflow", "text-reflow-table", {}],
  // WCAG's Understanding Reflow, Figure 9: paragraphs widened to a table's width are not the exception.
  ["text-reflow", "text-reflow-fig9", { sideways: 1 }],
  // Not the exception (the second review, C8): a layout table, and role="application" on the app's root.
  ["text-reflow", "text-reflow-layout-table", { sideways: 1 }],
  ["text-reflow", "text-reflow-presentation", { sideways: 1 }],
  ["text-reflow", "text-reflow-application", { sideways: 1 }],
  ["text-reflow", "pass", {}],
  ["text-reflow", "clean", {}],
  ["text-spacing", "text-spacing", { clipped: 2, overlap: 2 }],
  ["text-spacing", "pass", {}],
  ["text-spacing", "clean", {}],
  ["consent", "consent", { prechecked: 4, "no-refuse": 2, "weak-refuse": 5 }],
  ["consent", "pass", {}, 1],
  ["consent", "consent-dark", {}],
  ["consent", "clean", {}],
];
const caseOf = (id, page) => CASES.find(([c, p]) => c === id && p === page);
// Each marked condition: the check it belongs to, and the page whose result must change without it.
// Not marked, with the reason: the walk's `break` when focus comes back to the start (`continue` there
// ends the walk the same way, at FOCUS_STEPS), and forced-color-adjust:none on a state pair (its
// colours stay, so the pair still differs; the line only saves work).
const MUTANTS = {
  "vis-opacity": ["forced-colors", "pass"],
  "state-differs": ["forced-colors", "pass"],
  "mark-size": ["forced-colors", "pass"],
  "mark-bgeq": ["forced-colors", "pass"],
  "mark-words": ["forced-colors", "pass"],
  "boundary-fca": ["forced-colors", "pass"],
  "boundary-native": ["forced-colors", "pass"],
  "boundary-wrap": ["forced-colors", "pass"],
  boundary: ["forced-colors", "forced-colors"],
  state: ["forced-colors", "forced-colors"],
  mark: ["forced-colors", "forced-colors"],
  focus: ["forced-colors", "forced-colors"],
  guard: ["forced-colors", "save-on-focus"],
  "guard-loading": ["forced-colors", "reads-on-load"],
  "shared-worker": ["forced-colors", "save-in-shared-worker"],
  "layout-role": ["text-reflow", "text-reflow-presentation"],
  "layout-table": ["text-reflow", "text-reflow-layout-table"],
  "sideways-edge": ["text-reflow", "text-reflow-table"],
  "two-d": ["text-reflow", "text-reflow-table"],
  "two-d-wrap": ["text-reflow", "text-reflow-table"],
  sideways: ["text-reflow", "text-reflow"],
  "text-sronly": ["text-reflow", "pass"],
  "text-carousel": ["text-reflow", "pass"],
  "body-skip": ["text-reflow", "text-reflow-cut"],
  scroller: ["text-reflow", "pass"],
  "text-hidden": ["text-reflow", "pass"],
  clipped: ["text-reflow", "text-reflow"],
  unreachable: ["text-reflow", "text-reflow"],
  overlap: ["text-spacing", "text-spacing"],
  "spacing-new": ["text-spacing", "pass"],
  prechecked: ["consent", "consent"],
  necessary: ["consent", "pass"],
  form: ["consent", "pass"],
  "no-refuse": ["consent", "consent"],
  "weak-area": ["consent", "consent"],
  "weak-font": ["consent", "consent"],
  "weak-contrast": ["consent", "consent"],
  "bg-image": ["consent", "pass"],
  composite: ["consent", "consent"],
  note: ["consent", "pass"],
  "weak-refuse": ["consent", "consent"],
};
// [name, module, text, replacement, check, page]: the text must occur exactly once in the module.
const REPLACE = [
  ["focus-steps-1", "a11y", "export const FOCUS_STEPS = 25;", "export const FOCUS_STEPS = 1;", "forced-colors", "forced-colors"],
  ["focus-margin-0", "a11y", "export const FOCUS_MARGIN = 6;", "export const FOCUS_MARGIN = 0;", "forced-colors", "pass"],
  ["mark-min-0", "a11y", "Math.min(r.width, r.height) < 3", "Math.min(r.width, r.height) < 0", "forced-colors", "pass"],
  ["mark-max-inf", "a11y", "Math.max(r.width, r.height) > 600", "Math.max(r.width, r.height) > 1e9", "forced-colors", "pass"],
  ["wrap-16-to-1000", "a11y", "w.width - r.width > 16 || w.height - r.height > 16", "w.width - r.width > 1000 || w.height - r.height > 1000", "forced-colors", "forced-colors"],
  ["wrap-levels-0", "a11y", "a && i < 2; a = a.parentElement", "a && i < 0; a = a.parentElement", "forced-colors", "pass"],
  ["border-ge0", "a11y", "`border-${d.toLowerCase()}-width`)) >= 1", "`border-${d.toLowerCase()}-width`)) >= 0", "forced-colors", "forced-colors"],
  ["outline-ge100", "a11y", "parseFloat(s.outlineWidth) >= 1", "parseFloat(s.outlineWidth) >= 100", "forced-colors", "pass"],
  ["opacity-off", "consent", "o *= parseFloat(getComputedStyle(a).opacity);", "o *= 1;", "consent", "consent"],
  ["canvas-white", "consent", "(under, top) => over(top, under), canvasBase)", "(under, top) => over(top, under), [255, 255, 255, 1])", "consent", "consent-dark"],
  ["application-exempt", "a11y", "[role=\"img\"]';", "[role=\"img\"], [role=\"application\"]';", "text-reflow", "text-reflow-application"],
  ["guard-lets-post", "a11y", 'export const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];', 'export const SAFE_METHODS = ["GET", "HEAD", "OPTIONS", "POST"];', "forced-colors", "save-on-focus"],
  ["reflow-320-to-360", "a11y", "{ width: 320, height: 256, sideways: true }", "{ width: 360, height: 256, sideways: true }", "text-reflow", "text-reflow"],
  ["reflow-640-to-1280", "a11y", "{ width: 640, height: 512, sideways: false }", "{ width: 1280, height: 512, sideways: false }", "text-reflow", "text-reflow"],
  ["clip-tolerance-50", "a11y", "(clipX && (u.left < box.left - 1 || u.right > box.right + 1))", "(clipX && (u.left < box.left - 50 || u.right > box.right + 50))", "text-reflow", "text-reflow"],
  ["sideways-tolerance-1000", "a11y", "r.right > w + 1 || r.left < -1", "r.right > w + 1000 || r.left < -1000", "text-reflow", "text-reflow"],
  ["past-tolerance-1000", "a11y", "const pastRight = u.right > w + 1 && u.left < w;", "const pastRight = u.right > w + 1000 && u.left < w;", "text-reflow", "text-reflow-ltr"],
  ["pastright-rtl-only", "a11y", "(pastRight && (rtl || !pageScrolls))", "(pastRight && rtl)", "text-reflow", "text-reflow-ltr"],
  ["pastleft-ltr-only", "a11y", "(pastLeft && (!rtl || !pageScrolls))", "(pastLeft && !rtl)", "text-reflow", "text-reflow-cut"],
  ["root-hidden-scrolls", "a11y", '![cs(document.documentElement).overflowX, cs(document.body).overflowX].some((o) => o === "hidden" || o === "clip")', "true", "text-reflow", "text-reflow-ltr"],
  ["overlap-gt100", "a11y", "Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1", "Math.min(p.right, q.right) - Math.max(p.left, q.left) > 100 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 100", "text-spacing", "text-spacing"],
  ["spacing-letter-0", "a11y", "letter-spacing: 0.12em !important;", "letter-spacing: 0em !important;", "text-spacing", "text-spacing"],
  ["spacing-lineheight-1", "a11y", "line-height: 1.5 !important;", "line-height: 1 !important;", "text-spacing", "text-spacing"],
  ["spacing-paragraph-0", "a11y", "p { margin-block-end: 2em !important; }", "", "text-spacing", "text-spacing"],
  ["area-0.05", "consent", "area: 0.5,", "area: 0.05,", "consent", "consent"],
  ["font-0.5", "consent", "font: 0.85,", "font: 0.5,", "consent", "consent"],
  ["contrast-2", "consent", "contrast: 4.5 }", "contrast: 2 }", "consent", "consent"],
  ["strong-every", "consent", "judged.some((j) => j.ok && j.known)", "judged.every((j) => j.ok && j.known)", "consent", "pass"],
  ["box-depth-1", "consent", "a !== document.body && i < 6;", "a !== document.body && i < 1;", "consent", "consent"],
  ["request-no-strip", "consent", 't.replace(label(yes), "")', "t", "consent", "pass"],
  ["locked-any", "consent", "if (locked && NECESSARY.test(name))", "if (NECESSARY.test(name))", "consent", "consent"],
  ["label-box-off", "consent", ' && !(el instanceof HTMLInputElement && vis(el.closest("label")))', "", "consent", "consent"],
  ["aria-checked-off", "consent", 'el.getAttribute("aria-checked") === "true" || ', "", "consent", "consent"],
  ["refuse-no-cancel", "consent", "|אחר כך|ביטול|", "|אחר כך|", "consent", "pass"],
  ["refuse-no-decline-all", "consent", "|decline|decline all|", "|decline|", "consent", "pass"],
  ["refuse-no-curly", "consent", '.replace(/[’‘]/g, "\'")', "", "consent", "pass"],
  ["consent-any-updates", "consent", '(לקבל|קבלת) עדכונים|עדכונים (ב|ל)?(מייל|אימייל|דוא"ל|sms|הודעות|וואטסאפ|ווטסאפ)', "עדכונים", "consent", "pass"],
];
// Which module and function each check is; consent runs both consent checks and sums them.
const RUN = {
  "forced-colors": ["a11y", (mods, p, guard) => mods.a11y.forcedColorsCheck(p, guard)],
  "text-reflow": ["a11y", (mods, p, guard) => mods.a11y.textReflowCheck(p, guard)],
  "text-spacing": ["a11y", (mods, p, guard) => mods.a11y.textSpacingCheck(p, guard)],
  consent: [
    "consent",
    async (mods, p, guard) => {
      guard.watch(p, "the page was read");
      const r = Object.values(await mods.consent.consentChecks(p));
      return { count: r.reduce((n, x) => n + x.count, 0), kinds: Object.assign({}, ...r.map((x) => x.kinds)), samples: r.flatMap((x) => x.samples), notes: r.flatMap((x) => x.notes ?? []) };
    },
  ],
};

/** How a result differs from its case, or "" when it is the case. */
function differs(r, kase, posts) {
  const [, , kinds, notes = 0, reads = false] = kase;
  const saves = posts.filter((p) => p.includes("/save"));
  if (saves.length) return `writes reached the server: ${saves.join(", ")}`;
  if (reads && !posts.some((p) => p.includes("/read"))) return "the page's read while it loads did not reach the server";
  if (r.samples.some((s) => s.includes("/read"))) return `a read while the page loaded was held: ${r.samples.join(" | ")}`;
  const want = Object.entries(kinds);
  if (Object.keys(r.kinds).length !== want.length) return `kinds ${JSON.stringify(r.kinds)} != ${JSON.stringify(kinds)}`;
  for (const [k, n] of want) {
    const got = r.kinds[k] ?? 0;
    if (n === "1+" ? got < 1 : got !== n) return `kinds ${JSON.stringify(r.kinds)} != ${JSON.stringify(kinds)}`;
  }
  if ((r.notes ?? []).length !== notes) return `notes ${JSON.stringify(r.notes ?? [])}, want ${notes}`;
  return "";
}

// --- the fixture server: pages by name, and a log of every write that reached it ----------
function serve(port) {
  const posts = [];
  const times = [];
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      posts.push(`${req.method} ${req.url}`);
      times.push(Date.now());
      req.resume();
      res.writeHead(204);
      return res.end();
    }
    const name = path.basename(new URL(req.url, "http://x").pathname.replace(/\/$/, "/clean")) || "clean";
    const script = path.join(FIXTURES, name);
    if (name.endsWith(".js") && fs.existsSync(script)) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      return res.end(fs.readFileSync(script));
    }
    const file = path.join(FIXTURES, `${name}.html`);
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return res.end('<!doctype html><html lang="he" dir="rtl"><body><main><h1>הדף לא נמצא</h1></main></body></html>');
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, posts, times, port }));
  });
}
async function serveFree() {
  if (FIXED_PORT !== null) return serve(FIXED_PORT);
  for (let i = 0; ; i++) {
    try {
      return await serve(20000 + Math.floor(Math.random() * 12000));
    } catch (err) {
      if (err.code !== "EADDRINUSE" || i >= 20) throw err;
    }
  }
}
const close = (s) => new Promise((r) => s.server.close(r));

function typecheck() {
  const dir = fresh("a11y-tsc");
  fs.mkdirSync(path.join(dir, "e2e"), { recursive: true });
  fs.cpSync(path.join(TEMPLATE, "e2e", "dod"), path.join(dir, "e2e", "dod"), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE, "playwright.dod.config.ts"), path.join(dir, "playwright.dod.config.ts"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "a11y-tsc", private: true, type: "module" }));
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true, skipLibCheck: true, lib: ["es2023", "dom", "dom.iterable"], types: ["node"] },
      include: ["e2e/dod/a11y-extended.ts", "e2e/dod/consent-checks.ts", "e2e/dod/extended-checks.spec.ts", "playwright.dod.config.ts"],
    }),
  );
  const r = spawnSync(process.execPath, [path.join(WORK, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" });
  ok(r.status === 0, "tsc --noEmit (strict) on a11y-extended.ts, consent-checks.ts, extended-checks.spec.ts and playwright.dod.config.ts", (r.stdout + r.stderr).slice(0, 1500));
}

/** A copy of the module with `edit` applied, in a new directory of WORK (outside the repo). */
function mutantFile(module, name, edit) {
  const dir = fresh(`extended-mutant-${name}`);
  fs.writeFileSync(path.join(dir, "package.json"), '{ "type": "module" }');
  const file = path.join(dir, path.basename(MODULES[module]));
  fs.writeFileSync(file, edit(fs.readFileSync(MODULES[module], "utf8")));
  return file;
}
const withoutLine = (code) => (src) => {
  const lines = src.split("\n");
  const keep = lines.filter((l) => !l.trimEnd().endsWith(`// M:${code}`));
  if (lines.length - keep.length !== 1) throw new Error(`${lines.length - keep.length} lines marked M:${code}, not one`);
  return keep.join("\n");
};
const replaced = (from, to) => (src) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`the text to replace occurs ${n} times, not once: ${from}`);
  return src.replace(from, () => to);
};

async function browserTests() {
  const { chromium } = await import(pathToFileURL(path.join(WORK, "node_modules", "@playwright", "test", "index.mjs")).href);
  const real = { a11y: await import(pathToFileURL(MODULES.a11y).href), consent: await import(pathToFileURL(MODULES.consent).href) };
  const srv = await serveFree();
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-dev-shm-usage"] });
  // One check on one page, as the spec runs it: a context with the write guard and service workers
  // blocked, a new page marked loading, the check, 500 ms, the writes the guard held added as
  // `write-held`; the page is never closed, the context is, and what reached the server is read after.
  const check = async (mods, id, page) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "he-IL", serviceWorkers: "block" });
    const before = srv.posts.length;
    let r;
    try {
      const guard = await mods.a11y.installWriteGuard(ctx);
      const p = await ctx.newPage();
      guard.loading(p);
      await p.goto(`http://127.0.0.1:${srv.port}/${page}`);
      await p.waitForLoadState("networkidle").catch(() => {});
      r = await RUN[id][1](mods, p, guard);
      await new Promise((res) => setTimeout(res, 500));
      r = mods.a11y.withHeld(r, guard.take());
    } finally {
      await ctx.close();
    }
    await new Promise((res) => setTimeout(res, 300));
    return { r, posts: srv.posts.slice(before) };
  };
  try {
    for (const kase of CASES) {
      const [id, page, kinds, notes = 0] = kase;
      const { r, posts } = await check(real, id, page);
      const why = differs(r, kase, posts);
      ok(!why, `${id} on ${page}.html finds ${JSON.stringify(kinds)}${notes ? ` and ${notes} note` : ""}`, `${why}; ${JSON.stringify(r)}`);
      console.log(`       ${id} on ${page}.html: ${JSON.stringify({ kinds: r.kinds, notes: r.notes, samples: r.samples.slice(0, 3) })}${posts.length ? ` posts ${posts.join(", ")}` : ""}`);
      if (id === "text-reflow" && page === "text-reflow-fig9") ok(r.samples.some((s) => /sideways: .*widest <p> /.test(s)), "Figure 9: the sideways finding names the widened paragraph, not the table", JSON.stringify(r.samples));
      if (id === "text-reflow" && page === "text-reflow") ok(r.samples.some((s) => /sideways: .*widest <div> "טבלה רחבה" 500px/.test(s)), "the sideways finding names the widest element", JSON.stringify(r.samples));
    }
    const mutants = [
      ...Object.entries(MUTANTS).map(([code, [id, page]]) => [`M:${code}`, RUN[id][0], withoutLine(code), id, page]),
      ...REPLACE.map(([name, module, from, to, id, page]) => [`R:${name}`, module, replaced(from, to), id, page]),
    ];
    const marked = Object.fromEntries(Object.entries(MODULES).map(([m, f]) => [m, [...fs.readFileSync(f, "utf8").matchAll(/\/\/ M:([\w-]+)\s*$/gm)].map((x) => x[1])]));
    const listed = new Set(Object.keys(MUTANTS));
    const unlisted = Object.values(marked).flat().filter((c) => !listed.has(c));
    ok(!unlisted.length, "every // M: line of the two modules has a mutant here", `not listed: ${unlisted.join(", ")}`);
    for (const [name, module, edit, id, page] of mutants) {
      let file;
      try {
        file = mutantFile(module, name.replace(/[^\w-]/g, "_"), edit);
      } catch (err) {
        ok(false, `${id}: mutant ${name}`, err.message);
        continue;
      }
      const mod = await import(pathToFileURL(file).href);
      const { r, posts } = await check({ ...real, [module]: mod }, id, page);
      const why = differs(r, caseOf(id, page), posts);
      ok(!!why, `${id}: the mutant ${name} fails the ${page}.html case`, `the mutant still gives ${JSON.stringify(r.kinds)}`);
      console.log(`       mutant ${name} on ${page}.html: ${why}`);
    }
  } finally {
    await browser.close();
    await close(srv);
  }
}

/** A throwaway project with the kit copied in, unmodified, and anonymous fixture routes. */
function project(name, routes, std, withSpec = true) {
  const dir = fresh(name);
  fs.mkdirSync(path.join(dir, "e2e"), { recursive: true });
  fs.cpSync(path.join(TEMPLATE, "e2e", "dod"), path.join(dir, "e2e", "dod"), { recursive: true });
  if (!withSpec) fs.rmSync(path.join(dir, "e2e", "dod", "extended-checks.spec.ts"));
  fs.copyFileSync(path.join(TEMPLATE, "playwright.dod.config.ts"), path.join(dir, "playwright.dod.config.ts"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module" }));
  fs.writeFileSync(path.join(dir, "e2e", "dod", "routes.json"), JSON.stringify(routes.map((r) => ({ route: r, audience: "anonymous", static: true, noHelp: "a fixture page" })), null, 2));
  fs.writeFileSync(path.join(dir, "e2e", "dod", "standard.json"), JSON.stringify(std));
  return dir;
}
function runDod(dir, port) {
  const env = { ...process.env, PORT: String(port), DOD_WORKERS: "1", DOD_USER: "", DOD_PASSWORD: "" };
  delete env.CI;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, "e2e", "dod", "run-dod.mjs"), "--reporter=line"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("exit", (c) => {
      fs.writeFileSync(path.join(dir, "run.log"), log);
      resolve(c);
    });
  });
}
const ROUTES = ["/clean", "/forced-colors", "/consent"];
// The phase run also takes the pages that try to save (the second review's C7): the spec's own guard
// wiring, end to end. Only the extended checks switch forced colours on or press Tab, but the other
// phases navigate, which runs save-on-leave.html's pagehide handlers: so the server must get no /save
// from the moment the extended checks start (2 s after the last standard result is written).
// save-in-shared-worker.html is tested in the browser cases only: the scored phase (dod.spec.ts, not
// these checks) times out on a page that starts a SharedWorker (all four entries, 120 s each).
const SAVE_ROUTES = ["/save-on-focus", "/save-on-leave", "/save-via-sw", "/save-in-popup", "/reads-on-load"];
const IDS = ["forced-colors", "text-reflow", "text-spacing", "consent-prechecked", "consent-refuse"];
const sum = (kinds) => Object.values(kinds).reduce((a, b) => a + b, 0);

/** The checks phase of a real run: run-dod.mjs on a throwaway project with three anonymous routes. */
async function phaseTest() {
  const srv = await serveFree();
  try {
    const dir = project("extended-run", [...ROUTES, ...SAVE_ROUTES], { profile: "work-tool" });
    const code = await runDod(dir, srv.port);
    const resDir = path.join(dir, "reports", "dod", "results");
    const extStart = Math.max(0, ...fs.readdirSync(resDir).filter((f) => f.endsWith(".standard.json")).map((f) => fs.statSync(path.join(resDir, f)).mtimeMs)) + 2000;
    const saves = srv.posts.filter((p, i) => p.includes("/save") && srv.times[i] >= extStart);
    const savesBefore = srv.posts.filter((p, i) => p.includes("/save") && srv.times[i] < extStart).length;
    const reads = srv.posts.filter((p) => p.includes("/read"));
    const out = path.join(dir, "reports", "dod", "results", "extended");
    const read = (slug) => (fs.existsSync(path.join(out, `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join(out, `${slug}.json`), "utf8")) : null);
    const clean = read("clean");
    const forced = read("forced-colors");
    const consent = read("consent");
    const log = fs.readFileSync(path.join(dir, "run.log"), "utf8");
    console.log(log.split("\n").filter((l) => l.includes("[dod] extended")).map((l) => `       ${l.trim()}`).join("\n"));
    ok(code === 0, "run-dod.mjs exits 0 (the scored phase's code; these checks only report)", `exit ${code}; log in ${dir}/run.log`);
    ok(clean && IDS.every((id) => clean.checks[id] && !clean.checks[id].error && clean.checks[id].count === 0), "the checks phase writes results/extended/clean.json: all five clean", JSON.stringify(clean));
    const fc = caseOf("forced-colors", "forced-colors")[2];
    ok(forced && forced.checks["forced-colors"].count === sum(fc) && !forced.checks["forced-colors"].error, `and forced-colors.json with its ${sum(fc)} forced-colours findings`, JSON.stringify(forced && forced.checks["forced-colors"]));
    const cc = caseOf("consent", "consent")[2];
    ok(consent && consent.checks["consent-prechecked"].count === cc.prechecked && consent.checks["consent-refuse"].count === cc["no-refuse"] + cc["weak-refuse"], `and consent.json with ${cc.prechecked} boxes on at load and ${cc["no-refuse"] + cc["weak-refuse"]} refuse findings`, JSON.stringify(consent && [consent.checks["consent-prechecked"], consent.checks["consent-refuse"]]));
    // The order, from the files each writes: every standard result before the first extended one.
    const res = path.join(dir, "reports", "dod", "results");
    const mt = (d, f) => fs.statSync(path.join(d, f)).mtimeMs;
    const std = fs.readdirSync(res).filter((f) => f.endsWith(".standard.json")).map((f) => mt(res, f));
    const ext = fs.existsSync(out) ? fs.readdirSync(out).map((f) => mt(out, f)) : [];
    ok(std.length > 0 && ext.length === ROUTES.length + SAVE_ROUTES.length && Math.min(...ext) >= Math.max(...std), "the extended checks run after every standard check (their own project, the checks project's teardown)", `standard results ${std.length}, last at ${Math.max(...std)}; extended ${ext.length}, first at ${Math.min(...ext)}`);
    // The guard, through the spec's own path (B1, B2, C7).
    ok(!saves.length, `no /save reached the server while the extended checks ran: the check pages are never closed, service workers are blocked, popups' and workers' writes are held (${savesBefore} came earlier, from the other phases' navigations)`, saves.join(", "));
    const held = (slug) => {
      const j = read(slug);
      return j ? IDS.reduce((n, id) => n + (j.checks[id]?.kinds?.["write-held"] ?? 0), 0) : -1;
    };
    for (const slug of ["save-on-focus", "save-via-sw", "save-in-popup"]) ok(held(slug) >= 1, `${slug}.json records the writes the guard held (write-held ${held(slug)})`, JSON.stringify(read(slug)));
    for (const slug of ["save-on-leave", "reads-on-load"]) ok(held(slug) === 0 && IDS.every((id) => !read(slug)?.checks[id]?.error), `${slug}.json: nothing to hold, no check errored`, JSON.stringify(read(slug)));
    const all = [...ROUTES, ...SAVE_ROUTES].map((r) => read(r.slice(1))).filter(Boolean);
    ok(reads.length > 0 && !all.some((j) => IDS.some((id) => (j.checks[id]?.samples ?? []).some((x) => x.includes("/read")))), `a page's own POST while it loads passes the guard (${reads.length} reads reached the server, none held)`, `reads ${reads.length}`);
    const dod = JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "dod.json"), "utf8"));
    // No key of dod.json is one of these check ids (a route named /forced-colors is a route, "/forced-colors").
    const keys = new Set();
    const walk = (o) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (keys.add(k), walk(v));
    };
    walk(dod);
    const leaked = [...IDS, "extended", "write-held"].filter((id) => keys.has(id));
    ok(!leaked.length && dod.totals && typeof dod.totals.score === "number", `dod.json carries nothing of these checks (report only, outside the score); score ${dod.totals && dod.totals.score}`, `keys: ${leaked.join(", ")}`);
  } finally {
    await close(srv);
  }
}

/** The second review's B3: with a short deadline in enforce mode, the spec changes nothing in dod.json. */
async function deadlineTest() {
  const srv = await serveFree();
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (/^(generated|generated_at|at|started|finished|duration|duration_ms|ms|elapsed|time|when)$/i.test(k) ? undefined : v)));
  try {
    const std = { profile: "work-tool", mode: "enforce", checksMinutes: 0.6 };
    const runs = {};
    for (const withSpec of [false, true]) {
      const dir = project(`extended-deadline-${withSpec ? "with" : "without"}`, ROUTES, std, withSpec);
      const t0 = Date.now();
      const code = await runDod(dir, srv.port);
      const dod = JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "dod.json"), "utf8"));
      runs[withSpec ? "with" : "without"] = { dir, code, dod: strip(dod), s: ((Date.now() - t0) / 1000).toFixed(0) };
      const t = dod.totals ?? {};
      console.log(`       checksMinutes 0.6, enforce, ${withSpec ? "with" : "without"} the spec: exit ${code}, ${runs[withSpec ? "with" : "without"].s} s, score ${t.score}, standard_errored ${t.standard_errored}, standard_findings ${t.standard_findings}`);
    }
    const a = JSON.stringify(runs.without.dod, null, 2);
    const b = JSON.stringify(runs.with.dod, null, 2);
    let at = 0;
    while (at < a.length && a[at] === b[at]) at++;
    ok(a === b && runs.with.code === runs.without.code, "with checksMinutes 0.6 in enforce mode, dod.json (times aside) and the exit code are the same with and without the extended checks", `exit ${runs.without.code} vs ${runs.with.code}; first difference at ${at}: ${a.slice(Math.max(0, at - 200), at + 200)}\n  vs ${b.slice(Math.max(0, at - 200), at + 200)}`);
    ok(runs.without.dod.totals && runs.without.dod.totals.standard_errored === 0, "and the standard checks themselves finished in time (no errored entry), so the comparison means something", JSON.stringify(runs.without.dod.totals));
  } finally {
    await close(srv);
  }
}

ensureDeps();
if (args.includes("--only-phase")) {
  // The phase run alone, for proving the guard tests against another copy of the kit.
  await phaseTest();
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
}
typecheck();
if (!args.includes("--skip-browser")) {
  await browserTests();
  if (!args.includes("--skip-run")) {
    await phaseTest();
    await deadlineTest();
  }
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
