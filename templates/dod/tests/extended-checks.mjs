#!/usr/bin/env node
// Fixture tests of the extended checks (e2e/dod/a11y-extended.ts and consent-checks.ts, run by
// extended-checks.spec.ts). Not copied into projects; kept apart from run.mjs so the two can
// change without touching each other.
//
//   heavy-slot -- node templates/dod/tests/extended-checks.mjs [--skip-browser] [--skip-run] [--only-phase] [--cases-only]
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
// [check, page, kinds, opts]: `kinds` are the findings, exactly; opts.notes the number of notes;
// opts.reads a page whose own POST while it loads (/read) must reach the server and never be held;
// opts.left a page that leaves its route during the check: "not checked", naming where it went;
// opts.notHeld the channels the result must name as sent and not held (and none when absent);
// opts.held the writes the guard held, in the result's own `held` field and never in `count` ("1+" is
// at least one: the walk's exact number of focus and blur events is the browser's), with opts.heldSay
// patterns its samples must match and opts.heldLines their exact number; opts.needs a feature the
// checks take away, so the result is "not checked" and names it. On every page no /save reaches the
// server, the context's close included. The save-* pages are the second and third reviews' write cases.
const CASES = [
  ["forced-colors", "forced-colors", { boundary: 5, focus: 1, state: 1, mark: 1 }],
  ["forced-colors", "pass", {}],
  ["forced-colors", "clean", {}],
  // POST on focus, POST and a beacon on blur, PUT, PATCH and DELETE on the third field's focus; the
  // moment is what the check was doing when the first was held.
  ["forced-colors", "save-on-focus", {}, { held: "1+", heldSay: [/the page tried to write \(POST \/save\).*first when focus moved on with Tab/, /\(PUT \/save\)/, /\(PATCH \/save\)/, /\(DELETE \/save\)/] }],
  ["forced-colors", "save-on-leave", {}],
  ["forced-colors", "save-via-sw", {}, { held: "1+", heldSay: [/the page tried to write \(POST \/save\) once, first when forced colours were switched on/] }],
  ["forced-colors", "save-in-popup", {}, { held: "1+", heldSay: [/another page of the check \(a popup\) tried to write \(POST \/save\)/] }],
  // A dedicated worker's request carries its page's frame in Chromium, so it is the page's.
  ["forced-colors", "save-in-worker", {}, { held: "1+", heldSay: [/the page tried to write \(POST \/save\)/] }],
  ["forced-colors", "save-in-shared-worker", {}, { needs: "SharedWorker" }],
  // Every try of a retry loop is one line of `held`, with how many times (the third review's C4).
  ["forced-colors", "save-retry", {}, { held: "1+", heldLines: 1, heldSay: [/\(POST \/save\/retry\/try-#\) \d+ times/] }],
  ["forced-colors", "save-outbox", {}, { held: "1+" }],
  ["forced-colors", "reads-on-load", {}, { reads: true }],
  // Round 5 (review 5): the channels of the README's table. A page that leaves its route during a check
  // (B1, B3) is "not checked", with where it went, and none of its beacons or keepalive fetches reaches
  // the server; fetchLater is held (B2); forms, pings and XHR are held, each under its sender.
  ["forced-colors", "save-leave-nav", {}, { left: "/clean", held: 7, heldSay: [/\(POST \/save\/leave-nav\/hidden\) once, first when it was leaving/, /\(POST \/save\/leave-nav\/beacon\) once, first when it was leaving \(sendBeacon, not sent\)/, /\(POST \/save\/leave-nav\/keepalive\) once, first when it was leaving \(fetch, not sent\)/, /\(POST \/save\/leave-nav\/xhr\) once, first when it was leaving \(XMLHttpRequest, not sent\)/] }],
  ["text-reflow", "save-resize-leave", {}, { left: "/clean", held: 7, heldSay: [/\(POST \/save\/resize-leave\/beacon\) once, first when it was leaving \(sendBeacon, not sent\)/, /\(POST \/save\/resize-leave\/keepalive\) once, first when it was leaving \(fetch, not sent\)/, /\(POST \/save\/resize-leave\/xhr\) once, first when it was leaving \(XMLHttpRequest, not sent\)/] }],
  ["text-reflow", "save-spacing-redirect", {}, { left: "/text-spacing" }],
  ["forced-colors", "save-form-self", {}, { left: "an error page", held: "1+", heldSay: [/the page tried to write \(POST \/save\/form\/self\)/] }],
  ["forced-colors", "save-fetchlater", {}, { held: "1+", heldSay: [/\(POST \/save\/fetchlater\/at-unload\)/, /\(POST \/save\/fetchlater\/after\)/] }],
  ["forced-colors", "save-forms", {}, { held: "1+", heldSay: [/a new window, or a worker \(no page\) tried to write \(POST \/save\/form\/blank\)/, /the page tried to write \(POST \/save\/form\/frame\)/] }],
  ["forced-colors", "save-ping", {}, { held: "1+", heldSay: [/\(POST \/save\/ping\/fragment\)/] }],
  ["forced-colors", "save-xhr", {}, { held: "1+", heldSay: [/\(POST \/save\/xhr\/async\)/, /\(POST \/save\/xhr\/sync\)/] }],
  // 45 kinds: 40 kept apart, 5 counted together; 7 described, the eighth sample counts the other 38.
  ["forced-colors", "save-many-paths", {}, { held: 45, heldLines: 8, heldSay: [/^and 38 more writes of other kinds, not described here/] }],
  ["forced-colors", "save-popup-on-load", {}, { held: "1+", heldSay: [/another page of the check \(a popup\) tried to write \(POST \/save\) once, first when the check started/] }],
  ["forced-colors", "save-late", {}, { held: 1, heldSay: [/\(POST \/save\/late\) once, first when the check ended/] }],
  ["forced-colors", "save-shw-iframe", {}, { needs: "SharedWorker" }],
  ["forced-colors", "send-unheld", {}, { notHeld: ["WebSocket message", "WebRTC data channel message", "WebTransport session"] }],
  ["text-reflow", "save-resize-style", {}, { held: "1+", heldSay: [/\(POST \/save\/resize\)/] }],
  ["text-spacing", "save-resize-style", {}, { held: "1+", heldSay: [/\(POST \/save\/style\)/] }],
  ["forced-colors", "save-popup-close", {}, { held: "1+", heldSay: [/\(POST \/save\/popup-leave\/load\)/, /\(POST \/save\/popup-leave\/beacon\) once, first when it was leaving \(sendBeacon, not sent\)/] }],
  ["text-reflow", "save-on-leave", {}],
  ["text-reflow", "text-reflow", { clipped: 3, unreachable: 1, sideways: 1 }],
  ["text-reflow", "text-reflow-cut", { unreachable: 1 }],
  ["text-reflow", "text-reflow-ltr", { unreachable: 1 }],
  ["text-reflow", "text-reflow-table", {}],
  // WCAG's Understanding Reflow, Figure 9: paragraphs widened to a table's width are not the exception.
  ["text-reflow", "text-reflow-fig9", { sideways: 1 }],
  // Not the exception (the second review, C8): a layout table, and role="application" (here on a card in main).
  ["text-reflow", "text-reflow-layout-table", { sideways: 1 }],
  ["text-reflow", "text-reflow-presentation", { sideways: 1 }],
  ["text-reflow", "text-reflow-application", { sideways: 1 }],
  // The third review's C6: a one-column role="grid" table is the exception; role="table" with no rows,
  // and a role on a wrapper of the main region, are not.
  ["text-reflow", "text-reflow-grid", {}],
  ["text-reflow", "text-reflow-roletable", { sideways: 1 }],
  ["text-reflow", "text-reflow-roleimg-wrapper", { sideways: 1 }],
  ["text-reflow", "pass", {}],
  ["text-reflow", "clean", {}],
  ["text-spacing", "text-spacing", { clipped: 2, overlap: 2 }],
  ["text-spacing", "pass", {}],
  ["text-spacing", "clean", {}],
  ["consent", "consent", { prechecked: 4, "no-refuse": 2, "weak-refuse": 6 }],
  ["consent", "pass", {}, { notes: 1 }],
  ["consent", "consent-dark", {}],
  // The third review's C6: a banner over a backdrop that is its sibling, not its ancestor.
  ["consent", "consent-overlay", {}],
  ["consent", "clean", {}],
];
const caseOf = (id, page) => CASES.find(([c, p]) => c === id && p === page);
// Each marked condition: the check it belongs to, and the page whose result must change without it.
// A mutant may name several [check, page] pairs; it must fail each. Not marked, with the reason: the
// walk's `break` when focus comes back to the start (`continue` there ends the walk the same way, at
// FOCUS_STEPS), forced-color-adjust:none on a state pair (its colours stay, so the pair still differs;
// the line only saves work), and `held.clear()` in `take` (each guard's `take` runs once, then its
// context closes).
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
  guard: [
    ["forced-colors", "save-on-focus"],
    ["forced-colors", "save-xhr"],
    ["forced-colors", "save-forms"],
    ["forced-colors", "save-form-self"],
    ["forced-colors", "save-ping"],
    ["forced-colors", "save-in-popup"],
    ["forced-colors", "save-in-worker"],
    ["forced-colors", "save-via-sw"],
    ["text-reflow", "save-resize-style"],
    ["text-spacing", "save-resize-style"],
  ],
  "guard-loading": ["forced-colors", "reads-on-load"],
  "shared-worker": ["forced-colors", "save-in-shared-worker"],
  "shared-worker-top": ["forced-colors", "save-shw-iframe"],
  beacon: [["forced-colors", "save-leave-nav"], ["forced-colors", "save-popup-close"]],
  keepalive: ["forced-colors", "save-leave-nav"],
  "xhr-leaving": ["forced-colors", "save-leave-nav"],
  "leaving-event": [["forced-colors", "save-leave-nav"], ["text-reflow", "save-resize-leave"]],
  "leaving-hidden": [["forced-colors", "save-leave-nav"], ["forced-colors", "save-popup-close"]],
  "stopped-record": ["forced-colors", "save-leave-nav"],
  "fetch-later": ["forced-colors", "save-fetchlater"],
  "sends-ws": ["forced-colors", "send-unheld"],
  "sends-rtc": ["forced-colors", "send-unheld"],
  "sends-wt": ["forced-colors", "send-unheld"],
  "from-worker": ["forced-colors", "save-forms"],
  "held-keep": [["forced-colors", "save-on-focus"], ["forced-colors", "save-many-paths"]],
  "watch-moment": ["forced-colors", "save-via-sw"],
  left: [["text-reflow", "save-spacing-redirect"], ["forced-colors", "save-form-self"]],
  "samples-cap": ["forced-colors", "save-many-paths"],
  "from-popup": ["forced-colors", "save-in-popup"],
  moment: ["forced-colors", "save-on-focus"],
  "grid-table": ["text-reflow", "text-reflow-grid"],
  "layout-role": ["text-reflow", "text-reflow-presentation"],
  "layout-table": ["text-reflow", "text-reflow-layout-table"],
  "aria-rows": ["text-reflow", "text-reflow-roletable"],
  "aria-wrapper": ["text-reflow", "text-reflow-roleimg-wrapper"],
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
  "filter-opacity": ["consent", "consent"],
  stack: ["consent", "consent-overlay"],
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
  ["opacity-off", "consent", "o *= parseFloat(st.opacity);", "o *= 1;", "consent", "consent"],
  ["canvas-white", "consent", "(under, top) => over(top, under), canvasBase)", "(under, top) => over(top, under), [255, 255, 255, 1])", "consent", "consent-dark"],
  ["application-exempt", "a11y", "[role=\"img\"]';", "[role=\"img\"], [role=\"application\"]';", "text-reflow", "text-reflow-application"],
  ["overflow-drops", "a11y", "if (!held.has(key) && held.size >= HELD_GROUPS) key = MORE;", "if (!held.has(key) && held.size >= HELD_GROUPS) return;", "forced-colors", "save-many-paths"],
  ["loading-any", "a11y", "if (page && loadingPages.has(page)) hold = false;", "if (loadingPages.size) hold = false;", "forced-colors", "save-popup-on-load"],
  ["guard-post-only", "a11y", "let hold = !SAFE_METHODS.includes(req.method());", 'let hold = req.method() === "POST";', "forced-colors", "save-on-focus"],
  ["held-groups-1", "a11y", "export const HELD_GROUPS = 40;", "export const HELD_GROUPS = 1;", "forced-colors", "save-on-focus"],
  ["held-no-fold", "a11y", '.pathname.replace(/\\d+/g, "#")', ".pathname", "forced-colors", "save-retry"],
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

// --- every way a page can send something: the README's table, as data -------------------------------
// [channel, what the guard does, proved by]: "proved by" names fixtures ("<check> <page>" for a browser case,
// "phase /<route>" for the phase run) and the mutants that remove the guard of that row (M: a marked line,
// R: a replacement, S: a spec mutant), each of which must fail one of those fixtures. A row the guard does
// not hold says so; a "not held" row with a fixture is one whose sends the result names (`notHeld`).
// `channelTable` checks this list against CASES, the mutants and the README's table, row by row.
const CHANNELS = [
  ["`fetch`", "held: aborted by the context's route", ["forced-colors save-on-focus"], ["M:guard", "R:guard-post-only"]],
  ["`XMLHttpRequest`, asynchronous and synchronous", "held: aborted by the route", ["forced-colors save-xhr"], ["M:guard"]],
  ["`navigator.sendBeacon`, `fetch` with `keepalive`, while the page lives", "held: aborted by the route", ["forced-colors save-on-focus"], ["M:guard"]],
  ["any write while a document leaves (a redirect, a navigation, a popup closed): `fetch`, a beacon, XHR, `fetchLater`", "held: not sent at all, and written down for the check", ["forced-colors save-leave-nav", "text-reflow save-resize-leave", "forced-colors save-popup-close", "phase /save-popup-close"], ["M:leaving-event", "M:leaving-hidden", "M:beacon", "M:keepalive", "M:xhr-leaving", "M:stopped-record", "S:no-stopped"]],
  ["`fetchLater`", "held: sent as an ordinary fetch, which the route aborts", ["forced-colors save-fetchlater"], ["M:fetch-later"]],
  ["a form posted into the page", "held; the page then shows an error page, so the check is not checked", ["forced-colors save-form-self"], ["M:guard", "M:left"]],
  ["a form posted into a new window", 'held: named "a new window, or a worker (no page)"', ["forced-colors save-forms"], ["M:guard", "M:from-worker"]],
  ["a form posted into a frame", "held", ["forced-colors save-forms"], ["M:guard"]],
  ["`window.open`, a popup (also one opened while the page loads)", 'held: named "another page of the check (a popup)"', ["forced-colors save-in-popup", "forced-colors save-popup-on-load"], ["M:guard", "M:from-popup", "R:loading-any"]],
  ["`<a ping>`", "held", ["forced-colors save-ping"], ["M:guard"]],
  ["a dedicated worker", "held: its requests carry its page's frame", ["forced-colors save-in-worker"], ["M:guard"]],
  ["a service worker the page registers", "held: service workers are blocked, so the page sends its write itself", ["forced-colors save-via-sw"], ["M:guard"]],
  ["a SharedWorker, also one started from a frame", "taken away: the route is not checked", ["forced-colors save-in-shared-worker", "forced-colors save-shw-iframe"], ["M:shared-worker", "M:shared-worker-top"]],
  ["a write set off by the check: focus and blur, forced colours, a resize, a style tag", "held, under the check that set it off, with its moment", ["forced-colors save-on-focus", "forced-colors save-via-sw", "text-reflow save-resize-style", "text-spacing save-resize-style"], ["M:guard", "M:watch-moment", "M:moment"]],
  ["a write set off as a check ends", "held and counted: the spec waits 500 ms before it takes them", ["forced-colors save-late", "phase /save-late"], ["S:no-settle"]],
  ["many writes of different kinds", "held: 40 kinds apart, the rest together; 7 samples and a count of the rest", ["forced-colors save-many-paths"], ["M:samples-cap", "M:held-keep", "R:overflow-drops"]],
  ["an outbox replayed on load", "held: each check starts from the test's storage state", ["phase /save-outbox"], ["S:chain-state"]],
  ["`BroadcastChannel` or a `storage` event to another tab", "held: each run has a context of its own", ["phase /save-tabsync"], ["S:one-context"]],
  ["a timer or a retry loop", "held; it ends with its context", ["forced-colors save-retry", "phase /save-retry"], ["R:held-no-fold", "S:no-close"]],
  ["`pagehide`, `visibilitychange`, `beforeunload`, `unload` as a check ends", "none run: the context is closed, never the page", ["phase /save-on-leave"], ["S:close-page"]],
  ["a page that leaves its route during a check", "not checked, with where it went; nothing it measured there is reported", ["text-reflow save-spacing-redirect", "phase /save-spacing-redirect"], ["M:left", "S:no-left-check"]],
  ["a WebSocket message", "not held: counted, and named in `notHeld`", ["forced-colors send-unheld"], ["M:sends-ws"]],
  ["a WebRTC data channel message", "not held: counted, and named in `notHeld`", ["forced-colors send-unheld"], ["M:sends-rtc"]],
  ["a WebTransport session", "not held: counted, and named in `notHeld`", ["forced-colors send-unheld"], ["M:sends-wt"]],
  ["a write while the page loads (a timer, a page view, an error report, an auth refresh)", "passes, as in the scored phase", ["forced-colors reads-on-load", "phase /reads-on-load"], ["M:guard-loading", "S:no-loading"]],
  ["a GET that writes: a link or a `location` change, an image, script or style URL, `EventSource`", "not held and not seen: a GET cannot be told from a read", [], []],
  ["link prefetch, prerender, speculation rules", "not held (GETs); a prerender did not run in headless Chromium", [], []],
  ["a service worker installed before the check", "cannot happen: a context made from a storage state has none", [], []],
  ["a write from a frame of another origin as it leaves", "not sent, and not reported: it has nowhere to write itself down", [], []],
  ["a write from a worker as its page leaves", "not measured: the kit's scripts do not run in workers", [], []],
];

/** The table as the README prints it. */
const channelTableText = () =>
  [
    "| Channel | The guard | Proved by |",
    "|---|---|---|",
    ...CHANNELS.map(([ch, how, fx, mu]) => `| ${ch} | ${how} | ${fx.length ? `${fx.map((f) => (f.startsWith("phase ") ? `the phase run, \`${f.slice(6)}\`` : `\`${f.split(" ")[1]}.html\` (${f.split(" ")[0]})`)).join(", ")}; ${mu.join(", ")}` : "none"} |`),
  ].join("\n");

/** Every held row has a fixture and a mutant that targets it; the README's table is this one. */
function channelTable() {
  const why = [];
  for (const [ch, how, fx, mu] of CHANNELS) {
    const pages = fx.filter((f) => !f.startsWith("phase ")).map((f) => f.split(" "));
    const phase = fx.filter((f) => f.startsWith("phase ")).map((f) => f.slice(6));
    if (!how.startsWith("not held and not seen") && !how.startsWith("not held (") && !how.startsWith("cannot happen") && !how.startsWith("not sent, and not reported") && !how.startsWith("not measured") && (!fx.length || !mu.length)) why.push(`${ch}: a guarded row needs a fixture and a mutant`);
    for (const [id, page] of pages) if (!caseOf(id, page)) why.push(`${ch}: no case ${id} on ${page}`);
    for (const r of phase) if (!SAVE_ROUTES.includes(r)) why.push(`${ch}: ${r} is not a phase route`);
    for (const m of mu) {
      const [kind, code] = [m.slice(0, 1), m.slice(2)];
      if (kind === "M") {
        const pairs = MUTANTS[code] ? (Array.isArray(MUTANTS[code][0]) ? MUTANTS[code] : [MUTANTS[code]]) : [];
        if (!pairs.some(([id, page]) => pages.some(([i, p]) => i === id && p === page))) why.push(`${ch}: ${m} is not run on its fixtures`);
      } else if (kind === "R") {
        if (!REPLACE.some(([n, , , , id, page]) => n === code && pages.some(([i, p]) => i === id && p === page))) why.push(`${ch}: ${m} is not run on its fixtures`);
      } else if (kind === "S") {
        if (!SPEC_MUTANTS.some(([n, , routes]) => n === code && routes.some((r) => phase.includes(r)))) why.push(`${ch}: ${m} is not run on its phase routes`);
      } else why.push(`${ch}: unknown mutant ${m}`);
    }
  }
  const readme = fs.readFileSync(path.join(TEMPLATE, "README.md"), "utf8");
  if (!readme.includes(channelTableText())) why.push("the README's table of channels is not this one (print it with --print-channel-table)");
  ok(!why.length, `the channel table: ${CHANNELS.length} rows, every guarded row with a fixture and a mutant run on it, and the README prints it`, why.join("; "));
}

/** How a result differs from its case, or "" when it is the case. */
function differs(r, kase, posts) {
  const [, , kinds, { notes = 0, reads = false, held = undefined, heldSay = [], heldLines = null, needs = null, left = null, notHeld = [] } = {}] = kase;
  const saves = posts.filter((p) => p.includes("/save"));
  if (saves.length) return `writes reached the server: ${saves.join(", ")}`;
  if (reads && !posts.some((p) => p.includes("/read"))) return "the page's read while it loads did not reach the server";
  const said = [...r.samples, ...(r.held?.samples ?? [])];
  if (said.some((s) => s.includes("/read"))) return `a read while the page loaded was held: ${said.join(" | ")}`;
  if (needs) return r.error && r.error.startsWith("not checked") && r.error.includes(needs) ? "" : `want "not checked" naming ${needs}, got ${JSON.stringify(r)}`;
  if (left && !(r.error && r.error.startsWith("not checked: the page left its route") && r.error.includes(`it went to ${left}`))) return `want "not checked: the page left its route" to ${left}, got ${JSON.stringify(r)}`;
  if (r.error && !left) return `errored: ${r.error}`;
  if (!left && (Object.keys(r.kinds).length !== Object.keys(kinds).length || Object.entries(kinds).some(([k, n]) => (r.kinds[k] ?? 0) !== n))) return `kinds ${JSON.stringify(r.kinds)} != ${JSON.stringify(kinds)}`;
  const unheld = r.notHeld?.samples ?? [];
  if (notHeld.length !== unheld.length || notHeld.some((ch) => !unheld.some((l) => l.includes(ch)))) return `not held ${JSON.stringify(unheld)}, want ${JSON.stringify(notHeld)}`;
  const want = Object.entries(kinds);
  // A held write is never a finding: the count is the findings' alone.
  if (r.count !== want.reduce((a, [, n]) => a + n, 0)) return `count ${r.count} is not the findings' ${JSON.stringify(r.kinds)}`;
  const got = r.held?.count ?? 0;
  // A page that left: what it held as it went is the browser's timing, so only a stated number is checked.
  const wantHeld = held ?? (left ? null : 0);
  if (wantHeld !== null && (wantHeld === "1+" ? got < 1 : got !== wantHeld)) return `held ${got}, want ${wantHeld}: ${JSON.stringify(r.held)}`;
  const lines = r.held?.samples ?? [];
  if (heldLines !== null && lines.length !== heldLines) return `held in ${lines.length} lines, want ${heldLines}: ${lines.join(" | ")}`;
  for (const re of heldSay) if (!lines.some((l) => re.test(l))) return `no held line matches ${re}: ${lines.join(" | ")}`;
  if ((r.notes ?? []).length !== notes) return `notes ${JSON.stringify(r.notes ?? [])}, want ${notes}`;
  return "";
}

// --- the fixture server: pages by name, and a log of every write that reached it ----------
function serve(port) {
  const posts = [];
  const times = [];
  const alive = [];
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/alive/")) alive.push({ what: req.url, at: Date.now() });
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
    server.listen(port, "127.0.0.1", () => resolve({ server, posts, times, alive, port }));
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
  // One check on one page, as the spec runs it: a context of its own with the write guard and service
  // workers blocked, a new page marked loading, "not checked" when the page tried to start what the
  // guard takes away, the sends no route sees counted from here, the check, 500 ms, then "not checked"
  // if the page left its route, else the writes the guard held in `held` and the unheld sends in
  // `notHeld`; the page is never closed, the context is, on every path, and what reached the server is
  // read after.
  const check = async (mods, id, page) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "he-IL", serviceWorkers: "block" });
    const before = srv.posts.length;
    const failed = (err) => ({ count: 0, kinds: {}, samples: [], error: String(err?.message ?? err) });
    const LEFT = (to) => `not checked: the page left its route during the check (it went to ${to}); nothing measured after that is reported`;
    let r;
    let guard = null;
    let p = null;
    try {
      guard = await mods.a11y.installWriteGuard(ctx);
      p = await ctx.newPage();
      guard.loading(p);
      await p.goto(`http://127.0.0.1:${srv.port}/${page}`);
      await p.waitForLoadState("networkidle").catch(() => {});
      const taken = await mods.a11y.needsTakenAway(p);
      if (taken) throw new Error(`not checked: the page tries to start a ${taken}, which these checks take away`);
      await mods.a11y.countSendsFromNow(p);
      r = await RUN[id][1](mods, p, guard);
      await new Promise((res) => setTimeout(res, 500));
      const went = guard.left(p);
      await guard.stopped(p);
      const sends = went ? {} : await mods.a11y.sendsNotHeld(p);
      r = mods.a11y.withNotHeld(mods.a11y.withHeld(went ? failed(LEFT(went)) : r, guard.take()), sends);
    } catch (err) {
      if (guard && p) await guard.stopped(p);
      const went = guard && p ? guard.left(p) : null;
      r = mods.a11y.withHeld(failed(went ? LEFT(went) : err), guard ? guard.take() : []);
    } finally {
      await ctx.close();
    }
    await new Promise((res) => setTimeout(res, 300));
    return { r, posts: srv.posts.slice(before) };
  };
  try {
    for (const kase of CASES) {
      const [id, page, kinds, opts = {}] = kase;
      const { r, posts } = await check(real, id, page);
      const why = differs(r, kase, posts);
      const extra = [opts.notes ? `${opts.notes} note` : "", opts.held ? `${opts.held} held apart` : "", opts.needs ? `"not checked" for ${opts.needs}` : ""].filter(Boolean).join(", ");
      ok(!why, `${id} on ${page}.html finds ${JSON.stringify(kinds)}${extra ? ` (${extra})` : ""}`, `${why}; ${JSON.stringify(r)}`);
      console.log(`       ${id} on ${page}.html: ${JSON.stringify({ count: r.count, kinds: r.kinds, notes: r.notes, held: r.held, error: r.error, samples: r.samples.slice(0, 3) })}${posts.length ? ` posts ${posts.join(", ")}` : ""}`);
      if (id === "text-reflow" && page === "text-reflow-fig9") ok(r.samples.some((s) => /sideways: .*widest <p> /.test(s)), "Figure 9: the sideways finding names the widened paragraph, not the table", JSON.stringify(r.samples));
      if (id === "text-reflow" && page === "text-reflow") ok(r.samples.some((s) => /sideways: .*widest <div> "טבלה רחבה" 500px/.test(s)), "the sideways finding names the widest element", JSON.stringify(r.samples));
    }
    if (args.includes("--cases-only")) return;
    const mutants = [
      ...Object.entries(MUTANTS).flatMap(([code, pairs]) => (Array.isArray(pairs[0]) ? pairs : [pairs]).map(([id, page]) => [`M:${code}`, RUN[id][0], withoutLine(code), id, page])),
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
      ok(!!why, `${id}: the mutant ${name} fails the ${page}.html case`, `the mutant still gives ${JSON.stringify({ kinds: r.kinds, held: r.held, notHeld: r.notHeld, error: r.error })}`);
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
// wiring, end to end. Only the extended checks switch forced colours on, press Tab or resize a loaded
// page, but the other phases navigate, which runs save-on-leave.html's pagehide handlers: so the server
// must get no /save from the moment the extended checks start (2 s after the last standard result is
// written). save-in-shared-worker.html and save-shw-iframe.html are tested in the browser cases only: the
// scored phase (dod.spec.ts, not these checks) times out on a page that starts a SharedWorker (all four
// entries, 120 s each). WHOLE_RUN: pages that write only when something of an earlier check outlives it
// (an outbox in localStorage, another open tab, a retry loop) or when forced colours switch on, which no
// other phase does: none of their writes may reach the server at any time of the run.
const SAVE_ROUTES = [
  "/save-on-focus",
  "/save-on-leave",
  "/save-via-sw",
  "/save-in-popup",
  "/save-in-worker",
  "/save-outbox",
  "/save-tabsync",
  "/save-retry",
  "/save-resize-leave",
  "/save-spacing-redirect",
  "/save-fetchlater",
  "/save-forms",
  "/save-ping",
  "/save-popup-close",
  "/save-late",
  "/send-unheld",
  "/reads-on-load",
];
const WHOLE_RUN = /\/save\/(outbox|tabsync|retry|fetchlater|form|ping|popup-leave|late)\b/;
const IDS = ["forced-colors", "text-reflow", "text-spacing", "consent-prechecked", "consent-refuse"];
const sum = (kinds) => Object.values(kinds).reduce((a, b) => a + b, 0);

/**
 * What a checks-phase run must show, as [name, routes it needs, holds, detail] rows: every row whose routes
 * all ran is judged. `posts` and `alive` are what reached the server during the run judged, `extStart` the
 * moment the extended checks started, `log` its output.
 */
function phaseRows({ dir, routes, posts, alive, extStart, log }) {
  const out = path.join(dir, "reports", "dod", "results", "extended");
  const read = (slug) => (fs.existsSync(path.join(out, `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join(out, `${slug}.json`), "utf8")) : null);
  const mtime = (slug) => (fs.existsSync(path.join(out, `${slug}.json`)) ? fs.statSync(path.join(out, `${slug}.json`)).mtimeMs : 0);
  const saves = posts.filter((p) => p.what.includes("/save") && p.at >= extStart).map((p) => p.what);
  const savesBefore = posts.filter((p) => p.what.includes("/save") && p.at < extStart).length;
  const wholeRun = posts.filter((p) => WHOLE_RUN.test(p.what)).map((p) => p.what);
  const reads = posts.filter((p) => p.what.includes("/read"));
  const chk = (slug, id) => read(slug)?.checks[id];
  const heldOf = (slug, id) => chk(slug, id)?.held?.count ?? 0;
  const heldSays = (slug, id, re) => (chk(slug, id)?.held?.samples ?? []).some((l) => re.test(l));
  const counts = (slug) => IDS.map((id) => chk(slug, id)?.count);
  const errs = (slug) => IDS.filter((id) => chk(slug, id)?.error);
  const logLine = (slug) => log.split("\n").find((l) => l.includes(`[dod] extended /${slug}:`)) ?? "";
  const leftTo = (slug, id, to) => (chk(slug, id)?.error ?? "").startsWith("not checked: the page left its route") && chk(slug, id).error.includes(`it went to ${to}`) && chk(slug, id).count === 0 && !chk(slug, id).samples.length;
  const rows = [];
  const row = (name, need, holds, detail = "") => rows.push([name, need, holds, detail]);
  const all = routes.map((r) => read(r.slice(1))).filter(Boolean);
  row(`no /save reached the server while the extended checks ran (${savesBefore} came earlier, from the other phases' navigations)`, [], !saves.length, saves.join(", "));
  row(`no write of the pages that write only in these checks reached the server at any time of the run (${posts.length} writes reached it in all)`, [], !wholeRun.length, wholeRun.join(", "));
  for (const slug of ["save-on-focus", "save-via-sw", "save-in-popup", "save-in-worker", "save-outbox", "save-retry", "save-fetchlater", "save-forms", "save-ping", "save-popup-close", "save-late"])
    row(`${slug}.json: forced-colors held ${heldOf(slug, "forced-colors")} write(s) apart, every count 0, and the log says "forced-colors clean (N writes held)"`, [`/${slug}`], heldOf(slug, "forced-colors") >= 1 && counts(slug).every((n) => n === 0) && !errs(slug).length && /forced-colors clean \(\d+ writes? held\)/.test(logLine(slug)), JSON.stringify(read(slug)));
  row(`save-retry.json: no other check holds a try of the loop or counts one (${IDS.map((id) => `${id} ${heldOf("save-retry", id)}`).join(", ")})`, ["/save-retry"], IDS.filter((id) => id !== "forced-colors").every((id) => heldOf("save-retry", id) === 0 && chk("save-retry", id)?.count === 0), JSON.stringify(read("save-retry")));
  const lateAlive = alive.filter((a) => a.what.startsWith("/alive/save-retry") && a.at > mtime("save-retry") + 1500);
  row(`save-retry ends with its check's context: no read of the page's heartbeat came more than 1.5 s after its result was written (${alive.length} heartbeats in all)`, ["/save-retry", "/reads-on-load"], mtime("save-retry") > 0 && !lateAlive.length, `${lateAlive.length} late, the last at +${lateAlive.length ? Math.round(lateAlive.at(-1).at - mtime("save-retry")) : 0} ms`);
  row("save-late.json: the write set off as forced-colors ends (200 ms after) is held under forced-colors", ["/save-late"], heldSays("save-late", "forced-colors", /\(POST \/save\/late\)/), JSON.stringify(chk("save-late", "forced-colors")));
  row('save-forms.json: the form posted into a new window is held as "a new window, or a worker (no page)"', ["/save-forms"], heldSays("save-forms", "forced-colors", /a new window, or a worker \(no page\) tried to write \(POST \/save\/form\/blank\)/), JSON.stringify(chk("save-forms", "forced-colors")));
  row("save-popup-close.json: the popup's beacon as its opener closed it was not sent, and is held under forced-colors", ["/save-popup-close"], heldSays("save-popup-close", "forced-colors", /\/save\/popup-leave\/beacon\) once, first when it was leaving \(sendBeacon, not sent\)/), JSON.stringify(chk("save-popup-close", "forced-colors")));
  // Review 5's B1 and B3: the app leaves its route during a check.
  row('save-resize-leave.json: text-reflow and text-spacing are "not checked: the page left its route" (it went to /clean), its beacons held, and the log says "not checked"', ["/save-resize-leave"], ["text-reflow", "text-spacing"].every((id) => leftTo("save-resize-leave", id, "/clean") && heldSays("save-resize-leave", id, /it was leaving \(sendBeacon, not sent\)/)) && /text-reflow not checked \(\d+ writes? held\), text-spacing not checked/.test(logLine("save-resize-leave")), JSON.stringify(read("save-resize-leave")));
  row("save-spacing-redirect.json: nothing of /text-spacing is reported under it (text-spacing not checked, 0 findings)", ["/save-spacing-redirect"], leftTo("save-spacing-redirect", "text-spacing", "/text-spacing") && !/found/.test(logLine("save-spacing-redirect")), JSON.stringify(read("save-spacing-redirect")));
  row('send-unheld.json: the WebSocket, WebRTC and WebTransport sends are named "not held", and the log says "no findings", never "clean"', ["/send-unheld"], (chk("send-unheld", "forced-colors")?.notHeld?.samples ?? []).length === 3 && /forced-colors no findings \(\d+ sends not held\)/.test(logLine("send-unheld")), JSON.stringify(chk("send-unheld", "forced-colors")));
  const leaveRan = alive.filter((a) => a.what.startsWith("/alive/save-on-leave") && a.at >= extStart);
  row(`save-on-leave: its pagehide handler did not run while the extended checks ran (${leaveRan.length} reads from it)`, ["/save-on-leave"], !leaveRan.length, leaveRan.map((a) => a.what).join(", "));
  for (const slug of ["save-on-leave", "save-tabsync", "reads-on-load"])
    row(`${slug}.json: nothing to hold, nothing found, no check errored`, [`/${slug}`], IDS.every((id) => heldOf(slug, id) === 0) && counts(slug).every((n) => n === 0) && !errs(slug).length, JSON.stringify(read(slug)));
  row("no result counts a held write as a finding (no `write-held` kind)", [], !all.some((j) => IDS.some((id) => j.checks[id]?.kinds?.["write-held"] !== undefined)), "");
  // Review 5's C4: a held read is in `held.samples`, so both lists are read.
  const heldRead = all.flatMap((j) => IDS.flatMap((id) => [...(j.checks[id]?.samples ?? []), ...(j.checks[id]?.held?.samples ?? [])])).filter((x) => x.includes("/read"));
  row(`a page's own POST while it loads reaches the server (${reads.length} reads)`, ["/reads-on-load"], reads.length > 0, `reads ${reads.length}`);
  row("no result holds a page's own POST while it loads (its samples and its held samples)", ["/reads-on-load"], !heldRead.length, heldRead.join(" | "));
  return rows;
}

/** A spawned run, its output kept in <dir>/<name>.log. */
function spawnIn(dir, name, cmd, argv, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("exit", (c) => {
      fs.writeFileSync(path.join(dir, `${name}.log`), log);
      resolve({ code: c, log });
    });
  });
}

// Spec mutants (review 5's C3): [name, [[text, replacement], ...], the routes it runs on, the row it must fail].
// Each runs the extended project alone on a copy of the measured project, routes.json cut to its routes.
const SPEC_MUTANTS = [
  ["no-close", [["if (ctx) await ctx.close().catch(() => {});", ""]], ["/save-retry", "/reads-on-load"], "save-retry ends with its check's context"],
  ["no-settle", [["await settleWrites();", ""]], ["/save-late"], "save-late.json: the write set off as forced-colors ends"],
  ["no-loading", [["guard.loading(page);", ""]], ["/reads-on-load"], "no result holds a page's own POST while it loads"],
  ["close-page", [["if (ctx) await ctx.close().catch(() => {});", "if (page) await page.close().catch(() => {});\n              if (ctx) await ctx.close().catch(() => {});"]], ["/save-on-leave"], "save-on-leave: its pagehide handler did not run"],
  [
    "chain-state",
    [
      ["const startState = await context.storageState();", "const startState = await context.storageState();\n          let chained: typeof startState | undefined;"],
      ["storageState: startState,", "storageState: chained ?? startState,"],
      ["if (ctx) await ctx.close().catch(() => {});", "if (ctx) chained = await ctx.storageState().catch(() => chained);\n              if (ctx) await ctx.close().catch(() => {});"],
    ],
    ["/save-outbox"],
    "no write of the pages that write only in these checks",
  ],
  [
    "one-context",
    [
      ["ctx = await browser.newContext({", "ctx = (globalThis as unknown as { __c?: BrowserContext }).__c ??= await browser.newContext({"],
      ["guard = await installWriteGuard(ctx);", "guard = (globalThis as unknown as { __g?: WriteGuard }).__g ??= await installWriteGuard(ctx);"],
      ["if (ctx) await ctx.close().catch(() => {});", ""],
    ],
    ["/save-tabsync"],
    "no /save reached the server while the extended checks ran",
  ],
  ["no-left-check", [["const went = guard.left(page);", "const went = null as string | null;"]], ["/save-spacing-redirect"], "save-spacing-redirect.json: nothing of /text-spacing"],
  ["no-stopped", [["              await guard.stopped(page);\n", ""]], ["/save-popup-close"], "save-popup-close.json: the popup's beacon"],
];

/** The checks phase of a real run: run-dod.mjs on a throwaway project with the routes above, then each spec mutant. */
async function phaseTest() {
  const srv = await serveFree();
  const at = () => srv.posts.map((what, i) => ({ what, at: srv.times[i] }));
  try {
    const routes = [...ROUTES, ...SAVE_ROUTES];
    const dir = project("extended-run", routes, { profile: "work-tool" });
    const code = await runDod(dir, srv.port);
    const resDir = path.join(dir, "reports", "dod", "results");
    const extStart = Math.max(0, ...fs.readdirSync(resDir).filter((f) => f.endsWith(".standard.json")).map((f) => fs.statSync(path.join(resDir, f)).mtimeMs)) + 2000;
    const out = path.join(resDir, "extended");
    const read = (slug) => (fs.existsSync(path.join(out, `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join(out, `${slug}.json`), "utf8")) : null);
    const log = fs.readFileSync(path.join(dir, "run.log"), "utf8");
    console.log(log.split("\n").filter((l) => l.includes("[dod] extended")).map((l) => `       ${l.trim()}`).join("\n"));
    ok(code === 0, "run-dod.mjs exits 0 (the scored phase's code; these checks only report)", `exit ${code}; log in ${dir}/run.log`);
    const clean = read("clean");
    ok(clean && IDS.every((id) => clean.checks[id] && !clean.checks[id].error && clean.checks[id].count === 0), "the checks phase writes results/extended/clean.json: all five clean", JSON.stringify(clean));
    const forced = read("forced-colors");
    const fc = caseOf("forced-colors", "forced-colors")[2];
    ok(forced && forced.checks["forced-colors"].count === sum(fc) && !forced.checks["forced-colors"].error, `and forced-colors.json with its ${sum(fc)} forced-colours findings`, JSON.stringify(forced && forced.checks["forced-colors"]));
    const consent = read("consent");
    const cc = caseOf("consent", "consent")[2];
    ok(consent && consent.checks["consent-prechecked"].count === cc.prechecked && consent.checks["consent-refuse"].count === cc["no-refuse"] + cc["weak-refuse"], `and consent.json with ${cc.prechecked} boxes on at load and ${cc["no-refuse"] + cc["weak-refuse"]} refuse findings`, JSON.stringify(consent && [consent.checks["consent-prechecked"], consent.checks["consent-refuse"]]));
    // The order, from the files each writes: every standard result before the first extended one.
    const mt = (d, f) => fs.statSync(path.join(d, f)).mtimeMs;
    const std = fs.readdirSync(resDir).filter((f) => f.endsWith(".standard.json")).map((f) => mt(resDir, f));
    const ext = fs.existsSync(out) ? fs.readdirSync(out).map((f) => mt(out, f)) : [];
    ok(std.length > 0 && ext.length === routes.length && Math.min(...ext) >= Math.max(...std), "the extended checks run after every standard check (their own project, the checks project's teardown)", `standard results ${std.length}, last at ${Math.max(...std)}; extended ${ext.length}, first at ${Math.min(...ext)}`);
    for (const [name, , holds, detail] of phaseRows({ dir, routes, posts: at(), alive: srv.alive, extStart, log })) ok(holds, name, detail);
    const dod = JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "dod.json"), "utf8"));
    // No key of dod.json is one of these check ids (a route named /forced-colors is a route, "/forced-colors").
    const keys = new Set();
    const walk = (o) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (keys.add(k), walk(v));
    };
    walk(dod);
    const leaked = [...IDS, "extended", "write-held", "held", "notHeld"].filter((id) => keys.has(id));
    ok(!leaked.length && dod.totals && typeof dod.totals.score === "number", `dod.json carries nothing of these checks (report only, outside the score); score ${dod.totals && dod.totals.score}`, `keys: ${leaked.join(", ")}`);
    if (args.includes("--skip-spec-mutants")) return;
    // Each spec mutant: the extended project alone, on a copy of the measured project, with its own routes.
    const cli = path.join(WORK, "node_modules", "@playwright", "test", "cli.js");
    for (const [name, edits, mroutes, mustFail] of SPEC_MUTANTS) {
      const mdir = fresh(`extended-spec-mutant-${name}`);
      fs.cpSync(dir, mdir, { recursive: true });
      fs.rmSync(path.join(mdir, "reports", "dod", "results", "extended"), { recursive: true, force: true });
      fs.writeFileSync(path.join(mdir, "e2e", "dod", "routes.json"), JSON.stringify(mroutes.map((r) => ({ route: r, audience: "anonymous", static: true, noHelp: "a fixture page" })), null, 2));
      const specFile = path.join(mdir, "e2e", "dod", "extended-checks.spec.ts");
      let spec = fs.readFileSync(specFile, "utf8");
      let bad = "";
      for (const [from, to] of edits) {
        const n = spec.split(from).length - 1;
        if (n !== 1) bad = `the text to replace occurs ${n} times, not once: ${from}`;
        else spec = spec.replace(from, () => to);
      }
      if (bad) {
        ok(false, `spec mutant ${name}`, bad);
        continue;
      }
      fs.writeFileSync(specFile, spec);
      const before = srv.posts.length;
      const aliveBefore = srv.alive.length;
      const t0 = Date.now();
      const env = { ...process.env, PORT: String(srv.port), DOD_WORKERS: "1", DOD_USER: "", DOD_PASSWORD: "", DOD_PHASE: "checks" };
      delete env.CI;
      const r = await spawnIn(mdir, "run", process.execPath, [cli, "test", "-c", "playwright.dod.config.ts", "--project", "extended", "--reporter=line"], env);
      await new Promise((res) => setTimeout(res, 2000));
      const rows = phaseRows({ dir: mdir, routes: mroutes, posts: at().slice(before), alive: srv.alive.slice(aliveBefore), extStart: t0, log: r.log });
      const judged = rows.filter(([, need]) => need.every((x) => mroutes.includes(x)));
      const target = judged.find(([n]) => n.startsWith(mustFail));
      ok(!!target && !target[2], `spec mutant ${name} fails "${mustFail}..." (on ${mroutes.join(" ")})`, target ? `it still holds: ${target[3]}` : `no such row among ${judged.map(([n]) => n.slice(0, 50)).join(" | ")}`);
      console.log(`       spec mutant ${name}: ${judged.filter(([, , h]) => !h).map(([n]) => n.slice(0, 90)).join(" | ") || "every row holds"}`);
    }
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

if (args.includes("--print-channel-table")) {
  console.log(channelTableText());
  process.exit(0);
}
ensureDeps();
if (args.includes("--only-phase")) {
  // The phase run alone, for proving the guard tests against another copy of the kit.
  await phaseTest();
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
}
typecheck();
channelTable();
if (!args.includes("--skip-browser")) {
  await browserTests();
  if (!args.includes("--skip-run")) {
    await phaseTest();
    await deadlineTest();
  }
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
