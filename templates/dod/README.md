# DoD gate template (step 6 of rules/design-init.md)

Source: `~/Desktop/design-bakeoff-2026/e2e/` (2026-09), moved under `e2e/dod/` and given its
own Playwright config so it never collides with a project's existing `e2e/` suite.

What it measures per route, at 375 and 1440 px, light and dark: HTTP status, horizontal
overflow, axe violations (WCAG 2.x A/AA), console errors, loaded font families, touch targets
under 44 px (mobile only), animations that keep moving under `prefers-reduced-motion`. It never
fails on findings; it writes `reports/dod/dod.json` (score 100 minus penalties) and screenshots
under `reports/dod/screens/`.

The run is authenticated as the QA account, which must be able to open every page: `DOD_USER` and
`DOD_PASSWORD` in `.env.local` (plus `DOD_LOGIN_PATH`, `DOD_USER_SELECTOR`, `DOD_PASSWORD_SELECTOR`,
`DOD_SUBMIT_SELECTOR`, `DOD_READY_PATH` when the login screen differs from the defaults). `global-setup`
logs in once into `reports/dod/qa-storage-state.json` and every entry reuses it. A page the session cannot
open is recorded as `unreachable` and the score drops to 0: an unmeasured page is never a passing page.

Install into a project:

```bash
cp -r ~/nadavai/templates/dod/e2e/dod <project>/e2e/
cp ~/nadavai/templates/dod/playwright.dod.config.ts <project>/
```

Then, in the project:

1. `e2e/dod/routes.json`: EVERY route of the app, generated, never hand-picked. Put sample values for
   dynamic segments in `e2e/dod/route-params.json` (`{ "id": "1" }`), then run `node e2e/dod/routes.mjs`;
   it adds every route it finds and keeps extra entries such as `"/plans?state=error"`. Most apps reuse one
   param name for unrelated things — `[id]` is a booking on one screen and a receipt on another — so a key
   shaped like a route pattern carries its own values and wins over the bare name:
   `{ "id": "1", "/receipt/[id]": { "id": "70000000-…" } }`. `node e2e/dod/routes.mjs --check` exits 1 when
   the app has a route the file does not cover, and when a dynamic segment has no sample at all: run it in CI
   so a new page cannot ship unmeasured.
1b. When `routes.json` cannot say what the project needs, replace it with a TypeScript module
   (`e2e/dod/routes.ts`) and move the `--check` into the project's own test suite. Two shapes need
   this: several products from one codebase, each with its own list (`routesFor(vertical)`), and a
   route deliberately left out, which a JSON array cannot carry a reason for. The check that
   replaces `routes.mjs --check` has to assert the same things or it is not a replacement: every
   route of the app is either measured or excluded with a written reason, every excluded route
   still exists, and no two routes share a report slug. TherapyFlow's
   `tests/fidelity/dod-routes-complete.test.ts` is the worked example — the slug assertion is
   there because `/` and `/home` collided and one screen went unmeasured while the report still
   counted it.

2. `playwright.dod.config.ts`: the dev port and `webServer.command` (`pnpm dev -p`, `vite --port`, ...).
3. `package.json` scripts: `"dod": "node e2e/dod/routes.mjs --check && playwright test -c playwright.dod.config.ts"`
   (one route while building a screen: `pnpm dod -- --grep "<slug>__"`). Parallelism: `DOD_WORKERS=8 pnpm dod`.
4. Dev dependencies when missing: `@playwright/test`, `@axe-core/playwright`.
5. `.gitignore`: `/reports/` and `/test-results/`.
6. Run `pnpm dod` and read `reports/dod/dod.json`.
