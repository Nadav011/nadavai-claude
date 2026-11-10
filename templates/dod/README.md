# DoD gate template (installed by /ux-setup step 12)

It lives under `e2e/dod/` with its own Playwright config, so it never collides with a project's
existing `e2e/` suite. It runs unmodified in an ESM project (`"type": "module"`) and in a CommonJS
one: it reads its JSON files with `fs` and finds them from the working directory, so run it from the
project root (`pnpm dod` does), or set `DOD_ROOT` to the root.

What it measures per route, at 375 and 1440 px, light and dark: HTTP status, whether the page
really painted, horizontal overflow, axe violations of every impact (tags `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, `wcag22aa`), console errors, loaded font families, touch targets under 44 px
(375 only), animations that keep moving under `prefers-reduced-motion`. It never fails on findings;
it writes `reports/dod/dod.json` and screenshots under `reports/dod/screens/`.

## The score

Each route starts at 100 and loses:

| Finding | Penalty |
|---|---|
| horizontal overflow | -15 per entry (route x viewport x scheme) |
| axe violation | -5 per failing node, any impact (minor, moderate, serious, critical); the impact of each is kept in `axe.by_impact` and in every violation |
| console error | -5 each |
| more than 2 font families | -10 |
| touch target under 44 px | -2 each, at most -20 |
| animation under reduced motion | -10 each |
| an entry the session could not open, or that never painted | the score is 0 |
| a route with fewer than 4 results | that route scores 0, and the total is 0 |

Page findings (axe, console, touch, motion) count once per route, the highest of its four entries.
`dod.json` records the axe-core version that judged the run (`axe.core_version`): a newer axe adds
rules, so a score that moved with no code change is read against it first.

What 100 means: none of the findings above, on every listed route, at two widths and two schemes,
as the audience each route is listed for. What it does not mean: that the screen is usable, that
its words are right, that its states are designed, that flows work end to end, that it works on
WebKit or a real phone, or that it matches the design. axe finds only what a machine can see in the
DOM; much of WCAG needs a person or another check. And the score covers only the routes in `routes.json`:
`routes.mjs --check` is what keeps that list complete.

## Who the page is measured as

The run is authenticated as the QA account, which must be able to open every page: `DOD_USER` and
`DOD_PASSWORD` in `.env.local` (plus `DOD_LOGIN_PATH`, `DOD_USER_SELECTOR`, `DOD_PASSWORD_SELECTOR`,
`DOD_SUBMIT_SELECTOR`, `DOD_READY_PATH` when the login screen differs from the defaults). `global-setup`
logs in once into `reports/dod/qa-storage-state.json` and every entry reuses it. A page the session cannot
open is recorded as `unreachable` and the score drops to 0: an unmeasured page is never a passing page.
Unreachable means: an HTTP status of 400 or more, a redirect away from the route (unless declared in
`_alias`), the app's not-found page (its wording, or a line that is only `404`), an access-denied
screen (its wording: a `401` or `403` in the body text is not enough, since a price or an id can
contain those digits), or the app's own error screen.

A public page is measured as a visitor sees it: list it as an object with `"audience": "anonymous"`
and its entries run in a fresh context with no cookies and no storage.

## Install into a project

```bash
cp -r ~/nadavai/templates/dod/e2e/dod <project>/e2e/
cp ~/nadavai/templates/dod/playwright.dod.config.ts <project>/
```

Then, in the project:

1. `e2e/dod/routes.json`: EVERY route of the app, generated, never hand-picked. The template ships it
   empty. Put sample values for dynamic segments in `e2e/dod/route-params.json` (`{ "id": "1" }`), then
   run `node e2e/dod/routes.mjs`; it adds every route it finds and keeps the entries already there, such
   as `"/plans?state=error"`. Most apps reuse one param name for unrelated things — `[id]` is a booking
   on one screen and a receipt on another — so a key shaped like a route pattern carries its own values
   and wins over the bare name: `{ "id": "1", "/receipt/[id]": { "id": "70000000-…" } }`.
   An entry is a string or an object:
   ```json
   [
     { "route": "/", "audience": "anonymous", "static": true },
     "/plans",
     "/plans?state=empty",
     "/plans?state=error"
   ]
   ```
   `audience` is `qa` (the default) or `anonymous`; `static: true` marks a page with no data states.
   A string is `{ "route": …, "audience": "qa", "static": false }`. `routes.mjs` keeps object entries
   as they are when it writes the file. `node e2e/dod/routes.mjs --check` exits 1 when the app has a
   route the file does not cover, when a dynamic segment has no sample at all, and when the file lists
   a route the app no longer has (a stale entry measures a 404; query variants of a real route are not
   stale): run it in CI so a new page cannot ship unmeasured.
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
   Chromium starts without `--disable-dev-shm-usage` (`use.launchOptions`); keep that.
3. `package.json` scripts: `"dod": "node e2e/dod/routes.mjs --check && playwright test -c playwright.dod.config.ts"`
   (one route while building a screen: `pnpm dod -- --grep "<slug>__"`). Parallelism: `DOD_WORKERS=8 pnpm dod`.
4. Dev dependencies when missing, at exact versions: `pnpm add -D -E @playwright/test @axe-core/playwright`.
   Visual diffs are optional: with `ARGOS_TOKEN` set each screenshot also goes to Argos, which needs
   `@argos-ci/playwright`; without the token the package is never loaded, and with the token but no
   package the run stops in global-setup and says so.
5. `.gitignore`: `/reports/` and `/test-results/`.
6. Run `pnpm dod` and read `reports/dod/dod.json`.
