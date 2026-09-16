// Definition-of-Done audit. Never fails on findings: everything is recorded to
// reports/results/*.json and merged into reports/dod.json by global-teardown.
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";
import AxeBuilder from "@axe-core/playwright";
import routes from "./routes.json";
import { RESULTS_DIR, SCHEMES, SCREENS_DIR, VIEWPORTS, routeSlug, type EntryResult } from "./dod-shared";

const SETTLE_MS = 1200;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

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

async function touchTargets(page: Page) {
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
      if (usesTransform && dur > 50) {
        violations++;
        const target = eff.target as Element | null;
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

for (const route of routes as string[]) {
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const slug = routeSlug(route);
      const name = `${slug}__${viewport.width}__${scheme}`;

      test.describe(`${route} @${viewport.width} ${scheme}`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: scheme });

        test(`dod ${name}`, async ({ page }) => {
          const consoleErrors: string[] = [];
          page.on("console", (m) => {
            if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
          });
          page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));

          const result: EntryResult = {
            route,
            slug,
            viewport: { ...viewport },
            scheme,
            status: null,
            load_error: null,
            unreachable: false,
            unreachable_reason: null,
            screenshot: null,
            overflow: { scrollWidth: 0, clientWidth: 0, failed: false },
            axe: { critical_serious: 0, violations: [] },
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
            const bounced =
              !landed.startsWith(expected) &&
              /login|signin|sign-in|auth|unauthorized|forbidden|403|no-access|\u05d4\u05ea\u05d7\u05d1\u05e8/i.test(landed);
            const deniedText = await page
              .locator("body")
              .innerText()
              .then((x) => x.slice(0, 400))
              .catch(() => "");
            if (result.status !== null && result.status >= 400) {
              result.unreachable = true;
              result.unreachable_reason = `HTTP ${result.status}`;
            } else if (bounced) {
              result.unreachable = true;
              result.unreachable_reason = `redirected to ${landed}: the QA account has no access`;
            } else if (/403|401|אין לך הרשאה|אין הרשאה|access denied|unauthorized|forbidden/i.test(deniedText)) {
              result.unreachable = true;
              result.unreachable_reason = "access-denied screen rendered";
            }

            const shot = path.join(SCREENS_DIR, `${name}.png`);
            await page.screenshot({ path: shot, fullPage: true });
            result.screenshot = path.relative(path.resolve(SCREENS_DIR, "..", ".."), shot);

            // Argos compares this frame with the same frame from the previous run and
            // shows what moved. It answers the question the score cannot — "one token
            // changed, which other screens changed with it" — and it is the reason the
            // DoD walks every route rather than a sample. Without ARGOS_TOKEN it is a
            // no-op, so a local run costs nothing and uploads nothing.
            if (process.env.ARGOS_TOKEN) await argosScreenshot(page, name, { threshold: 0.2 });

            result.overflow = await overflow(page);

            // Retried once, because a page that finishes a client-side navigation while
            // axe is walking it throws "Execution context was destroyed" — and the
            // catch below would then record the page as UNREACHABLE, which reads as
            // "the QA account has no access" when what actually happened is that the
            // page moved. axe documents this case itself
            // (dequelabs/axe-core-npm error-handling.md). One settle and one retry.
            const runAxe = () =>
              new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
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
            result.axe.critical_serious = axe.violations
              .filter((v) => v.impact === "critical" || v.impact === "serious")
              .reduce((n, v) => n + v.nodes.length, 0);

            result.fonts.families = await fontFamilies(page);
            result.fonts.count = result.fonts.families.length;

            if (viewport.width === 375) result.touch_targets = await touchTargets(page);

            await page.emulateMedia({ reducedMotion: "reduce" });
            await page.reload({ waitUntil: "domcontentloaded" });
            await settle(page);
            result.reduced_motion = await reducedMotionViolations(page);
          } catch (err) {
            result.load_error = err instanceof Error ? err.message.slice(0, 500) : String(err);
            result.unreachable = true;
            result.unreachable_reason = result.load_error;
          }

          fs.mkdirSync(RESULTS_DIR, { recursive: true });
          fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), JSON.stringify(result, null, 2));
          test.info().annotations.push({
            type: "dod",
            description: `status=${result.status} unreachable=${result.unreachable} overflow=${result.overflow.failed} axe=${result.axe.critical_serious} console=${consoleErrors.length} fonts=${result.fonts.count} touch=${result.touch_targets.failures} rm=${result.reduced_motion.violations}`,
          });
        });
      });
    }
  }
}
