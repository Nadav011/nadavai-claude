// Page helpers shared by the scored phase (dod.spec.ts) and the checks phase (standard.spec.ts).
import type { Page } from "@playwright/test";
import { normalizeRegionText, redact, ROUTE_REGION, routeQuery, type NotFoundPrint, type PageFingerprint, type RouteEntry, type RouteParams } from "./dod-shared";

const SETTLE_MS = 1200;

export async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Did the app paint this route, or is the probe about to measure a loading screen?
 * Returns null when the page is really there, otherwise the reason it is not.
 *
 * Every other probe here looks for a defect, and a page that never rendered has none:
 * no contrast failures, no small targets, no console errors. So it scores 100, and the
 * report says the screen passed when what it means is that nobody looked at it. The
 * thresholds are deliberately loose — a short screen is still a screen, and a page that
 * documents a loading state is not stuck in one — because a blunt version of this check
 * fails real screens, which is worse than the hole it closes.
 */
export async function reachRoute(page: Page): Promise<string | null> {
  const painted = () =>
    page.evaluate(() => {
      // Read the ROUTE'S OWN region, never the whole body. Any app with a shell —
      // a skip link, a nav, a footer — puts several hundred characters on screen
      // before the route contributes a single one, so a body-length test can never
      // fail there no matter what the page did.
      const region = document.querySelector("main, #main-content, #root, #__next");
      const text = (() => {
        if (region) return (region as HTMLElement).innerText ?? "";
        const clone = document.body.cloneNode(true) as HTMLElement;
        for (const el of clone.querySelectorAll(
          'nav, footer, header, [role="navigation"], [role="banner"], [role="contentinfo"], script, style, [aria-hidden="true"]',
        ))
          el.remove();
        return clone.innerText ?? "";
      })();
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean.length < 10) return `content region has ${clean.length} characters`;
      const busy = [...document.querySelectorAll('[role="status"], [aria-busy="true"]')].some((el) =>
        /loading|טוענים|טוען|רגע/i.test((el as HTMLElement).textContent ?? ""),
      );
      return busy && clean.length < 200 ? "still showing a loading state" : null;
    });

  const deadline = Date.now() + 15_000;
  let reason = await painted();
  while (reason !== null && Date.now() < deadline) {
    await page.waitForTimeout(500);
    reason = await painted();
  }
  return reason;
}

export async function touchTargets(page: Page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'));
    const samples: string[] = [];
    let failures = 0;

    /**
     * WCAG 2.2 SC 2.5.8 exempts a target that "is in a sentence, or its size is
     * otherwise constrained by the line-height of non-target text". A link inside a
     * paragraph cannot be 44px tall without tearing the paragraph apart, and axe —
     * which implements the exemption — agrees: on the run that produced this rule it
     * reported target-size on two routes while the naive measurement below flagged
     * eighteen links sitting in Hebrew sentences. A standalone control is still held
     * to 44px; only prose is let through, and only when there is prose beside it.
     */
    const inSentence = (el: HTMLElement, display: string): boolean => {
      if (display !== "inline") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      // The prose beside the link is not always a bare text node. A component that
      // splits a sentence and wraps each phrase — this app's consent text does
      // exactly that — leaves the link surrounded by <span>s, and a text-node-only
      // test declares a link that plainly sits mid-sentence to be standalone. What
      // has to be there is non-target text: anything readable next to it that is
      // not itself a control, so a row of nothing but links is still measured.
      return Array.from(parent.childNodes).some((n) => {
        if (n === el) return false;
        if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").trim().length > 0;
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const e = n as HTMLElement;
        if (e.matches("a[href], button, [role=\"button\"]")) return false;
        return (e.textContent ?? "").trim().length > 0;
      });
    };

    /**
     * A compact control often reaches 44px through an invisible absolutely-positioned
     * ::before that spills outside its box — the standard way to give a 24px-tall
     * switch a thumb-sized hit area without drawing a 44px switch. The element's own
     * rect says 48x26 and the finger gets 48x44, so measuring the rect alone reports
     * a control that is already correct. Hit-testing with elementFromPoint would be
     * the direct measurement, but it only works above the fold; the pseudo-element's
     * own geometry works wherever the element is.
     */
    const hitAreaOf = (el: HTMLElement, r: DOMRect) => {
      let extraW = 0;
      let extraH = 0;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute") continue;
        const out = (v: string) => Math.max(0, -(Number.parseFloat(v) || 0));
        extraH = Math.max(extraH, out(ps.top) + out(ps.bottom));
        extraW = Math.max(extraW, out(ps.left) + out(ps.right));
      }
      return { w: Math.max(el.clientWidth, r.width) + extraW, h: Math.max(el.clientHeight, r.height) + extraH };
    };

    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (inSentence(el, cs.display)) continue;
      const { w, h } = hitAreaOf(el, r);
      if (h < 44 || w < 44) {
        failures++;
        if (samples.length < 8) {
          const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
          samples.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${label}" ${Math.round(w)}x${Math.round(h)}`);
        }
      }
    }
    return { checked: true, failures, samples };
  });
}

/** The route's own region text, the same region reachRoute reads. */
export function regionText(page: Page): Promise<string> {
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

/** What the access check needs besides the page: the route list, its params, the not-found print. */
export interface AccessContext {
  routes: RouteEntry[];
  params: RouteParams;
  notFoundPrint: NotFoundPrint | null;
}

/**
 * Whether the page loaded for `route` is that route, as the QA account sees it: null when it is,
 * otherwise why not. The scored phase marks the entry unreachable with this reason; the checks
 * phase runs the same function on its own load and judges nothing when it fails.
 */
export async function accessCheck(
  page: Page,
  route: string,
  status: number | null,
  { routes, params, notFoundPrint }: AccessContext,
): Promise<{ unreachable_reason: string | null; redirected_to?: string }> {
  let reason: string | null = null;
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
  // Said through redact(): a query the app added on the way (a token, a code) is cut.
  const shownLanded = redact(landed, routeQuery(route));
  const redirected_to = alias ? shownLanded : undefined;
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
  if (status !== null && status >= 400) {
    reason = `HTTP ${status}`;
  } else if (bounced) {
    reason = `redirected to ${shownLanded}: the QA account has no access`;
  } else if (marker === "no-access" && askedState !== "no-access") {
    reason = 'access-denied screen rendered ([data-state="no-access"])';
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
    reason = `renders the not-found page (${
      marker === "not-found" ? "[data-state=\"not-found\"]" : rendersNotFound ? "the app's not-found text" : "not-found wording"
    }) — the route needs a query parameter (add it to routes.json)`;
  } else if (DENIED_WORDING.test(deniedText)) {
    // A phrase, never the digits: a 401 or 403 is a status code and is caught above
    // through the response status, while "401" in a price is content.
    reason = "access-denied screen rendered";
  } else if (askedState !== "error" && /משהו השתבש|שגיאה בטעינה|something went wrong|try again later/i.test(deniedText)) {
    // (A route asked as ?state=error is meant to show the error screen.)
    // An error boundary that caught a failed fetch renders a tidy little
    // card: no overflow, no axe violation, no console error (it was
    // caught), two fonts, no small targets. Indistinguishable from a
    // perfect page unless the copy is matched.
    reason = "the app's own error screen rendered";
  }
  return { unreachable_reason: reason, ...(redirected_to ? { redirected_to } : {}) };
}

/**
 * The page's fingerprint (PageFingerprint in dod-shared.ts), read in one evaluate. Its own
 * visibility test, not checkVisibility: a page may break that (the suite's /tamper does), and a
 * fingerprint that throws would leave the entry unprovable. Recorded by the scored phase on every
 * run; compared by the checks phase.
 */
export function pageFingerprint(page: Page): Promise<PageFingerprint> {
  return page.evaluate((regionSelectors) => {
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      // Wholly beside the viewport: an off-canvas drawer moved out with a transform.
      if (r.right <= 0 || r.left >= innerWidth) return false;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      }
      return !el.closest('[aria-hidden="true"], [hidden], [inert]');
    };
    const norm = (t: string, n: number) => t.replace(/\d+/g, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, n);
    const LANDMARKS: [string, string][] = [
      ["main", 'main, [role="main"]'],
      ["nav", 'nav, [role="navigation"]'],
      ["banner", 'body > header, body > * > header, [role="banner"]'],
      ["contentinfo", 'body > footer, body > * > footer, [role="contentinfo"]'],
      ["complementary", 'aside, [role="complementary"]'],
      ["search", 'search, [role="search"]'],
    ];
    const landmarks = LANDMARKS.filter(([, sel]) => [...document.querySelectorAll(sel)].some(shown)).map(([k]) => k);
    const headings = [
      ...new Set(
        [...document.querySelectorAll('h1, h2, h3, [role="heading"][aria-level="1"], [role="heading"][aria-level="2"], [role="heading"][aria-level="3"]')]
          .filter(shown)
          .map((h) => norm((h as HTMLElement).innerText ?? "", 80))
          .filter(Boolean),
      ),
    ]
      .slice(0, 12)
      .sort();
    // The route's own region (ROUTE_REGION): its <main> when it has one, the app's root only when it
    // has none, and without either, the body less its chrome.
    const region =
      regionSelectors.map((sel) => document.querySelector(sel)).find((el) => el !== null) ??
      (() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        for (const el of clone.querySelectorAll('nav, footer, header, [role="navigation"], [role="banner"], [role="contentinfo"], script, style'))
          el.remove();
        return clone;
      })();
    const live = region.isConnected;
    const CONTROLS =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], ' +
      '[role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="combobox"], [role="option"]';
    const controls = [...region.querySelectorAll(CONTROLS)]
      .filter((el) => !live || shown(el))
      .map((el) => {
        const e = el as HTMLInputElement;
        return norm(e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.getAttribute("name") || e.type || e.tagName, 40) || e.tagName.toLowerCase();
      })
      .slice(0, 80)
      .sort();
    const text = live ? ((region as HTMLElement).innerText ?? "") : (region.textContent ?? "");
    const hash = (w: string) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 0x01000193) >>> 0;
      return h;
    };
    const distinct = new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length >= 2),
    );
    const words = [...new Set([...distinct].map(hash))].sort((x, y) => x - y).slice(0, 64);
    return { landmarks, headings, controls, words };
  }, [...ROUTE_REGION]);
}

/** A visible password field: the page is a sign-in form (or has one), as the QA account sees it. */
export function hasSignInForm(page: Page): Promise<boolean> {
  return page
    .locator(process.env.DOD_PASSWORD_SELECTOR ?? 'input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
}
