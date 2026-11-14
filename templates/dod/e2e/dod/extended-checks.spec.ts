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
// with service workers blocked and the write guard of a11y-extended.ts (installWriteGuard): every write
// of that context, except the page's own while it loads, is held, or not sent at all when a document
// tries it as it leaves, and reported in the run's `held` field, apart from its findings; the sends the
// guard sees and cannot hold (a WebSocket message, a WebRTC or WebTransport send) are named in
// `notHeld`. A page that left its route during the check is "not checked". When the run ends its
// context is closed, which runs none of the page's leaving handlers, while closing the page would. So
// nothing a run did, and nothing the app kept for later (an outbox in localStorage, a tab-sync channel,
// a timer), reaches the next run or outlives the context. The README's table of channels says, for
// every way a page can send something, what the guard does and which fixture proves it.
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
import {
  A11Y_CHECK_IDS,
  countSendsFromNow,
  forcedColorsCheck,
  installWriteGuard,
  needsTakenAway,
  sendsNotHeld,
  textReflowCheck,
  textSpacingCheck,
  withHeld,
  withNotHeld,
  type A11yResult,
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
/** After a check, how long a write it set off (a popup's, a worker's) has to reach the guard before the context closes. */
const SETTLE_WRITES_MS = 500;
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

/** Loads the route in `page` and throws unless it is the page the scored phase measured. The page is never closed (see above). */
async function openScoredPage(page: Page, entry: RouteEntry, scored: EntryResult): Promise<void> {
  await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
  const resp = await page.goto(entry.route, { waitUntil: "domcontentloaded" });
  await settle(page);
  const access = await accessCheck(page, entry.route, resp?.status() ?? null, ACCESS);
  if (access.unreachable_reason) throw new Error(`not checked: ${access.unreachable_reason}`);
  if (!scored.fingerprint) throw new Error("not checked: the scored phase recorded no fingerprint of this page");
  const diff = fingerprintDiff(scored.fingerprint, await pageFingerprint(page), entry.fingerprint);
  if (diff) throw new Error(`not checked: not the page the scored phase measured (${diff})`);
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
          // One context per run: load (the page's own writes pass while it loads), check, wait, take what the
          // guard held, close the context. Its page is never closed on its own (see the top of this file).
          // The two consent checks share one run, since both only read the page as it loaded.
          const run = async (ids: ExtendedId[], fn: (page: Page, guard: WriteGuard) => Promise<Partial<Record<ExtendedId, ExtendedResult>>>) => {
            if (outOfTime()) {
              for (const id of ids) checks[id] = failed(OUT_OF_TIME);
              return;
            }
            let ctx: BrowserContext | null = null;
            let guard: WriteGuard | null = null;
            let page: Page | null = null;
            try {
              ctx = await browser.newContext({
                ...options,
                storageState: startState,
                viewport: { width: WIDE.width, height: WIDE.height },
                colorScheme: "light",
                serviceWorkers: "block",
              });
              guard = await installWriteGuard(ctx);
              page = await ctx.newPage();
              guard.loading(page);
              await openScoredPage(page, entry, scored);
              const taken = await needsTakenAway(page);
              if (taken) throw new Error(`not checked: the page tries to start a ${taken}, which these checks take away (its requests cannot be held)`);
              await countSendsFromNow(page);
              const got = await fn(page, guard);
              await settleWrites();
              const went = guard.left(page);
              await guard.stopped(page);
              const sends = went ? {} : await sendsNotHeld(page);
              const held = guard.take();
              // Held writes and unheld sends belong to the run, so they go to its first check only.
              for (const id of ids) checks[id] = withNotHeld(withHeld(went ? failed(LEFT(went)) : (got[id] as ExtendedResult), id === ids[0] ? held : []), id === ids[0] ? sends : {});
            } catch (err) {
              if (guard && page) await guard.stopped(page);
              const held = guard ? guard.take() : [];
              const went = guard && page ? guard.left(page) : null;
              for (const id of ids) checks[id] = withHeld(failed(went ? LEFT(went) : err), id === ids[0] ? held : []);
            } finally {
              if (ctx) await ctx.close().catch(() => {});
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
        // A held write is said apart from the findings: "clean (2 writes held)", never "found 2". A send the
        // guard could not hold is never "clean": "no findings (1 send not held)".
        const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
        const extra = (r: ExtendedResult) => [r.held?.count ? `${plural(r.held.count, "write")} held` : "", r.notHeld?.count ? `${plural(r.notHeld.count, "send")} not held` : ""].filter(Boolean).join("; ");
        const state = (r: ExtendedResult) => (r.error ? (r.error.startsWith("not checked") ? "not checked" : "errored") : r.count ? `found ${r.count}` : r.notHeld?.count ? "no findings" : "clean");
        const line = EXTENDED_CHECK_IDS.map((id) => `${id} ${state(checks[id])}${extra(checks[id]) ? ` (${extra(checks[id])})` : ""}`).join(", ");
        console.log(`[dod] extended ${entry.route}: ${line}`);
      });
    });
  }
