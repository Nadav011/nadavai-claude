import fs from "node:fs";
import { defineConfig } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/dod/dod-shared";

// Definition-of-Done gate (`pnpm dod`, which runs e2e/dod/run-dod.mjs). Separate config so it never
// runs, or is run by, the project's own Playwright suite. Two phases, two runs of this config:
// DOD_PHASE unset runs the scored phase (dod.spec.ts) alone; DOD_PHASE=checks runs every other spec
// of e2e/dod (the experience standard's checks, standard.spec.ts) after it. Adjust `port` and `webServer.command` per project.
// Run it from the project root: e2e/dod/dod-shared.ts finds routes.json and reports/
// from the working directory (or DOD_ROOT), which works in ESM and CommonJS projects alike.
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e/dod",
  ...(process.env.DOD_PHASE === "checks" ? { testIgnore: /[\\/]dod\.spec\.ts$/ } : { testMatch: /[\\/]dod\.spec\.ts$/ }),
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // Every entry writes its own result file, so workers are safe. All routes x 2 viewports x 2 schemes
  // is a long run on a big app: raise DOD_WORKERS on a strong machine, lower it if the dev server chokes.
  fullyParallel: true,
  workers: Number(process.env.DOD_WORKERS ?? 4),
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-results/dod",
  globalSetup: "./e2e/dod/global-setup.ts",
  globalTeardown: "./e2e/dod/global-teardown.ts",
  use: {
    baseURL,
    // The QA session from global-setup; every page of the app must open with it.
    storageState: fs.existsSync(STORAGE_STATE) ? STORAGE_STATE : undefined,
    locale: "he-IL",
    // Playwright passes --disable-dev-shm-usage by default, which moves Chromium's shared
    // memory from /dev/shm (RAM) to /tmp on disk; with many pages open that has frozen a
    // desktop. Dropping the flag keeps it in RAM.
    launchOptions: { ignoreDefaultArgs: ["--disable-dev-shm-usage"] },
    trace: "off",
    video: "off",
  },
  webServer: {
    command: `pnpm dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
