# DoD gate template (installed by /ux-setup step 12)

It lives under `e2e/dod/` with its own Playwright config, so it never collides with a project's
existing `e2e/` suite. It runs unmodified in an ESM project (`"type": "module"`) and in a CommonJS
one: it reads its JSON files with `fs` and finds them from the working directory, so run it from the
project root (`pnpm dod` does), or set `DOD_ROOT` to the root.

What it measures per route, at 375 and 1440 px, light and dark: HTTP status, whether the page
really painted, horizontal overflow, axe violations of every impact (tags `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, `wcag22aa`), console errors, loaded font families, touch targets under 44 px
(375 only), animations that keep moving under `prefers-reduced-motion`. With `e2e/dod/standard.json`
it also runs the experience standard's checks (below). It never fails on findings; it writes
`reports/dod/dod.json` and screenshots under `reports/dod/screens/`.

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
| an experience-standard check with findings, `mode: "enforce"` only | -10 per check id per route |

Page findings (axe, console, touch, motion) count once per route, the highest of its four entries.
`dod.json` records the axe-core version that judged the run (`axe.core_version`): a newer axe adds
rules, so a score that moved with no code change is read against it first.

What 100 means: none of the findings above, on every listed route, at two widths and two schemes,
as the audience each route is listed for (and, in `enforce` mode, none of the standard's checks).
What it does not mean: that the screen is usable, that most of its words are right, that its states
are designed beyond what the standard's checks read, that flows work end to end, that it works on
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

## The experience standard's checks

nadav-design's `standard/experience.md` ends with a table of automated checks; this template runs
the ones that are built (that table says which, and which halves are deferred). They run only when
the project has `e2e/dod/standard.json`. Without it nothing changes and `dod.json` says
`"standard": "not configured"`, so a project adopts the standard when it is ready.

`e2e/dod/standard.json` (JSON has no comments, so they are here):

```json
{
  "profile": "work-tool",
  "mode": "report",
  "textFloorPx": 12,
  "helpDir": "src/help",
  "coreUnit": { "route": "/calendar", "selector": "[data-unit='hour']", "min": 8, "viewport": [1280, 648] },
  "languages": [
    { "lang": "he", "dir": "rtl" },
    { "lang": "en", "dir": "ltr", "routePrefix": "/en" }
  ],
  "forbiddenWords": ["משהו השתבש"]
}
```

- `profile` (required): `work-tool` or `consumer`, as the BRIEF names it (`standard/profiles.md`).
  Recorded in `dod.json`. No automated check differs between the two today: both need the help
  door, and the rules only a work tool owes (G-03, G-11, S-07, S-13) are reviewer checks.
- `mode`: `report` (the default) writes the findings into `dod.json` and leaves the score alone;
  `enforce` deducts 10 for every check id with findings on a route, counted once per route like the
  other page findings. Start in `report`, fix, then switch. The static checks follow the same
  mode: in `report` `routes.mjs --check` prints them and passes, in `enforce` it fails on them.
- `textFloorPx`: the smallest text the probe accepts (default 12).
- `helpDir` (optional): turns on `help-route`.
- `coreUnit` (optional): turns on `core-unit` for that one route.
- `languages` (optional): with two or more, turns on `both-directions`. A language matches the
  routes under its `routePrefix` or with its `query` (`"lang=en"`); one with neither is the default
  language and matches the routes no other language claims.
- `forbiddenWords` (optional): added to the built-in list, matched as whole words.

What each check reads (the markers are the standard's: `data-help`, `data-state`):

| Check | Where | Fires on |
|---|---|---|
| `help-door` | every entry, except routes flagged `static` | no visible `[data-help="door"]` inside a `header`/`[role="banner"]` or in the first 120px, or no visible `[data-help="screen"]` |
| `tooltip-only` | every entry | a visible element with a `title` and no readable text of its own (a lone `?` is not text), no `aria-describedby` to visible text, outside `[data-help]`; or one described only by a hidden `[role="tooltip"]` |
| `disabled-reason` | every entry | a disabled control (or `aria-disabled="true"`) outside `[aria-busy="true"]` with no `aria-describedby` to visible text |
| `placeholder-label` | every entry | an input with a placeholder and no visible `<label>` or `aria-labelledby` to visible text (`aria-label` is not visible) |
| `input-attrs` | every entry | a text-like `<input>` with no `autocomplete`; a phone, email or number field (read from its name, id, label, placeholder, `autocomplete`) without the matching `type` or `inputmode`; an input, textarea or select under 16px |
| `one-primary` | every entry | more than one action whose computed background equals the resolved `--primary` token, counted in the last open `[role="dialog"]`/`[role="alertdialog"]`/`dialog[open]` alone when one is open; skipped (and said so) when `--primary` is missing |
| `nav-count` | 375 only | a fixed or sticky bottom `nav` with more than five items, or a badge there with no digit (`[data-badge]`, or a small absolutely placed filled element) |
| `empty-action` | every entry | a `[data-state="empty"]` with no visible button or link inside (`clear` needs none) |
| `error-toast` | every entry | an error (`[role="alert"]`, `[data-state="error"]`, `[data-type="error"]`) inside a toast region (`[data-toast-region]`, Sonner, Radix, or a region labelled "notifications"), or an error element removed from the page while nobody touched it |
| `error-field` | every entry | an `[aria-invalid="true"]` field with no `aria-describedby` to visible text. Only this static half is built; the half that submits a form and checks the focus is a later step |
| `forbidden-words` | every entry | on visible text, placeholders and button values: "נא", "אנא", "ניתן", "כעת", "אופס" as words (with a ו prefix, and "שניתן"), "!", emoji, slash or dot gender forms ("מטפל/ית", "מטפל.ת"), and the project's words |
| `core-unit` | its route, the light entry nearest its viewport | fewer than `min` of `selector` fully visible at `viewport`, above any fixed bottom bar and inside every clipping box |
| `probe` | the two light entries | at 320x700, 390x844, 768x1024, 1024x768 and 1280x648, without reloading: sideways scroll, text under `textFloorPx`, one word of a control's label on two lines, and touch targets under 44 px (at 320, 390 and 768 only). "An icon covered by its badge" is not built |
| `state-coverage` | `routes.mjs --check` | a route not flagged `static`, and not itself a `?state=` variant, with no `?state=empty` or no `?state=error` variant (other query parameters must match) |
| `help-route` | `routes.mjs --check`, with `helpDir` | a route not flagged `static` with no file `<helpDir>/<slug>.<any extension>`, the slug taken from the route pattern the way report slugs are: `/orders/[id]` and `/orders/:id` are `orders-id.md`, `/` is `root.md`. Every non-static route counts: the menu is not read |
| `brand-assets` | `routes.mjs --check` | no PRODUCT.md at the root, no `Brand` (or `מותג`) heading in it, or a file path the section names (a link target or an inline code span with an extension) that does not exist |
| `both-directions` | `routes.mjs --check`, with two or more `languages` | a language with no route in `routes.json` |

`tour-no-commit` is not built: no project has a tour manifest for it to read yet.

In `dod.json` each route has `standard: { <check-id>: { count, samples, skipped? } }` (its highest
entry), each entry its own `standard` and, on the light entries, `probe` by size; the top level has
`standard` (mode, profile, per check id the routes and findings, and what is not built) and
`totals.standard_findings` / `totals.standard_failures`.

## Tests of this template

`tests/` is not copied into projects. It serves small fixture pages and drives the real template
code against them twice, from a project with `"type": "module"` and from one without: every check
has a fixture that makes it fire and fires nothing else, `fixtures/clean.html` fires none and
scores 100 in `enforce` mode, and the A3 repairs have their own (an anonymous entry, prices with
401/403/404 in them, a `moderate` axe violation, a token without `@argos-ci/playwright`).
`routes.mjs --check` and the static checks run against small fake apps.

```bash
heavy-slot -- node ~/nadavai/templates/dod/tests/run.mjs            # both runs, about 6 minutes
heavy-slot -- node ~/nadavai/templates/dod/tests/run.mjs --only esm
node ~/nadavai/templates/dod/tests/run.mjs --skip-browser          # tsc and the static checks
```

It installs `tests/package.json` into `DOD_TEST_WORKDIR` (default `<tmpdir>/dod-template-tests`),
never into the repo, and runs Chromium only, with `DOD_WORKERS` workers (default 3).
