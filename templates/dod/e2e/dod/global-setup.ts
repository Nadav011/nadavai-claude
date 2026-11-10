import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import {
  NOT_FOUND_PRINT,
  REPORTS_DIR,
  RESULTS_DIR,
  SCREENS_DIR,
  STORAGE_STATE,
  loadArgos,
  normalizeRegionText,
  type NotFoundPrint,
} from "./dod-shared";

// The same launch flag as playwright.dod.config.ts: Chromium's shared memory stays in RAM.
const LAUNCH = { ignoreDefaultArgs: ["--disable-dev-shm-usage"] };

/**
 * Open a route that cannot exist, as the session the entries will use, and keep what the app
 * shows for it. A single-page app answers 200 for any path and paints its own not-found
 * screen, in its own words; with this print an entry that renders that same screen is caught
 * whatever those words are. A catch-all redirect or an empty screen leaves no print.
 */
async function printNotFound(baseURL: string) {
  const made = `/__dod-no-such-route-${Date.now().toString(36)}`;
  const browser = await chromium.launch(LAUNCH);
  try {
    const context = await browser.newContext({
      baseURL,
      ...(fs.existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}),
    });
    const page = await context.newPage();
    const resp = await page.goto(made, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);
    const landed = new URL(page.url()).pathname;
    const region = await page.evaluate(() => {
      const r = document.querySelector("main, #main-content, #root, #__next") ?? document.body;
      return (r as HTMLElement).innerText ?? "";
    });
    let text = landed === made ? normalizeRegionText(region, made) : "";
    // An app whose catch-all route renders its home screen would make the home screen look
    // like a not-found page: compare with the ready path and keep no print when they match.
    if (text) {
      const ready = process.env.DOD_READY_PATH ?? "/";
      await page.goto(ready, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1200);
      const home = await page.evaluate(() => {
        const r = document.querySelector("main, #main-content, #root, #__next") ?? document.body;
        return (r as HTMLElement).innerText ?? "";
      });
      if (normalizeRegionText(home, ready) === text) text = "";
    }
    const print: NotFoundPrint = { path: made, status: resp?.status() ?? null, landed, text };
    fs.writeFileSync(NOT_FOUND_PRINT, JSON.stringify(print, null, 2));
    console.log(
      print.text
        ? `[dod] not-found page printed (HTTP ${print.status}, ${print.text.length} characters).`
        : `[dod] no not-found print: ${made} landed on ${landed}, or shows the same screen as the ready path.`,
    );
  } catch (err) {
    console.log(`[dod] no not-found print: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  } finally {
    await browser.close();
  }
}

/**
 * The DoD runs as the QA account, which must be able to open EVERY page of the app:
 * a page nobody can open is unmeasured, not passing. Set these in `.env.local` (never committed):
 *   DOD_USER, DOD_PASSWORD   the QA user, with the widest role the app has
 *   DOD_LOGIN_PATH           default "/login"
 *   DOD_USER_SELECTOR        default input[type=email], DOD_PASSWORD_SELECTOR default input[type=password]
 *   DOD_SUBMIT_SELECTOR      default button[type=submit]
 *   DOD_READY_PATH           a path only a logged-in user can open; default "/"
 * With no DOD_USER the run is anonymous and every gated page reports as unreachable,
 * which is the correct, loud failure.
 */
export default async function globalSetup(config: FullConfig) {
  // This suite signs in with the widest role the app has and then opens every page
  // in it, hundreds of browser entries deep. Pointed at a production backend that is
  // a full-access crawl of real customer data by an automated browser. Nothing here
  // ever intends that — but on Green Room the only thing that had ever kept it local
  // was a gitignored `.env.local`, a file `actions/checkout` wipes on every CI run.
  // A workflow that forgot to declare the URL would not have failed; it would have
  // run, against whatever the deployed default was.
  //
  // So the run refuses rather than assumes. Set `DOD_ALLOW_REMOTE=1` to override,
  // deliberately, in a shell where someone typed it.
  if (!process.env.DOD_ALLOW_REMOTE) {
    const LOOPBACK = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:|\/|$)/;
    const BACKEND_VARS = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "PUBLIC_SUPABASE_URL",
      "SUPABASE_URL",
      "DATABASE_URL",
      "NEXT_PUBLIC_API_URL",
      "VITE_API_URL",
      "DOD_BACKEND_URL",
    ];
    const remote = BACKEND_VARS.filter(
      (k) => process.env[k] && !LOOPBACK.test(process.env[k] as string),
    );
    if (remote.length) {
      // Name the variable and its host only: a DATABASE_URL carries a password, and this
      // message ends up in terminal and CI logs. (Ported from cash-next-app's copy.)
      const hostOf = (value: string) => {
        try {
          return new URL(value).host || "unparseable";
        } catch {
          return "unparseable";
        }
      };
      throw new Error(
        `[dod] refusing to run: ${remote
          .map((k) => `${k} (${hostOf(process.env[k] as string)})`)
          .join(", ")} — not a loopback address. The DoD signs in with full access and ` +
          "browses every page; it runs against a local stack only. Set DOD_ALLOW_REMOTE=1 to override.",
      );
    }
  }

  // Stop before the first page rather than fail every entry: a token without the
  // package means someone wanted visual diffs and would otherwise get none.
  if (process.env.ARGOS_TOKEN) await loadArgos();

  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.rmSync(SCREENS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.rmSync(STORAGE_STATE, { force: true });
  fs.rmSync(NOT_FOUND_PRINT, { force: true });

  const user = process.env.DOD_USER;
  const password = process.env.DOD_PASSWORD;
  const baseURL = config.projects[0]?.use?.baseURL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
  if (!user || !password) {
    console.log("[dod] no DOD_USER/DOD_PASSWORD: running anonymously, every gated page will report as unreachable.");
    await printNotFound(baseURL);
    return;
  }

  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ baseURL });
  // A sign-in screen behind Suspense paints its fields only once the client bundle is
  // there, and on a cold dev server the first compile of that route can take minutes.
  // Playwright's 30s default turns that into "QA login failed: page.fill timeout" and a
  // score of 0 for every gated page — a compile time reported as a broken product.
  const COMPILE_MS = 180_000;
  const userSelector = process.env.DOD_USER_SELECTOR ?? "input[type=email]";
  try {
    await page.goto(process.env.DOD_LOGIN_PATH ?? "/login", { waitUntil: "domcontentloaded", timeout: COMPILE_MS });
    await page.locator(userSelector).waitFor({ state: "visible", timeout: COMPILE_MS });
    await page.fill(userSelector, user);
    await page.fill(process.env.DOD_PASSWORD_SELECTOR ?? "input[type=password]", password);
    await page.click(process.env.DOD_SUBMIT_SELECTOR ?? "button[type=submit]");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(process.env.DOD_READY_PATH ?? "/", { waitUntil: "domcontentloaded" });
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE });
    console.log(`[dod] QA session saved for ${user}.`);
  } catch (err) {
    console.error(`[dod] QA login failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("[dod] Every gated page will report as unreachable and the score will be 0. Fix the login first.");
  } finally {
    await browser.close();
  }
  await printNotFound(baseURL);
}
