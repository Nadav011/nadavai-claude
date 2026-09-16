import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { REPORTS_DIR, RESULTS_DIR, SCREENS_DIR, STORAGE_STATE } from "./dod-shared";

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
  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.rmSync(SCREENS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.rmSync(STORAGE_STATE, { force: true });

  const user = process.env.DOD_USER;
  const password = process.env.DOD_PASSWORD;
  if (!user || !password) {
    console.log("[dod] no DOD_USER/DOD_PASSWORD: running anonymously, every gated page will report as unreachable.");
    return;
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto(process.env.DOD_LOGIN_PATH ?? "/login", { waitUntil: "domcontentloaded" });
    await page.fill(process.env.DOD_USER_SELECTOR ?? "input[type=email]", user);
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
}
