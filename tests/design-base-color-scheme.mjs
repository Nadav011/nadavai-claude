#!/usr/bin/env node
// templates/design/base.css: the app's own theme decides the colour scheme of native parts
// (scrollbars, form controls), not the system's. A dark window under a light system showed a
// white scrollbar in SHIFTS (14.11.2026).
// usage: PLAYWRIGHT_MODULE=<app>/node_modules/playwright/index.mjs node tests/design-base-color-scheme.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, "..", "templates", "design", "base.css"), "utf8");
const pw = process.env.PLAYWRIGHT_MODULE;
if (!pw) {
  console.log("SKIP design-base-color-scheme: set PLAYWRIGHT_MODULE");
  process.exit(0);
}
const { chromium } = await import(pw);

// [class on <html>, the system's scheme, the scheme the page must report]
const cases = [
  ["dark", "light", "dark"],
  ["light", "dark", "light"],
  ["", "light", "light dark"],
  ["", "dark", "light dark"],
];

const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-dev-shm-usage"] });
let failed = 0;
try {
  for (const [cls, system, want] of cases) {
    const page = await browser.newPage({ colorScheme: system });
    await page.setContent(`<!doctype html><html class="${cls}"><head><style>${css}</style></head><body>x</body></html>`);
    const got = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} html class "${cls}" under a ${system} system: color-scheme "${got}" (want "${want}")`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failed === 0 ? `${cases.length} passed, 0 failed` : `${cases.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
