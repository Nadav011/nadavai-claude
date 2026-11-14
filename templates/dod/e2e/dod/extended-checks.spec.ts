// The extended checks, in the checks phase of `pnpm dod`, after the scored phase has written its
// result: accessibility beyond axe (a11y-extended.ts: forced-colors, text-reflow, text-spacing) and
// honest choices (consent-checks.ts: consent-prechecked, consent-refuse). They report only: one
// file per route, results/extended/<slug>.json, and one line per route in the log.
// Nothing here reaches dod.json or a score. They run last: playwright.dod.config.ts puts this file in
// its own project (`extended`), the teardown of the project that runs every other check, so it starts
// only after those have finished and never takes their share of the phase's deadline; and each check
// starts only while more than DEADLINE_MARGIN_MS of that deadline is left ("not checked: out of time").
// Four runs per route: forced-colors, text-reflow and text-spacing each open a new page of the route, as
// the scored phase's light 1440 entry did, and the two consent checks share one, since both only read the
// page as it loaded. A run judges nothing until the access check and the scored page's fingerprint show
// it is the page the scored phase measured. Each run has a browser context of its own, made from the
// test's options and from the storage state the test started with (never one captured after a run),
// with service workers blocked, through a proxy of the run's own (networkCut in a11y-extended.ts).
// Before the check starts, the run cuts that context's network off, for good (installWriteGuard's
// `watch`): from then on nothing the page, a popup, a frame or a worker sends leaves the browser. The
// writes the context's route still sees are reported in the run's `tried` field, apart from its
// findings. Then it fingerprints the page again: a page that changed when it was cut off (an offline
// banner) says so in `changedWhenCut`. A page that left its route during the check is "not checked",
// and so is a page that tried to start a WebRTC connection, whose UDP goes past the cut. When the run
// ends its context is closed while still cut off, and nothing it stored is captured. The README's
// table says what the cut was measured to stop.
import fs from "node:fs";
import path from "node:path";
import { test, type BrowserContext, type Page } from "@playwright/test";
import {
  CHECKS_SIGNIN_FILE,
  fingerprintDiff,
  loadParams,
  loadRoutes,
  loadStandard,
  NOT_FOUND_PRINT,
  redact,
  RESULTS_DIR,
  routeQuery,
  routeSlug,
  VIEWPORTS,
  type EntryResult,
  type NotFoundPrint,
  type RouteEntry,
} from "./dod-shared";
import { accessCheck, pageFingerprint, settle, type AccessContext } from "./dod-page";
import type { FingerprintTolerance, PageFingerprint } from "./dod-shared";
import {
  A11Y_CHECK_IDS,
  forcedColorsCheck,
  installWriteGuard,
  needsTakenAway,
  networkCut,
  textReflowCheck,
  textSpacingCheck,
  withTried,
  type A11yResult,
  type NetworkCut,
  type WriteGuard,
} from "./a11y-extended";
import { CONSENT_CHECK_IDS, consentChecks } from "./consent-checks";

const EXTENDED_CHECK_IDS = [...A11Y_CHECK_IDS, ...CONSENT_CHECK_IDS] as const;
type ExtendedId = (typeof EXTENDED_CHECK_IDS)[number];
/** What every extended check writes: a count, the findings by kind, the first samples, notes, or why it could not judge. */
type ExtendedResult = A11yResult;

/** Where each route's result is written; the scored phase's global-setup empties `results/`. */
const EXTENDED_DIR = path.join(RESULTS_DIR, "extended");
/** A check starts only while more than this is left of the checks phase's deadline. */
const DEADLINE_MARGIN_MS = 20_000;
/** After a check, how long a write it set off (a popup's, a worker's) has to reach the guard's route before the context closes. */
const SETTLE_WRITES_MS = 500;
/** The page before and after the cut is compared with no tolerance but one control: the same page seconds apart. */
const CUT_TOLERANCE: FingerprintTolerance = { landmarks: true, headings: 1, controls: 0, words: 1 };
const routes = loadRoutes();
const standard = loadStandard();
const ACCESS: AccessContext = {
  routes,
  params: loadParams(),
  notFoundPrint: fs.existsSync(NOT_FOUND_PRINT) ? (JSON.parse(fs.readFileSync(NOT_FOUND_PRINT, "utf8")) as NotFoundPrint) : null,
};
const WIDE = VIEWPORTS[1];
const PHONE = VIEWPORTS[0];

function scoredResult(name: string): EntryResult | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, `${name}.json`), "utf8")) as EntryResult;
  } catch {
    return null;
  }
}

/** Loads the route in `page` and throws unless it is the page the scored phase measured; returns its fingerprint. */
async function openScoredPage(page: Page, entry: RouteEntry, scored: EntryResult): Promise<PageFingerprint> {
  await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
  const resp = await page.goto(entry.route, { waitUntil: "domcontentloaded" });
  await settle(page);
  const access = await accessCheck(page, entry.route, resp?.status() ?? null, ACCESS);
  if (access.unreachable_reason) throw new Error(`not checked: ${access.unreachable_reason}`);
  if (!scored.fingerprint) throw new Error("not checked: the scored phase recorded no fingerprint of this page");
  const now = await pageFingerprint(page);
  const diff = fingerprintDiff(scored.fingerprint, now, entry.fingerprint);
  if (diff) throw new Error(`not checked: not the page the scored phase measured (${diff})`);
  return now;
}

const merge = (parts: [string, A11yResult][]): ExtendedResult => {
  const kinds: Record<string, number> = {};
  for (const [, r] of parts) for (const [k, n] of Object.entries(r.kinds)) kinds[k] = (kinds[k] ?? 0) + n;
  return {
    count: parts.reduce((n, [, r]) => n + r.count, 0),
    kinds,
    samples: parts.flatMap(([at, r]) => r.samples.map((s) => `${at} ${s}`)).slice(0, 8),
  };
};

if (standard)
  for (const entry of routes) {
    const slug = routeSlug(entry.route);
    test.describe(`extended ${entry.route}`, () => {
      test.use({
        viewport: { width: WIDE.width, height: WIDE.height },
        colorScheme: "light",
        serviceWorkers: "block",
        ...(entry.audience === "anonymous" ? { storageState: { cookies: [], origins: [] } } : {}),
      });
      test(`extended ${slug}`, async ({
        browser,
        context,
        baseURL,
        locale,
        extraHTTPHeaders,
        httpCredentials,
        ignoreHTTPSErrors,
        timezoneId,
        userAgent,
        contextOptions,
        permissions,
        geolocation,
        bypassCSP,
        javaScriptEnabled,
        deviceScaleFactor,
        isMobile,
        hasTouch,
        offline,
        acceptDownloads,
      }) => {
        const scored = scoredResult(`${slug}__${WIDE.width}__light`);
        // Only a page the scored phase reached is checked, as in standard.spec.ts.
        if (!scored || !scored.reached || scored.unreachable) return;
        test.setTimeout(180_000);
        const checks = {} as Record<ExtendedId, ExtendedResult>;
        const failed = (err: unknown): ExtendedResult => ({ count: 0, kinds: {}, samples: [], error: redact(err, routeQuery(entry.route)).slice(0, 300) });
        const deadlineAt = Number(process.env.DOD_CHECKS_DEADLINE_AT ?? 0);
        const outOfTime = () => !!deadlineAt && Date.now() > deadlineAt - DEADLINE_MARGIN_MS;
        const OUT_OF_TIME = "not checked: out of time (less than 20 s left of the checks phase's checksMinutes)";
        if (entry.audience !== "anonymous" && fs.existsSync(CHECKS_SIGNIN_FILE)) {
          for (const id of EXTENDED_CHECK_IDS) checks[id] = failed("not checked: the checks phase could not sign in");
        } else {
          // The storage state the test started with: its context never opened a page.
          const startState = await context.storageState();
          const options = {
            ...contextOptions,
            baseURL,
            locale,
            extraHTTPHeaders,
            httpCredentials,
            ignoreHTTPSErrors,
            timezoneId,
            userAgent,
            permissions,
            geolocation,
            bypassCSP,
            javaScriptEnabled,
            deviceScaleFactor,
            isMobile,
            hasTouch,
            offline,
            acceptDownloads,
          };
          const settleWrites = () => new Promise((r) => setTimeout(r, SETTLE_WRITES_MS));
          // A page that left its route during the check measured another page: nothing of it is reported.
          const LEFT = (to: string) => `not checked: the page left its route during the check (it went to ${to}); nothing measured after that is reported`;
          const TAKEN = (what: string) => `not checked: the page tries to start a ${what}, which the network cut does not reach, so these checks take it away`;
          // One context per run: load, cut the network off, fingerprint the page again, check, wait, take the writes
          // the route saw, close the context while it is still cut off. The two consent checks share one run.
          const run = async (ids: ExtendedId[], fn: (page: Page, guard: WriteGuard) => Promise<Partial<Record<ExtendedId, ExtendedResult>>>) => {
            if (outOfTime()) {
              for (const id of ids) checks[id] = failed(OUT_OF_TIME);
              return;
            }
            let net: NetworkCut | null = null;
            let ctx: BrowserContext | null = null;
            let guard: WriteGuard | null = null;
            let page: Page | null = null;
            try {
              net = await networkCut();
              ctx = await browser.newContext({
                ...options,
                storageState: startState,
                viewport: { width: WIDE.width, height: WIDE.height },
                colorScheme: "light",
                serviceWorkers: "block",
                proxy: net.proxy,
              });
              guard = await installWriteGuard(ctx, net);
              page = await ctx.newPage();
              const before = await openScoredPage(page, entry, scored);
              const taken = await needsTakenAway(page);
              if (taken) throw new Error(TAKEN(taken));
              guard.watch(page, "the network was cut off");
              await settle(page);
              const changed = fingerprintDiff(before, await pageFingerprint(page), CUT_TOLERANCE);
              const got = await fn(page, guard);
              await settleWrites();
              const went = guard.left(page);
              const late = await needsTakenAway(page);
              const tried = guard.take();
              // The writes tried belong to the run, so they go to its first check only.
              for (const id of ids) {
                const r = went ? failed(LEFT(went)) : late ? failed(TAKEN(late)) : (got[id] as ExtendedResult);
                checks[id] = withTried(changed ? { ...r, changedWhenCut: changed } : r, id === ids[0] ? tried : []);
              }
            } catch (err) {
              const tried = guard ? guard.take() : [];
              const went = guard && page ? guard.left(page) : null;
              for (const id of ids) checks[id] = withTried(failed(went ? LEFT(went) : err), id === ids[0] ? tried : []);
            } finally {
              // Cut on every path, also when the run stopped before its check: the context is closed while cut off.
              net?.cut();
              if (ctx) await ctx.close().catch(() => {});
              if (net) await net.close();
            }
          };
          // Both consent checks read the page as it loaded, so one page serves them.
          await run([...CONSENT_CHECK_IDS], async (page, guard) => {
            guard.watch(page, "the page was read");
            return consentChecks(page);
          });
          await run(["forced-colors"], async (page, guard) => ({ "forced-colors": await forcedColorsCheck(page, guard) }));
          await run(["text-reflow"], async (page, guard) => ({ "text-reflow": await textReflowCheck(page, guard) }));
          await run(["text-spacing"], async (page, guard) => {
            const wide = await textSpacingCheck(page, guard);
            guard.moment(page, `the window was resized to ${PHONE.width}x${PHONE.height}`);
            await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
            await settle(page);
            return {
              "text-spacing": merge([
                [`${WIDE.width}x${WIDE.height}`, wide],
                [`${PHONE.width}x${PHONE.height}`, await textSpacingCheck(page, guard)],
              ]),
            };
          });
        }
        fs.mkdirSync(EXTENDED_DIR, { recursive: true });
        fs.writeFileSync(path.join(EXTENDED_DIR, `${slug}.json`), JSON.stringify({ route: entry.route, mode: "report", checks }, null, 2));
        // A write tried while cut off is said apart from the findings: "clean (2 writes tried while cut off)", never
        // "found 2"; a page that changed when cut off says so: "found 3 (changed when cut off)".
        const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
        const extra = (r: ExtendedResult) => [r.changedWhenCut ? "changed when cut off" : "", r.tried?.count ? `${plural(r.tried.count, "write")} tried while cut off` : ""].filter(Boolean).join("; ");
        const state = (r: ExtendedResult) => (r.error ? (r.error.startsWith("not checked") ? "not checked" : "errored") : r.count ? `found ${r.count}` : "clean");
        const line = EXTENDED_CHECK_IDS.map((id) => `${id} ${state(checks[id])}${extra(checks[id]) ? ` (${extra(checks[id])})` : ""}`).join(", ");
        console.log(`[dod] extended ${entry.route}: ${line}`);
      });
    });
  }
