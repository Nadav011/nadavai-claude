import fs from "node:fs";
import { defineConfig } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/dod/dod-shared";

// Definition-of-Done gate (`pnpm dod`). Separate config so it never runs, or is run by,
// the project's own Playwright suite. Adjust `port` and `webServer.command` per project.
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e/dod",
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
