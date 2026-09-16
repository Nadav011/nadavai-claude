# DoD gate template (step 6 of rules/design-init.md)

Source: `~/Desktop/design-bakeoff-2026/e2e/` (2026-09), moved under `e2e/dod/` and given its
own Playwright config so it never collides with a project's existing `e2e/` suite.

What it measures per route, at 375 and 1440 px, light and dark: HTTP status, horizontal
overflow, axe violations (WCAG 2.x A/AA), console errors, loaded font families, touch targets
under 44 px (mobile only), animations that keep moving under `prefers-reduced-motion`. It never
fails on findings; it writes `reports/dod/dod.json` (score 100 minus penalties) and screenshots
under `reports/dod/screens/`.

Install into a project:

```bash
cp -r ~/nadavai/templates/dod/e2e/dod <project>/e2e/
cp ~/nadavai/templates/dod/playwright.dod.config.ts <project>/
```

Then, in the project:

1. `e2e/dod/routes.json`: EVERY route of the app, generated, never hand-picked. Put sample values for
   dynamic segments in `e2e/dod/route-params.json` (`{ "id": "1" }`), then run `node e2e/dod/routes.mjs`;
   it adds every route it finds and keeps extra entries such as `"/plans?state=error"`. `node e2e/dod/routes.mjs --check`
   exits 1 when the app has a route the file does not cover: run it in CI so a new page cannot ship unmeasured.
2. `playwright.dod.config.ts`: the dev port and `webServer.command` (`pnpm dev -p`, `vite --port`, ...).
3. `package.json` scripts: `"dod": "node e2e/dod/routes.mjs --check && playwright test -c playwright.dod.config.ts"`
   (one route while building a screen: `pnpm dod -- --grep "<slug>__"`). Parallelism: `DOD_WORKERS=8 pnpm dod`.
4. Dev dependencies when missing: `@playwright/test`, `@axe-core/playwright`.
5. `.gitignore`: `/reports/` and `/test-results/`.
6. Run `pnpm dod` and read `reports/dod/dod.json`.
