// Page helpers shared by the scored phase (dod.spec.ts) and the checks phase (standard.spec.ts).
import type { Page } from "@playwright/test";

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
