// Definition-of-Done audit, the scored phase. Never fails on findings: everything is recorded to
// reports/results/*.json and merged into reports/dod.json by global-teardown.
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  AXE_TAGS,
  RESULTS_DIR,
  SCHEMES,
  SCREENS_DIR,
  VIEWPORTS,
  loadArgos,
  loadParams,
  loadRoutes,
  loadScoring,
  NOT_FOUND_PRINT,
  normalizeRegionText,
  routeSlug,
  type EntryResult,
  type NotFoundPrint,
  type RouteEntry,
} from "./dod-shared";
import { reachRoute, settle, touchTargets } from "./dod-page";

// The scored phase. It never reads standard.json: the experience standard's checks are another
// phase (standard.spec.ts), run by run-dod.mjs after every entry of this one has finished.
const routes = loadRoutes();
const params = loadParams();
const scoring = loadScoring();
// The app's own not-found page, printed once by global-setup (absent: no comparison).
const notFoundPrint: NotFoundPrint | null = fs.existsSync(NOT_FOUND_PRINT)
  ? (JSON.parse(fs.readFileSync(NOT_FOUND_PRINT, "utf8")) as NotFoundPrint)
  : null;



/** The route's own region text, the same region reachRoute reads. */
function regionText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const region = document.querySelector("main, #main-content, #root, #__next") ?? document.body;
    return (region as HTMLElement).innerText ?? "";
  });
}

/**
 * Not-found and denial wording, the fallback when the page carries neither the standard's
 * markers nor the app's printed not-found text. Each is a phrase, never a bare number or a
 * bare word: "forbidden" or a "404" on a stat card is content.
 */
const NOT_FOUND_WORDING =
  /הדף לא נמצא|העמוד לא נמצא|הדף שחיפשת|שגיאה 404|page not found|this page could not be found|404 not found|error 404/i;
const DENIED_WORDING =
  /אין לך הרשאה|אין לך גישה|שגיאה 403|שגיאה 401|access denied|you (do not|don't) have (permission|access)|not authorized to|403 forbidden|401 unauthorized/i;

async function fontFamilies(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const set = new Set<string>();
    document.fonts.forEach((f) => {
      if (f.status !== "loaded") return;
      const fam = f.family.replace(/^["']|["']$/g, "").replace(/\s+Fallback$/i, "");
      set.add(fam);
    });
    return [...set].sort();
  });
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, failed: el.scrollWidth > el.clientWidth + 1 };
  });
}


async function reducedMotionViolations(page: Page) {
  return page.evaluate(() => {
    const running = document.getAnimations().filter((a) => a.playState === "running");
    const samples: string[] = [];
    let violations = 0;
    for (const a of running) {
      const eff = a.effect;
      if (!(eff instanceof KeyframeEffect)) continue;
      const usesTransform = eff.getKeyframes().some((k) =>
        ["transform", "translate", "rotate", "scale"].some((p) => p in k),
      );
      const timing = eff.getComputedTiming();
      // A near-zero duration is the accepted "disable" technique.
      const dur = typeof timing.duration === "number" ? timing.duration : 0;
      const target = eff.target as Element | null;
      // The other accepted technique, and the one the WCAG note actually describes:
      // a busy indicator that has to keep turning because it is the only thing saying
      // the app is still working, slowed until it no longer reads as motion. A spinner
      // at 1.4s or more is that, not a defect — and a probe that cannot tell the two
      // apart teaches people to delete the honest fix.
      const slowedSpinner = dur >= 1400 && target?.classList.contains("animate-spin");
      if (usesTransform && dur > 50 && !slowedSpinner) {
        violations++;
        if (samples.length < 8) {
          samples.push(
            `${target?.tagName.toLowerCase() ?? "?"}${target?.className ? "." + String(target.className).split(" ").slice(0, 3).join(".") : ""} ${a.constructor.name} ${dur}ms`,
          );
        }
      }
    }
    return { violations, samples };
  });
}




/**
 * Everything that is scored, for one entry, in one sequence: the load, the access checks, the
 * screenshot, overflow, axe, fonts, touch targets, the reduced-motion reload and the console count
 * over all of it. It returns with the console count frozen. The experience standard's checks are
 * not in this run at all: run-dod.mjs runs them as a second Playwright run after this one.
 */
async function measureEntry(
  page: Page,
  entry: RouteEntry,
  viewport: { width: number; height: number },
  scheme: (typeof SCHEMES)[number],
  slug: string,
  name: string,
): Promise<EntryResult> {
  const { route } = entry;
  const consoleErrors: string[] = [];
  let frozen = false;
  page.on("console", (m) => {
    if (!frozen && m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => {
    if (!frozen) consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`);
  });
  let measuredUrl = "";
  const result: EntryResult = {
    route,
    slug,
    audience: entry.audience,
    viewport: { ...viewport },
    scheme,
    status: null,
    load_error: null,
    unreachable: false,
    unreachable_reason: null,
    reached: false,
    not_reached_reason: null,
    screenshot: null,
    overflow: { scrollWidth: 0, clientWidth: 0, failed: false },
    axe: { version: null, counted: 0, scored: 0, by_impact: {}, violations: [] },
    console_errors: consoleErrors,
    fonts: { families: [], count: 0 },
    touch_targets: { checked: false, failures: 0, samples: [] },
    reduced_motion: { violations: 0, samples: [] },
  };

  try {
    const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
    result.status = resp?.status() ?? null;
    await settle(page);

    // Access check: the QA account must be able to open every page. A non-2xx,
    // a bounce to a login or access-denied screen, or an empty body means the
    // page was not measured, so it must not be scored as if it passed.
    const landed = new URL(page.url()).pathname + new URL(page.url()).search;
    const expected = route.split("?")[0] ?? route;
    // ANY redirect away from the requested path means this page was not
    // measured, wherever it went. The rule used to be `!landed.startsWith(expected)`
    // AND a keyword test for a login-looking destination — two holes at once.
    // A middleware that sends an unauthorised visitor to `/` matches no keyword,
    // so on Green Room 52 admin and coach routes could each have been awarded
    // the HOME PAGE's score, four entries apiece, and the report would have
    // said 100. And `startsWith` let `/admin` stand in for `/adminXYZ`.
    //
    // Apps do have legitimate aliases, so `alias` is the narrow, declared
    // exception: the destination must itself be a route in the list, so it is
    // measured under its own name. A GATED route (an area listed in `_gated`)
    // may leave its own area only if route-params.json says so in writing,
    // under `_alias` — otherwise "it left /admin" is indistinguishable from
    // "the middleware refused it", the very failure this check exists to catch.
    const landedPath = landed.split("?")[0] ?? landed;
    const GATED_AREAS = params._gated ?? [];
    const gated = GATED_AREAS.find(
      (prefix) => expected === prefix || expected.startsWith(`${prefix}/`),
    );
    const leftItsArea =
      !!gated && !(landedPath === gated || landedPath.startsWith(`${gated}/`));
    const declaredAlias = params._alias ?? {};
    const alias =
      landedPath !== expected &&
      (!leftItsArea || route in declaredAlias) &&
      routes.some(({ route: r }) => (r.split("?")[0] ?? r) === landedPath);
    if (alias) result.redirected_to = landed;
    const bounced = landedPath !== expected && !alias;
    const deniedText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    // The standard's own markers are the first signal: a page that renders its
    // no-access or not-found state says so in markup, whatever its words. A route that
    // asks for that state (?state=no-access) is the designed screen, not a refusal.
    const askedState = new URLSearchParams(route.split("?")[1] ?? "").get("state");
    const marker = await page
      .evaluate(() =>
        ["no-access", "not-found"].find((s) =>
          [...document.querySelectorAll(`[data-state="${s}"]`)].some((el) =>
            el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
          ),
        ),
      )
      .catch(() => undefined);
    // Then the app's real not-found page, printed in global-setup: the same region
    // text means this route rendered it.
    const rendersNotFound =
      !!notFoundPrint &&
      notFoundPrint.text.length > 0 &&
      normalizeRegionText(await regionText(page).catch(() => ""), expected) === notFoundPrint.text;
    if (result.status !== null && result.status >= 400) {
      result.unreachable = true;
      result.unreachable_reason = `HTTP ${result.status}`;
    } else if (bounced) {
      result.unreachable = true;
      result.unreachable_reason = `redirected to ${landed}: the QA account has no access`;
    } else if (marker === "no-access" && askedState !== "no-access") {
      result.unreachable = true;
      result.unreachable_reason = 'access-denied screen rendered ([data-state="no-access"])';
    } else if (
      !route.includes("404") &&
      askedState !== "not-found" &&
      (marker === "not-found" || rendersNotFound || NOT_FOUND_WORDING.test(deniedText))
    ) {
      // A route in the list that answers with the app's own not-found page is
      // not being measured — it is the 404 screen being measured 110 times.
      // /book/confirmed did exactly this: it needs ?bookingId=, so the gate
      // scored the not-found page 100 while the screen that shows a customer
      // their door code was never opened. A route list is only as good as the
      // parameters that make its pages real.
      result.unreachable = true;
      result.unreachable_reason = `renders the not-found page (${
        marker === "not-found" ? "[data-state=\"not-found\"]" : rendersNotFound ? "the app's not-found text" : "not-found wording"
      }) — the route needs a query parameter (add it to routes.json)`;
    } else if (DENIED_WORDING.test(deniedText)) {
      // A phrase, never the digits: a 401 or 403 is a status code and is caught above
      // through the response status, while "401" in a price is content.
      result.unreachable = true;
      result.unreachable_reason = "access-denied screen rendered";
    } else if (askedState !== "error" && /משהו השתבש|שגיאה בטעינה|something went wrong|try again later/i.test(deniedText)) {
      // (A route asked as ?state=error is meant to show the error screen.)
      // An error boundary that caught a failed fetch renders a tidy little
      // card: no overflow, no axe violation, no console error (it was
      // caught), two fonts, no small targets. Indistinguishable from a
      // perfect page unless the copy is matched.
      result.unreachable = true;
      result.unreachable_reason = "the app's own error screen rendered";
    }

    // Only worth asking once the response itself is sound: an access-denied
    // screen has painted perfectly well, it is just the wrong page.
    if (!result.unreachable) {
      result.not_reached_reason = await reachRoute(page);
      result.reached = result.not_reached_reason === null;
    }

    const shot = path.join(SCREENS_DIR, `${name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    result.screenshot = path.relative(path.resolve(SCREENS_DIR, "..", ".."), shot);

    // Argos compares this frame with the same frame from the previous run and
    // shows what moved. It answers the question the score cannot — "one token
    // changed, which other screens changed with it" — and it is the reason the
    // DoD walks every route rather than a sample. Without ARGOS_TOKEN it is a
    // no-op, so a local run costs nothing and uploads nothing.
    // The package is optional: it is loaded only when ARGOS_TOKEN is set, and
    // global-setup has already stopped the run if the token is set without it.
    if (process.env.ARGOS_TOKEN) await (await loadArgos())(page, name, { threshold: 0.2 });

    result.overflow = await overflow(page);

    // Retried once, because a page that finishes a client-side navigation while
    // axe is walking it throws "Execution context was destroyed" — and the
    // catch below would then record the page as UNREACHABLE, which reads as
    // "the QA account has no access" when what actually happened is that the
    // page moved. axe documents this case itself
    // (dequelabs/axe-core-npm error-handling.md). One settle and one retry.
    const runAxe = () => new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
    let axe: Awaited<ReturnType<typeof runAxe>>;
    try {
      axe = await runAxe();
    } catch {
      await settle(page);
      axe = await runAxe();
    }
    result.axe.violations = axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? "unknown",
      help: v.help,
      nodes: v.nodes.length,
      samples: v.nodes.slice(0, 4).map((n) => ({
        target: n.target.map(String).join(" "),
        html: n.html.replace(/\s+/g, " ").slice(0, 200),
      })),
    }));
    result.axe.version = axe.testEngine?.version ?? null;
    for (const v of axe.violations) {
      const impact = v.impact ?? "unknown";
      result.axe.by_impact[impact] = (result.axe.by_impact[impact] ?? 0) + v.nodes.length;
      result.axe.counted += v.nodes.length;
      if (impact === "critical" || impact === "serious" || scoring.axe.minorModerate === "enforce")
        result.axe.scored += v.nodes.length;
    }

    result.fonts.families = await fontFamilies(page);
    result.fonts.count = result.fonts.families.length;

    if (viewport.width === 375) result.touch_targets = await touchTargets(page);

    measuredUrl = page.url();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    result.reduced_motion = await reducedMotionViolations(page);
    // The reload must land where the first load did: a session that expired in between
    // sends it to a sign-in screen, and that screen's motion is not this page's.
    const rmLanded = new URL(page.url()).pathname;
    if (!result.unreachable && rmLanded !== new URL(measuredUrl).pathname) {
      result.unreachable = true;
      result.unreachable_reason = `the reduced-motion reload landed on ${rmLanded}: the session may have expired during the run`;
    }
  } catch (err) {
    result.load_error = err instanceof Error ? err.message.slice(0, 500) : String(err);
    result.unreachable = true;
    result.unreachable_reason = result.load_error;
  }
  frozen = true;
  result.measured_url = measuredUrl || page.url();
  return result;
}

for (const entry of routes) {
  const { route } = entry;
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const slug = routeSlug(route);
      const name = `${slug}__${viewport.width}__${scheme}`;

      test.describe(`${route} @${viewport.width} ${scheme}`, () => {
        test.use({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: scheme,
          // A phone-width entry has a touch pointer, as a phone does: `(pointer: coarse)` matches
          // and a control sized by pointer type (S-12) is measured at its touch size. Never
          // isMobile, which would change the viewport handling and text sizing.
          hasTouch: viewport.width < 768,
          // A public page is measured as a visitor sees it: a fresh context with no
          // cookies and no storage, not the QA session from global-setup.
          ...(entry.audience === "anonymous" ? { storageState: { cookies: [], origins: [] } } : {}),
        });

        test(`dod ${name}`, async ({ page }) => {
          const result = await measureEntry(page, entry, viewport, scheme, slug, name);
          fs.mkdirSync(RESULTS_DIR, { recursive: true });
          fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), JSON.stringify(result, null, 2));
          test.info().annotations.push({
            type: "dod",
            description: `status=${result.status} unreachable=${result.unreachable} reached=${result.reached} overflow=${result.overflow.failed} axe=${result.axe.counted} console=${result.console_errors.length} fonts=${result.fonts.count} touch=${result.touch_targets.failures} rm=${result.reduced_motion.violations}`,
          });
        });
      });
    }
  }
}
