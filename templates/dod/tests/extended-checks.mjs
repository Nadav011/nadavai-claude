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
//    Each case runs as the spec runs a check, the network cut included, and asserts on the fixture
//    server that nothing reached it after the cut (a request, a WebSocket message, a UDP packet).
// 3. Mutants: each condition of the checks is one line marked `// M:<code>` (a copy of its module
//    without that line), and each threshold or operator a line deletion cannot reach has a
//    replacement mutant (REPLACE); each must change the result of the page named beside it.
// 4. The checks phase of a real `run-dod.mjs` run on three of the pages and the pages that write (the
//    spec writes its files), then each spec mutant (SPEC_MUTANTS) on the routes it must fail,
//    and the deadline: run-dod.mjs in enforce mode with checksMinutes 0.6, with and without the
//    spec, must write the same dod.json (times aside), since the extended checks run last.
// Dependencies come from tests/package.json in DOD_TEST_WORKDIR (default <tmpdir>/dod-template-tests),
// never the repo; every project and mutant of a run gets its own new directory inside it. One Chromium
// at a time; the fixture server listens on 127.0.0.1, port DOD_A11Y_PORT, or a free one in 20000-32000.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import dgram from "node:dgram";
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
// opts.reads a page whose own POST while it loads (/read) must reach the server and never be reported;
// opts.loadWrites a page whose write while it loads (a popup it opens) reaches the server before the cut;
// opts.left a page that leaves its route during the check: "not checked", naming where it went (under
// the cut a navigation to another document fails, so that is "an error page");
// opts.tried the writes the route saw after the cut, in the result's own `tried` field and never in
// `count` ("1+" is at least one: the walk's exact number of focus and blur events is the browser's), with
// opts.triedSay patterns its samples must match and opts.triedLines their exact number; opts.needs a
// feature the checks take away, so the result is "not checked" and names it. On every page the server
// receives nothing after the cut (a request to /save, any non-GET, a WebSocket message, a UDP packet),
// the context's close included. The save-* pages are the reviews' write cases.
const CASES = [
  ["forced-colors", "forced-colors", { boundary: 5, focus: 1, state: 1, mark: 1 }],
  ["forced-colors", "pass", {}],
  ["forced-colors", "clean", {}],
  // POST on focus, POST and a beacon on blur, PUT, PATCH and DELETE on the third field's focus; the
  // moment is what the check was doing when the first was tried.
  ["forced-colors", "save-on-focus", {}, { tried: "1+", triedSay: [/the page tried to write \(POST \/save\) .*while the network was cut off, first when focus moved on with Tab/, /\(PUT \/save\)/, /\(PATCH \/save\)/, /\(DELETE \/save\)/] }],
  ["forced-colors", "save-via-sw", {}, { tried: "1+", triedSay: [/the page tried to write \(POST \/save\) once while the network was cut off, first when forced colours were switched on/] }],
  ["forced-colors", "save-in-popup", {}, { tried: "1+", triedSay: [/another page of the check \(a popup\) tried to write \(POST \/save\)/] }],
  // A dedicated worker's request carries its page's frame in Chromium, so it is the page's.
  ["forced-colors", "save-in-worker", {}, { tried: "1+", triedSay: [/the page tried to write \(POST \/save\)/] }],
  // A SharedWorker's requests reach no route, so nothing is recorded; the cut stops them.
  ["forced-colors", "save-in-shared-worker", {}],
  ["forced-colors", "save-shw-iframe", {}],
  // Every try of a retry loop is one line of `tried`, with how many times (the third review's C4).
  ["forced-colors", "save-retry", {}, { tried: "1+", triedLines: 1, triedSay: [/\(POST \/save\/retry\/try-#\) \d+ times/] }],
  ["forced-colors", "save-outbox", {}, { tried: "1+" }],
  ["forced-colors", "reads-on-load", {}, { reads: true }],
  // The load window passes for every page of the context: a popup the page opens while it loads saves.
  ["forced-colors", "load-popup", {}, { loadWrites: true }],
  // Documents that leave (review 5's B1 and B3, review 6's B1): the network is cut, so the navigation ends
  // on an error page and nothing the leaving document sends reaches the server, whichever realm or event
  // sends it; the route does not see a leaving document, so nothing is recorded.
  ["forced-colors", "save-leave-nav", {}, { left: "an error page" }],
  ["text-reflow", "save-resize-leave", {}, { left: "an error page" }],
  ["text-reflow", "save-spacing-redirect", {}, { left: "an error page" }],
  ["forced-colors", "save-xrealm-leave", {}, { left: "an error page" }],
  ["forced-colors", "save-pageswap", {}, { left: "an error page" }],
  ["forced-colors", "save-form-self", {}, { left: "an error page", tried: "1+", triedSay: [/the page tried to write \(POST \/save\/form\/self\)/] }],
  // fetchLater is sent by the browser, unseen by the route: nothing recorded, nothing received.
  ["forced-colors", "save-fetchlater", {}],
  ["forced-colors", "save-forms", {}, { tried: "1+", triedSay: [/a new window, or a worker \(no page\) tried to write \(POST \/save\/form\/blank\)/, /the page tried to write \(POST \/save\/form\/frame\)/] }],
  ["forced-colors", "save-ping", {}, { tried: "1+", triedSay: [/\(POST \/save\/ping\/fragment\)/] }],
  ["forced-colors", "save-xhr", {}, { tried: "1+", triedSay: [/\(POST \/save\/xhr\/async\)/, /\(POST \/save\/xhr\/sync\)/] }],
  ["forced-colors", "save-get", {}],
  // 45 kinds: 40 kept apart, 5 counted together; 7 described, the eighth sample counts the other 38.
  ["forced-colors", "save-many-paths", {}, { tried: 45, triedLines: 8, triedSay: [/^and 38 more writes of other kinds, not described here$/] }],
  ["forced-colors", "save-late", {}, { tried: 1, triedSay: [/\(POST \/save\/late\) once while the network was cut off, first when the check ended/] }],
  // Sockets (review 6's B2): an open socket's message from the page, a dedicated worker, a popup, a page that
  // then leaves; a new socket. The cut closes the open ones and refuses new ones. The worker's POST is recorded.
  ["forced-colors", "save-ws-open", {}],
  ["forced-colors", "save-worker-ws", {}, { tried: "1+", triedSay: [/\(POST \/save\/worker-ws\/fetch\)/] }],
  ["forced-colors", "save-popup-ws", {}],
  ["forced-colors", "save-ws-leave", {}, { left: "an error page" }],
  ["forced-colors", "save-xo-frame", {}, { tried: "1+", triedSay: [/\(POST \/save\/xo\/fetch\)/] }],
  // WebTransport goes through no proxy, so under the run's proxy no QUIC packet is sent at all.
  ["forced-colors", "save-webtransport", {}],
  // WebRTC's UDP goes past the cut: RTCPeerConnection is taken away and the run is "not checked".
  ["forced-colors", "save-webrtc", {}, { needs: "WebRTC connection" }],
  ["forced-colors", "save-webrtc-load", {}, { needs: "WebRTC connection" }],
  ["forced-colors", "cut-banner", {}],
  ["text-reflow", "save-resize-style", {}, { tried: "1+", triedSay: [/\(POST \/save\/resize\)/] }],
  ["text-spacing", "save-resize-style", {}, { tried: "1+", triedSay: [/\(POST \/save\/style\)/] }],
  ["forced-colors", "save-popup-close", {}],
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
/** Every case whose page writes after the cut: the mutant without the cut must fail each. Not the WebRTC pages
 * (taken away, cut or not) nor save-webtransport (no QUIC under any proxy, cut or not: R:no-proxy fails it). */
const SAVE_CASES = CASES.filter(([, p, , o = {}]) => p.startsWith("save-") && !o.needs && p !== "save-webtransport").map(([id, p]) => [id, p]);
// Each marked condition: the check it belongs to, and the page whose result must change without it.
// A mutant may name several [check, page] pairs; it must fail each. Not marked, with the reason: the
// walk's `break` when focus comes back to the start (`continue` there ends the walk the same way, at
// FOCUS_STEPS), forced-color-adjust:none on a state pair (its colours stay, so the pair still differs;
// the line only saves work), and `tried.clear()` in `take` (each guard's `take` runs once, then its
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
  // The cut, its drop of open connections, and its refusal of new ones (no reconnect).
  cut: SAVE_CASES,
  "drop-open": [["forced-colors", "save-ws-open"], ["forced-colors", "save-worker-ws"]],
  "refuse-new": [["forced-colors", "save-on-focus"], ["forced-colors", "save-ws-open"], ["forced-colors", "save-retry"]],
  webrtc: [["forced-colors", "save-webrtc"], ["forced-colors", "save-webrtc-load"]],
  tried: ["forced-colors", "save-on-focus"],
  "tried-keep": [["forced-colors", "save-on-focus"], ["forced-colors", "save-many-paths"]],
  "from-worker": ["forced-colors", "save-forms"],
  "from-popup": ["forced-colors", "save-in-popup"],
  "watch-moment": ["forced-colors", "save-via-sw"],
  moment: ["forced-colors", "save-on-focus"],
  left: [["text-reflow", "save-spacing-redirect"], ["forced-colors", "save-form-self"]],
  "samples-cap": ["forced-colors", "save-many-paths"],
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
  ["overflow-drops", "a11y", "if (!tried.has(key) && tried.size >= TRIED_GROUPS) key = MORE;", "if (!tried.has(key) && tried.size >= TRIED_GROUPS) return;", "forced-colors", "save-many-paths"],
  ["guard-post-only", "a11y", "if (cut && !SAFE_METHODS.includes(req.method())) {", 'if (cut && req.method() === "POST") {', "forced-colors", "save-on-focus"],
  ["tried-groups-1", "a11y", "export const TRIED_GROUPS = 40;", "export const TRIED_GROUPS = 1;", "forced-colors", "save-on-focus"],
  ["tried-no-fold", "a11y", '.pathname.replace(/\\d+/g, "#")', ".pathname", "forced-colors", "save-retry"],
  // The proxy carries loopback (a bypass of `<loopback>` would send the app's own localhost past it; with no
  // bypass Playwright adds `<-loopback>` itself, measured), the context goes through the proxy at all, and the
  // cut comes after the load, not before it.
  ["no-loopback", "a11y", 'bypass: "<-loopback>" },', 'bypass: "<loopback>" },', "forced-colors", "save-on-focus"],
  ["no-proxy", "a11y", 'proxy: { server: `http://127.0.0.1:${port}`, bypass: "<-loopback>" },', "proxy: undefined as unknown as { server: string; bypass: string },", "forced-colors", "save-webtransport"],
  ["cut-at-load", "a11y", "await context.addInitScript(inEveryDocument);", "network.cut();\n  await context.addInitScript(inEveryDocument);", "forced-colors", "reads-on-load"],
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

// --- what the cut stops, what passes before it, and what makes a run refuse: the README's table, as data -----
// [what the page sends, what happens to it, proved by]: "proved by" names fixtures ("<check> <page>" for a
// browser case, "phase /<route>" for the phase run) and the mutants that remove what the row says (M: a marked
// line, R: a replacement, S: a spec mutant), each of which must fail one of those fixtures. Every row that says
// "cut" is a row of the round 6 measurement where the server received nothing after the cut; its fixtures assert
// that on the server. `channelTable` checks this list against CASES, the mutants and the README's table.
const CHANNELS = [
  ["a write of a live page, a popup, a frame (also of another origin) or a dedicated worker: `fetch` (also `keepalive`), `XMLHttpRequest`, `sendBeacon`, a form posted into the page, a frame or a new window, `<a ping>`; also one set off by the check (focus, forced colours, a resize, a style tag) or as it ends", "cut; recorded in `tried`, with who sent it and what the check was doing (the spec waits 500 ms after a check before it takes them; 40 kinds kept apart, 7 described)", ["forced-colors save-on-focus", "forced-colors save-xhr", "forced-colors save-forms", "forced-colors save-form-self", "forced-colors save-ping", "forced-colors save-in-popup", "forced-colors save-in-worker", "forced-colors save-via-sw", "forced-colors save-xo-frame", "text-reflow save-resize-style", "text-spacing save-resize-style", "forced-colors save-late", "forced-colors save-many-paths", "phase /save-on-focus", "phase /save-late"], ["M:cut", "M:refuse-new", "R:no-loopback", "S:spec-no-proxy", "M:tried", "M:from-popup", "M:from-worker", "M:watch-moment", "M:moment", "S:no-settle", "M:samples-cap", "M:tried-keep", "R:overflow-drops"]],
  ["a write of a document as it leaves (a redirect, a navigation, a popup closed), also through another frame's realm or in `pageswap` or `navigate`; `fetchLater`, at once, later or as the context closes", "cut; not recorded (no route sees them)", ["forced-colors save-leave-nav", "text-reflow save-resize-leave", "forced-colors save-xrealm-leave", "forced-colors save-pageswap", "forced-colors save-popup-close", "forced-colors save-fetchlater"], ["M:cut"]],
  ["a WebSocket message, on a socket open since the load (from the page, a dedicated worker, a popup, a page that then leaves) or on a new one; a SharedWorker's requests; a GET (an image, a script, `EventSource`, a prefetch, speculation rules)", "cut: the proxy closes every open connection and refuses new ones; not recorded", ["forced-colors save-ws-open", "forced-colors save-worker-ws", "forced-colors save-popup-ws", "forced-colors save-ws-leave", "forced-colors save-in-shared-worker", "forced-colors save-shw-iframe", "forced-colors save-get", "phase /save-ws-open"], ["M:cut", "M:drop-open", "M:refuse-new", "S:spec-no-proxy"]],
  ["a WebTransport session", "not sent at all: Chromium sends no QUIC through a proxy, cut or not", ["forced-colors save-webtransport"], ["R:no-proxy"]],
  ["a timer or a retry loop, an outbox kept in localStorage, `BroadcastChannel` or a `storage` event to another tab", "cut; the context is closed while cut off and nothing it stored is captured, so the next run starts from the test's storage state", ["forced-colors save-retry", "forced-colors save-outbox", "phase /save-retry", "phase /save-outbox", "phase /save-tabsync"], ["M:cut", "S:chain-state"]],
  ["a write while the page loads, from the page or a popup it opens (a page view, an error report, an auth refresh, a read through POST)", "passes, as in the scored phase: the cut comes after the load", ["forced-colors reads-on-load", "forced-colors load-popup", "phase /reads-on-load"], ["R:cut-at-load"]],
  ["a GET that writes before the cut (a page view logged by GET)", "passes, as in the scored phase", [], []],
  ["a WebRTC connection, as the page loads or during the check (its UDP goes past the proxy)", "refused: `RTCPeerConnection` is taken away, and the run is not checked", ["forced-colors save-webrtc", "forced-colors save-webrtc-load", "phase /save-webrtc", "phase /save-webrtc-load"], ["M:webrtc", "S:no-refusal"]],
  ["a page that changes when cut off (an offline banner, an error state)", "checked as it is then; `changedWhenCut` names the change, and the log says \"changed when cut off\"", ["phase /cut-banner"], ["S:no-second-fingerprint"]],
  ["a page that leaves its route during a check (under the cut, a navigation to another document ends on an error page)", "not checked, with where it went; nothing it measured there is reported", ["text-reflow save-spacing-redirect", "phase /save-spacing-redirect"], ["M:left", "S:no-left-check"]],
];

/** The table as the README prints it. */
const channelTableText = () =>
  [
    "| What the page sends | What happens to it | Proved by |",
    "|---|---|---|",
    ...CHANNELS.map(([ch, how, fx, mu]) => `| ${ch} | ${how} | ${fx.length ? `${fx.map((f) => (f.startsWith("phase ") ? `the phase run, \`${f.slice(6)}\`` : `\`${f.split(" ")[1]}.html\` (${f.split(" ")[0]})`)).join(", ")}; ${mu.join(", ")}` : "none"} |`),
  ].join("\n");

/** Every row but the one that only passes has a fixture and a mutant that targets it; the README's table is this one. */
function channelTable() {
  const why = [];
  for (const [ch, how, fx, mu] of CHANNELS) {
    const pages = fx.filter((f) => !f.startsWith("phase ")).map((f) => f.split(" "));
    const phase = fx.filter((f) => f.startsWith("phase ")).map((f) => f.slice(6));
    if (!(how.startsWith("passes") && !fx.length) && (!fx.length || !mu.length)) why.push(`${ch}: a row needs a fixture and a mutant`);
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
  if (!readme.includes(channelTableText())) why.push("the README's table is not this one (print it with --print-channel-table)");
  ok(!why.length, `the cut table: ${CHANNELS.length} rows, every row with a fixture and a mutant run on it, and the README prints it`, why.join("; "));
}

/** What reached the server and counts as a write: a request that is not GET or HEAD, a request to /save, a WebSocket message, a UDP packet. */
const isWrite = (w) => /^(WS|UDP) /.test(w) || !/^(GET|HEAD) /.test(w) || /\/save([/?]|$)/.test(w.split(" ")[1] ?? "");

/** How a result differs from its case, or "" when it is the case. `before` and `after` are what reached the server before and after the cut. */
function differs(r, kase, before, after) {
  const [, , kinds, { notes = 0, reads = false, loadWrites = false, tried = undefined, triedSay = [], triedLines = null, needs = null, left = null } = {}] = kase;
  const writes = after.filter(isWrite);
  if (writes.length) return `the server received after the cut: ${writes.join(", ")}`;
  if (reads && !before.some((p) => p.includes("/read"))) return "the page's read while it loads did not reach the server";
  if (loadWrites && !before.some((p) => /\/save([/?]|$)/.test(p))) return "the popup's write while the page loaded did not reach the server";
  const said = [...r.samples, ...(r.tried?.samples ?? [])];
  if (said.some((s) => s.includes("/read"))) return `a read while the page loaded was reported: ${said.join(" | ")}`;
  if (needs) return r.error && r.error.startsWith("not checked") && r.error.includes(needs) ? "" : `want "not checked" naming ${needs}, got ${JSON.stringify(r)}`;
  if (left && !(r.error && r.error.startsWith("not checked: the page left its route") && r.error.includes(`it went to ${left}`))) return `want "not checked: the page left its route" to ${left}, got ${JSON.stringify(r)}`;
  if (r.error && !left) return `errored: ${r.error}`;
  if (!left && (Object.keys(r.kinds).length !== Object.keys(kinds).length || Object.entries(kinds).some(([k, n]) => (r.kinds[k] ?? 0) !== n))) return `kinds ${JSON.stringify(r.kinds)} != ${JSON.stringify(kinds)}`;
  const want = Object.entries(kinds);
  // A write tried is never a finding: the count is the findings' alone.
  if (r.count !== want.reduce((a, [, n]) => a + n, 0)) return `count ${r.count} is not the findings' ${JSON.stringify(r.kinds)}`;
  const got = r.tried?.count ?? 0;
  // A page that left: what it tried as it went is the browser's timing, so only a stated number is checked.
  const wantTried = tried ?? (left ? null : 0);
  if (wantTried !== null && (wantTried === "1+" ? got < 1 : got !== wantTried)) return `tried ${got}, want ${wantTried}: ${JSON.stringify(r.tried)}`;
  const lines = r.tried?.samples ?? [];
  if (triedLines !== null && lines.length !== triedLines) return `tried in ${lines.length} lines, want ${triedLines}: ${lines.join(" | ")}`;
  for (const re of triedSay) if (!lines.some((l) => re.test(l))) return `no tried line matches ${re}: ${lines.join(" | ")}`;
  if ((r.notes ?? []).length !== notes) return `notes ${JSON.stringify(r.notes ?? [])}, want ${notes}`;
  return "";
}

// --- the fixture server: pages by name, and a log of what reached it: every request, every WebSocket
// message, every UDP packet on the same port (a WebRTC STUN request, a QUIC packet) --------------------
function serve(port) {
  const log = [];
  const rec = (what) => log.push({ what, at: Date.now() });
  const server = http.createServer((req, res) => {
    rec(`${req.method} ${req.url}`);
    if (req.method !== "GET" && req.method !== "HEAD") {
      req.resume();
      res.writeHead(204, { "access-control-allow-origin": "*" });
      return res.end();
    }
    const u = new URL(req.url, "http://x");
    if (/^\/save([/?]|$)/.test(u.pathname)) {
      res.writeHead(204, { "access-control-allow-origin": "*" });
      return res.end();
    }
    const name = path.basename(u.pathname.replace(/\/$/, "/clean")) || "clean";
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
  // A WebSocket: the handshake, then every text frame the browser sends (masked, short frames: the fixtures').
  server.on("upgrade", (req, sock) => {
    const accept = crypto.createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.on("data", (buf) => {
      if ((buf[0] & 0x0f) !== 1) return;
      const len = buf[1] & 0x7f;
      const mask = buf.subarray(2, 6);
      rec(`WS ${Buffer.from(buf.subarray(6, 6 + len).map((b, i) => b ^ mask[i % 4])).toString()}`);
    });
    sock.on("error", () => {});
  });
  const udp = dgram.createSocket("udp4");
  udp.on("message", (m) => rec(`UDP ${m.length} bytes`));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      udp.once("error", (err) => server.close(() => reject(err)));
      udp.bind(port, "127.0.0.1", () => resolve({ server, udp, log, port }));
    });
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
// Nothing waits on the close: the run reads no more of the server once it calls this.
const close = async (s) => {
  s.udp.close();
  s.server.closeAllConnections();
  s.server.close();
};

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
  // One check on one page, as the spec's `run` runs it: the run's network (a proxy of its own), a context made
  // through it with service workers blocked and the write guard, a new page, loaded and settled, "not checked"
  // when the page tried to start what the checks take away, the cut (`watch`), settled again, the check,
  // 500 ms, then "not checked" if the page left its route or started what is taken away, else the writes the
  // route saw in `tried`; the context is closed while cut off, on every path, then the proxy; what reached
  // the server is read after, split at the moment of the cut.
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const check = async (mods, id, page) => {
    const net = await mods.a11y.networkCut();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "he-IL", serviceWorkers: "block", proxy: net.proxy });
    const start = srv.log.length;
    let cutAt = Infinity;
    const failed = (err) => ({ count: 0, kinds: {}, samples: [], error: String(err?.message ?? err) });
    const LEFT = (to) => `not checked: the page left its route during the check (it went to ${to}); nothing measured after that is reported`;
    const TAKEN = (what) => `not checked: the page tries to start a ${what}, which the network cut does not reach, so these checks take it away`;
    let r;
    let guard = null;
    let p = null;
    try {
      guard = await mods.a11y.installWriteGuard(ctx, net);
      const watch = guard.watch;
      guard.watch = (pg, moment) => {
        if (cutAt === Infinity) cutAt = Date.now();
        watch(pg, moment);
      };
      p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:${srv.port}/${page}`);
      await p.waitForLoadState("networkidle").catch(() => {});
      await wait(1200);
      const taken = await mods.a11y.needsTakenAway(p);
      if (taken) throw new Error(TAKEN(taken));
      guard.watch(p, "the network was cut off");
      await p.waitForLoadState("networkidle").catch(() => {});
      await wait(1200);
      r = await RUN[id][1](mods, p, guard);
      await wait(500);
      const went = guard.left(p);
      const late = await mods.a11y.needsTakenAway(p);
      r = mods.a11y.withTried(went ? failed(LEFT(went)) : late ? failed(TAKEN(late)) : r, guard.take());
    } catch (err) {
      const went = guard && p ? guard.left(p) : null;
      r = mods.a11y.withTried(failed(went ? LEFT(went) : err), guard ? guard.take() : []);
    } finally {
      net.cut();
      await ctx.close();
      await net.close();
    }
    await wait(300);
    const mine = srv.log.slice(start);
    return { r, before: mine.filter((e) => e.at < cutAt).map((e) => e.what), after: mine.filter((e) => e.at >= cutAt).map((e) => e.what) };
  };
  try {
    for (const kase of CASES) {
      const [id, page, kinds, opts = {}] = kase;
      const { r, before, after } = await check(real, id, page);
      const why = differs(r, kase, before, after);
      const extra = [opts.notes ? `${opts.notes} note` : "", opts.tried ? `${opts.tried} tried while cut off` : "", opts.needs ? `"not checked" for ${opts.needs}` : "", opts.left ? `left to ${opts.left}` : ""].filter(Boolean).join(", ");
      ok(!why, `${id} on ${page}.html finds ${JSON.stringify(kinds)}${extra ? ` (${extra})` : ""}, and the server received nothing after the cut`, `${why}; ${JSON.stringify(r)}`);
      const w = (xs) => xs.filter(isWrite);
      console.log(`       ${id} on ${page}.html: ${JSON.stringify({ count: r.count, kinds: r.kinds, notes: r.notes, tried: r.tried, error: r.error, samples: r.samples.slice(0, 3) })}; server writes before the cut ${w(before).length}, after ${w(after).length}`);
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
      const { r, before, after } = await check({ ...real, [module]: mod }, id, page);
      const why = differs(r, caseOf(id, page), before, after);
      ok(!!why, `${id}: the mutant ${name} fails the ${page}.html case`, `the mutant still gives ${JSON.stringify({ kinds: r.kinds, tried: r.tried, error: r.error })}`);
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
// The phase run also takes the pages that try to write (the second review's C7): the spec's own wiring of
// the cut, end to end. Only the extended checks switch forced colours on, press Tab or resize a loaded page,
// and the pages below write only then (or when something of an earlier run outlives it: an outbox in
// localStorage, another open tab, a retry loop), so the server must get none of their writes at any time of
// the run (WHOLE_RUN), and no write at all from the moment the extended checks start (2 s after the last
// standard result is written) but the reads of reads-on-load as it loads.
const SAVE_ROUTES = [
  "/save-on-focus",
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
  "/save-xrealm-leave",
  "/save-pageswap",
  "/save-worker-ws",
  "/save-popup-ws",
  "/save-ws-leave",
  "/save-ws-open",
  "/save-webrtc",
  "/save-webrtc-load",
  "/cut-banner",
  "/reads-on-load",
];
// save-xrealm-leave and save-pageswap write as a page leaves, which the other phases' navigations set off too.
const WHOLE_RUN = /\/save\/(outbox|tabsync|retry|fetchlater|form|ping|popup-leave|late|worker-ws)\b|ev=(via-sw|popup)|^(WS|UDP) /;
const IDS = ["forced-colors", "text-reflow", "text-spacing", "consent-prechecked", "consent-refuse"];
const sum = (kinds) => Object.values(kinds).reduce((a, b) => a + b, 0);

/**
 * What a checks-phase run must show, as [name, routes it needs, holds, detail] rows: every row whose routes
 * all ran is judged. `got` is what reached the server during the run judged, `extStart` the moment the
 * extended checks started, `log` the run's output.
 */
function phaseRows({ dir, routes, got, extStart, log }) {
  const out = path.join(dir, "reports", "dod", "results", "extended");
  const read = (slug) => (fs.existsSync(path.join(out, `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join(out, `${slug}.json`), "utf8")) : null);
  const writes = got.filter((p) => isWrite(p.what) && p.at >= extStart && !p.what.startsWith("POST /read")).map((p) => p.what);
  const writesBefore = got.filter((p) => isWrite(p.what) && p.at < extStart).length;
  const wholeRun = got.filter((p) => WHOLE_RUN.test(p.what)).map((p) => p.what);
  const reads = got.filter((p) => p.what.startsWith("POST /read"));
  const chk = (slug, id) => read(slug)?.checks[id];
  const triedOf = (slug, id) => chk(slug, id)?.tried?.count ?? 0;
  const triedSays = (slug, id, re) => (chk(slug, id)?.tried?.samples ?? []).some((l) => re.test(l));
  const counts = (slug) => IDS.map((id) => chk(slug, id)?.count);
  const errs = (slug) => IDS.filter((id) => chk(slug, id)?.error);
  const logLine = (slug) => log.split("\n").find((l) => l.includes(`[dod] extended /${slug}:`)) ?? "";
  const leftTo = (slug, id, to) => (chk(slug, id)?.error ?? "").startsWith("not checked: the page left its route") && chk(slug, id).error.includes(`it went to ${to}`) && chk(slug, id).count === 0 && !chk(slug, id).samples.length;
  const rows = [];
  const row = (name, need, holds, detail = "") => rows.push([name, need, holds, detail]);
  const all = routes.map((r) => read(r.slice(1))).filter(Boolean);
  row(`no write reached the server while the extended checks ran, but reads-on-load's reads as it loads (${writesBefore} came earlier, from the other phases)`, [], !writes.length, writes.join(", "));
  row(`no write of the pages that write only in these checks reached the server at any time of the run (${got.length} requests and messages reached it in all)`, [], !wholeRun.length, wholeRun.join(", "));
  for (const slug of ["save-on-focus", "save-via-sw", "save-in-worker", "save-outbox", "save-retry", "save-forms", "save-ping", "save-late", "save-worker-ws"])
    row(`${slug}.json: forced-colors recorded ${triedOf(slug, "forced-colors")} write(s) tried while cut off, every count 0, and the log says "forced-colors clean (N writes tried while cut off)"`, [`/${slug}`], triedOf(slug, "forced-colors") >= 1 && counts(slug).every((n) => n === 0) && !errs(slug).length && /forced-colors clean \(\d+ writes? tried while cut off\)/.test(logLine(slug)), JSON.stringify(read(slug)));
  for (const slug of ["save-in-popup", "save-fetchlater", "save-popup-close", "save-popup-ws", "save-ws-open", "save-tabsync"])
    row(`${slug}.json: every check clean, nothing errored`, [`/${slug}`], counts(slug).every((n) => n === 0) && !errs(slug).length, JSON.stringify(read(slug)));
  row(`save-retry.json: no other check records a try of the loop or counts one (${IDS.map((id) => `${id} ${triedOf("save-retry", id)}`).join(", ")})`, ["/save-retry"], IDS.filter((id) => id !== "forced-colors").every((id) => triedOf("save-retry", id) === 0 && chk("save-retry", id)?.count === 0), JSON.stringify(read("save-retry")));
  row("save-late.json: the write set off as forced-colors ends (200 ms after) is recorded under forced-colors", ["/save-late"], triedSays("save-late", "forced-colors", /\(POST \/save\/late\)/), JSON.stringify(chk("save-late", "forced-colors")));
  row('save-forms.json: the form posted into a new window is recorded as "a new window, or a worker (no page)"', ["/save-forms"], triedSays("save-forms", "forced-colors", /a new window, or a worker \(no page\) tried to write \(POST \/save\/form\/blank\)/), JSON.stringify(chk("save-forms", "forced-colors")));
  // Pages that leave their route during a check: under the cut the navigation ends on an error page.
  row('save-resize-leave.json: text-reflow and text-spacing are "not checked: the page left its route" (it went to an error page), and the log says "not checked"', ["/save-resize-leave"], ["text-reflow", "text-spacing"].every((id) => leftTo("save-resize-leave", id, "an error page")) && /text-reflow not checked.*text-spacing not checked/.test(logLine("save-resize-leave")), JSON.stringify(read("save-resize-leave")));
  row("save-spacing-redirect.json: nothing of where it went is reported under it (text-spacing not checked, 0 findings)", ["/save-spacing-redirect"], leftTo("save-spacing-redirect", "text-spacing", "an error page") && !/found/.test(logLine("save-spacing-redirect")), JSON.stringify(read("save-spacing-redirect")));
  for (const slug of ["save-xrealm-leave", "save-pageswap", "save-ws-leave"])
    row(`${slug}.json: forced-colors is "not checked: the page left its route" (an error page)`, [`/${slug}`], leftTo(slug, "forced-colors", "an error page"), JSON.stringify(chk(slug, "forced-colors")));
  // The refusal: a page that tries to start a WebRTC connection, during the check or as it loads.
  row('save-webrtc.json: forced-colors is "not checked", naming the WebRTC connection, and the log says so', ["/save-webrtc"], /^not checked: the page tries to start a WebRTC connection/.test(chk("save-webrtc", "forced-colors")?.error ?? "") && /forced-colors not checked/.test(logLine("save-webrtc")), JSON.stringify(chk("save-webrtc", "forced-colors")));
  row('save-webrtc-load.json: every check is "not checked", naming the WebRTC connection', ["/save-webrtc-load"], IDS.every((id) => /^not checked: the page tries to start a WebRTC connection/.test(chk("save-webrtc-load", id)?.error ?? "")), JSON.stringify(read("save-webrtc-load")));
  // The page under the cut: its banner is named on every check, and the log says so.
  row('cut-banner.json: every check carries `changedWhenCut`, and the log says "changed when cut off" for each', ["/cut-banner"], IDS.every((id) => typeof chk("cut-banner", id)?.changedWhenCut === "string") && (logLine("cut-banner").match(/changed when cut off/g) ?? []).length === IDS.length, `${logLine("cut-banner")} ${JSON.stringify(read("cut-banner"))}`);
  row("no other page changed when cut off", [], !all.some((j) => j.route !== "/cut-banner" && IDS.some((id) => j.checks[id]?.changedWhenCut)), all.filter((j) => j.route !== "/cut-banner" && IDS.some((id) => j.checks[id]?.changedWhenCut)).map((j) => j.route).join(", "));
  row("no result counts a write tried as a finding (no `write-held` kind)", [], !all.some((j) => IDS.some((id) => j.checks[id]?.kinds?.["write-held"] !== undefined)), "");
  // Review 5's C4: a recorded read would be in `tried.samples`, so both lists are read.
  const triedRead = all.flatMap((j) => IDS.flatMap((id) => [...(j.checks[id]?.samples ?? []), ...(j.checks[id]?.tried?.samples ?? [])])).filter((x) => x.includes("/read"));
  row(`a page's own POST while it loads reaches the server (${reads.length} reads)`, ["/reads-on-load"], reads.length > 0, `reads ${reads.length}`);
  row("no result records a page's own POST while it loads (its samples and its tried samples)", ["/reads-on-load"], !triedRead.length, triedRead.join(" | "));
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
  ["spec-no-proxy", [["proxy: net.proxy,", ""]], ["/save-on-focus", "/save-ws-open"], "no write reached the server while the extended checks ran"],
  ["no-settle", [["await settleWrites();", ""]], ["/save-late"], "save-late.json: the write set off as forced-colors ends"],
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
  ["no-left-check", [["const went = guard.left(page);", "const went = null as string | null;"]], ["/save-spacing-redirect"], "save-spacing-redirect.json: nothing of where it went"],
  [
    "no-refusal",
    [
      ["if (taken) throw new Error(TAKEN(taken));", ""],
      ["const late = await needsTakenAway(page);", "const late = null as string | null;"],
    ],
    ["/save-webrtc", "/save-webrtc-load"],
    "save-webrtc.json: forced-colors is \"not checked\"",
  ],
  ["no-second-fingerprint", [["const changed = fingerprintDiff(before, await pageFingerprint(page), CUT_TOLERANCE);", "const changed = before ? null : null;"]], ["/cut-banner"], "cut-banner.json: every check carries `changedWhenCut`"],
];

/** The checks phase of a real run: run-dod.mjs on a throwaway project with the routes above, then each spec mutant. */
async function phaseTest() {
  const srv = await serveFree();
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
    for (const [name, , holds, detail] of phaseRows({ dir, routes, got: srv.log, extStart, log })) ok(holds, name, detail);
    const dod = JSON.parse(fs.readFileSync(path.join(dir, "reports", "dod", "dod.json"), "utf8"));
    // No key of dod.json is one of these check ids (a route named /forced-colors is a route, "/forced-colors").
    const keys = new Set();
    const walk = (o) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) (keys.add(k), walk(v));
    };
    walk(dod);
    const leaked = [...IDS, "extended", "write-held", "tried", "changedWhenCut"].filter((id) => keys.has(id));
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
      const before = srv.log.length;
      const t0 = Date.now();
      const env = { ...process.env, PORT: String(srv.port), DOD_WORKERS: "1", DOD_USER: "", DOD_PASSWORD: "", DOD_PHASE: "checks" };
      delete env.CI;
      const r = await spawnIn(mdir, "run", process.execPath, [cli, "test", "-c", "playwright.dod.config.ts", "--project", "extended", "--reporter=line"], env);
      await new Promise((res) => setTimeout(res, 2000));
      const rows = phaseRows({ dir: mdir, routes: mroutes, got: srv.log.slice(before), extStart: t0, log: r.log });
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
