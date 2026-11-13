// The extended checks, in the checks phase of `pnpm dod`, after the scored phase has written its
// result: accessibility beyond axe (a11y-extended.ts: forced-colors, text-reflow, text-spacing) and
// honest choices (consent-checks.ts: consent-prechecked, consent-refuse). They report only: one
// file per route, results/extended/<slug>.json, and one line per route in the log.
// Nothing here reaches dod.json or a score. Each check loads the route again, as the scored phase's
// light 1440 entry did, and judges nothing until the access check and the scored page's
// fingerprint show it is the page the scored phase measured.
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
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
import { A11Y_CHECK_IDS, forcedColorsCheck, textReflowCheck, textSpacingCheck, type A11yResult } from "./a11y-extended";
import { CONSENT_CHECK_IDS, consentChecks } from "./consent-checks";

const EXTENDED_CHECK_IDS = [...A11Y_CHECK_IDS, ...CONSENT_CHECK_IDS] as const;
type ExtendedId = (typeof EXTENDED_CHECK_IDS)[number];
/** What every extended check writes: a count, the findings by kind, the first samples, or why it could not judge. */
type ExtendedResult = Omit<A11yResult, "error"> & { error?: string };

/** Where each route's result is written; the scored phase's global-setup empties `results/`. */
const EXTENDED_DIR = path.join(RESULTS_DIR, "extended");
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

/** Loads the route and throws unless it is the page the scored phase measured. */
async function loadScoredPage(page: Page, entry: RouteEntry, scored: EntryResult) {
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
        ...(entry.audience === "anonymous" ? { storageState: { cookies: [], origins: [] } } : {}),
      });
      test(`extended ${slug}`, async ({ page }) => {
        const scored = scoredResult(`${slug}__${WIDE.width}__light`);
        // Only a page the scored phase reached is checked, as in standard.spec.ts.
        if (!scored || !scored.reached || scored.unreachable) return;
        test.setTimeout(180_000);
        const checks = {} as Record<ExtendedId, ExtendedResult>;
        const failed = (err: unknown): ExtendedResult => ({ count: 0, kinds: {}, samples: [], error: redact(err, routeQuery(entry.route)).slice(0, 300) });
        if (entry.audience !== "anonymous" && fs.existsSync(CHECKS_SIGNIN_FILE)) {
          for (const id of EXTENDED_CHECK_IDS) checks[id] = failed("not checked: the checks phase could not sign in");
        } else {
          const run = async (id: ExtendedId, fn: () => Promise<ExtendedResult>) => {
            try {
              await loadScoredPage(page, entry, scored);
              checks[id] = await fn();
            } catch (err) {
              checks[id] = failed(err);
            }
          };
          // Both consent checks read the page as it loaded, so one load serves them.
          try {
            await loadScoredPage(page, entry, scored);
            Object.assign(checks, await consentChecks(page));
          } catch (err) {
            for (const id of CONSENT_CHECK_IDS) checks[id] = failed(err);
          }
          await run("forced-colors", () => forcedColorsCheck(page));
          await run("text-reflow", () => textReflowCheck(page));
          await run("text-spacing", async () => {
            const wide = await textSpacingCheck(page);
            await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
            await settle(page);
            return merge([
              [`${WIDE.width}x${WIDE.height}`, wide],
              [`${PHONE.width}x${PHONE.height}`, await textSpacingCheck(page)],
            ]);
          });
        }
        fs.mkdirSync(EXTENDED_DIR, { recursive: true });
        fs.writeFileSync(path.join(EXTENDED_DIR, `${slug}.json`), JSON.stringify({ route: entry.route, mode: "report", checks }, null, 2));
        const line = EXTENDED_CHECK_IDS.map((id) => `${id} ${checks[id].error ? "errored" : checks[id].count ? `found ${checks[id].count}` : "clean"}`).join(", ");
        console.log(`[dod] extended ${entry.route}: ${line}`);
      });
    });
  }
