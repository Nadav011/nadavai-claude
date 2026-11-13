# DoD gate template (installed by /ux-setup step 12)

It lives under `e2e/dod/` with its own Playwright config, so it never collides with a project's
existing `e2e/` suite. It runs unmodified in an ESM project (`"type": "module"`) and in a CommonJS
one: it reads its JSON files with `fs` and finds them from the working directory, so run it from the
project root (`pnpm dod` does), or set `DOD_ROOT` to the root.

What it measures per route, at 375 and 1440 px, light and dark: HTTP status, whether the page
really painted, horizontal overflow, axe violations of every impact (tags `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, `wcag22aa`), console errors, loaded font families, touch targets under 44 px
(375 only), animations that keep moving under `prefers-reduced-motion`. With `e2e/dod/standard.json`
it also runs the experience standard's checks (below), in a second phase after every scored entry.
It never fails on findings; it writes `reports/dod/dod.json` and screenshots under
`reports/dod/screens/`.

## The score

Each route starts at 100 and loses:

| Finding | Penalty |
|---|---|
| horizontal overflow | -15 per entry (route x viewport x scheme) |
| axe violation, critical or serious | -5 per failing node |
| axe violation, moderate or minor | recorded in `axe.by_impact` and `totals.axe_recorded`, and -5 per node only with `e2e/dod/scoring.json` `{ "axe": { "minorModerate": "enforce" } }` (default `"report"`) |
| console error | -5 each |
| more than 2 font families | -10 |
| touch target under 44 px, at 375 with a touch pointer | -2 each, at most -20 |
| animation under reduced motion | -10 each |
| an entry the session could not open, or that never painted | the score is 0 |
| a route with fewer than 4 results | that route scores 0, and the total is 0 |
| an enforced experience-standard check with findings, or that errored (`mode: "enforce"`, or its id under `"enforce"`) | -10 per check id per route |

Page findings (axe, console, touch, motion) count once per route, the highest of its four entries.
axe runs every impact with the WCAG 2.1 tags added, so a project moving to this template finds more;
minor and moderate nodes cost nothing until it switches `minorModerate` to `"enforce"`, so adopting
the template does not turn its nightly red on the first day. Switch once they are fixed.
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
logs in once into `node_modules/.cache/dod/<vertical>/qa-storage-state.json` (no `<vertical>/`
folder when `DOD_VERTICAL` is unset; `DOD_STORAGE_STATE` moves it) and every entry reuses it. That
file holds the QA account's session cookies: it is written readable by its owner only, kept out of
`reports/`, which CI uploads (`templates/ci/ui.yml` also excludes it from the artifact by name), and
deleted at the end of the run, since global-setup signs in again on every run.
`DOD_KEEP_STORAGE_STATE=1` keeps it for a tool that needs the session after the run (the capability crawl). A page the session cannot
open is recorded as `unreachable` and the score drops to 0: an unmeasured page is never a passing page.
Unreachable means: an HTTP status of 400 or more, a redirect away from the route (unless declared in
`_alias`), the standard's own markers (a visible `[data-state="no-access"]` or
`[data-state="not-found"]`, unless the route is that `?state=` variant), the app's real not-found
screen, or, as a fallback, not-found or denial wording ("העמוד לא נמצא", "שגיאה 404", "אין לך
הרשאה", "access denied", ...) or the app's own error screen. The real not-found screen is printed
once in global-setup: it opens a made-up route as the session and keeps its text
(`reports/dod/not-found-print.json`); an entry whose region shows that same text renders it, in
whatever words the app uses. A catch-all redirect, or a not-found route that shows the same
screen as `DOD_READY_PATH`, leaves no print. The wording is always a phrase: a bare `404` (a stat
card), a `401` in a price or the word "forbidden" in content never make a page unreachable.

The 375 entries have a touch pointer (`hasTouch`, never `isMobile`), as a phone does: `(pointer:
coarse)` matches there and `(hover: hover)` does not, so a control sized by pointer type (S-12) is
measured at its touch size.

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
     { "route": "/", "audience": "anonymous", "static": true, "noHelp": "the public landing page" },
     "/plans",
     "/plans?state=empty",
     "/plans?state=error"
   ]
   ```
   `audience` is `qa` (the default) or `anonymous`. `static: true` marks a page with no data states
   (it exempts state coverage only); `noHelp: "<reason>"` exempts a page from the help door and its
   help file. The old form, `static: true` with no `noHelp` key, still exempts both and prints a
   deprecation note; write `"noHelp": false` for a static page that keeps its door. A string is
   `{ "route": …, "audience": "qa", "static": false }`. `routes.mjs` keeps object entries as they are
   when it writes the file. `node e2e/dod/routes.mjs --check` exits 1 when the app has a route the
   file does not cover, when a dynamic segment has no sample at all, and when the file lists a route
   the app no longer has (a stale entry measures a 404; query variants of a real route are not
   stale): run it in CI so a new page cannot ship unmeasured.
   The scan reads Next's `app/` and `pages/` and React Router's `<Route path>` and `{ path: }` in a
   router file. It misses nested relative routes, path constants and route arrays elsewhere, and a
   route kept on purpose (a not-found sample): list those in `route-params.json` under `_listed`,
   each with its reason, and the stale check skips them (`routes.mjs` writes them back into
   `routes.json` if they go missing; a blank reason fails `--check`):
   `"_listed": { "/missing-page-sample": "the app's own not-found page, measured on purpose" }`.
   A `_listed` route missing from `routes.json` fails `--check`; one the scan finds again is reported
   so it can leave `_listed`.
   `routes.mjs` reads `DOD_ROOT` like the rest of the template.
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
3. `package.json` scripts: `"dod": "node e2e/dod/routes.mjs --check && node e2e/dod/run-dod.mjs"`
   (one route while building a screen: `pnpm dod -- --grep "<slug>__"`; the arguments go to both
   phases). Parallelism: `DOD_WORKERS=8 pnpm dod`. `run-dod.mjs` runs Playwright twice, the scored
   phase then the checks phase, and exits with the scored phase's code. A plain
   `playwright test -c playwright.dod.config.ts` runs the scored phase alone; its `dod.json` then
   says the standard's checks have not run.
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
  other page findings. `"enforce": ["help-door", ...]` in `report` mode deducts for those check ids
  only, so a project moves checks to enforce one at a time. The ids are the ones in
  `e2e/dod/standard-checks.json`, one list for both sides: the DoD run enforces the page checks,
  `routes.mjs --check` the static ones (`help-route`, `brand-assets`, ...), each accepts the other's,
  and an unknown id is a configuration error in both. In enforce, a check that could not measure is
  never a pass: one that errored (also when the whole check call failed on the page, or the run
  stopped the checks, below) costs its 10 points and its route's check says `verdict: "errored"`,
  apart from `"found N"`; each route's check says `enforced: true|false`. The static checks follow
  the same mode: in `report` `routes.mjs --check` prints them and passes, except the ids under
  `enforce`; in `enforce` it fails on them.
- A check of the standard is a heuristic, judged on markup it has not seen. A project keeps every
  check in `report` until a full run on its own routes shows no false alarm for that check, moves
  checks to `enforce` one at a time, and reports a false alarm to the design-skill session with the
  markup that caused it, so the kit's real-markup pages (`tests/fixtures/real-*.html`) grow.
- Report mode never moves a number or the exit code, by order, at the level of the run: `pnpm dod`
  (`run-dod.mjs`) first runs the scored phase, every entry of every route (`dod.spec.ts`, which
  never reads `standard.json`: the same tests and the same timeouts with or without it), and its
  teardown writes the scored `dod.json`. Only after that Playwright run has exited does the checks
  phase start (`DOD_PHASE=checks`: `standard.spec.ts`, and any other spec in `e2e/dod`). Each of its
  tests loads its route again in a fresh context and writes only `results/<name>.standard.json`,
  which the second teardown merges into the entries field by field (`standard`, `probe`,
  `standard_error`, `standard_retried`, `standard_skipped`), never over a scored field. The run's
  exit code is the scored phase's: a hang, a crash or a red test in the checks phase cannot change
  it, and with no check enforced it cannot change a number either. In enforce mode the enforced
  checks' deductions are applied in the aggregation, so the CI score step sees them. The one case
  where the file's presence fails a run: a `standard.json` that is not valid (an unknown id under
  `enforce`, a bad `mode`) stops the run in the scored phase's global-setup, before the walk.
- The checks judge only the page the scored phase measured, and that is proven, not assumed. Each
  checks test loads the route as the scored phase did, runs the scored phase's own access check on
  it (`accessCheck` in `dod-page.ts`: status, redirect, markers, not-found print, denied and error
  wording) and compares it with what the scored phase recorded: the same path (`measured_url`), a
  painted page, no sign-in form where the scored page had none, and the scored page's
  **fingerprint**. The scored phase records the fingerprint on every entry of every run, with or
  without `standard.json` (recorded, not scored): the landmark kinds on the page, its visible
  h1-h3 headings, the labels of the visible controls in the route's region, and a sketch of the
  region's words (64 hashes, no text), all without digits and case. The route's region is the
  page's `<main>` (or `[role="main"]`, `#main-content`) whenever it has one, and the app's root
  (`#root`, `#__next`) only when it has none (`ROUTE_REGION` in `dod-shared.ts`), so the shell of
  a Vite, CRA or Next app (its header, sidebar and footer) does not stand in for the page; "visible"
  leaves out what is hidden and what lies wholly beside the screen (a drawer moved off-canvas). The
  checks phase's load
  matches it when the landmark kinds are the same, at least half of the heading words are shared,
  at most a fifth of the controls (at least one) are missing or new, and at least half of the
  region's words are shared. That keeps a clock, a live count, a relative time, a reordered list
  or a rotating greeting the same page, and makes an error card, a skeleton, a "sign in again"
  card or a framework's crash page at the same URL another one. A route whose content really
  changes more between two loads sets its own tolerance in `routes.json`, with its reason:
  `{ "route": "/feed", "fingerprint": { "words": 0.2, "controls": 0.5, "reason": "a live feed" } }`
  (`headings`, `controls`, `words`, each 0 to 1, and `"landmarks": false` for a route whose
  landmark kinds change between loads, an `<aside>` that shows on some loads only). The fingerprint
  proves the same screen, not the same data state: a partial failure (one section stuck loading,
  one list replaced by its empty state, inside an otherwise full page) can still match the scored
  page, which is the tolerance, not a proof that the two are equal. When any of
  this fails, or the checks phase's own sign-in did not land (global-setup confirms it in both
  phases, and says so loudly), every planned check of that entry is "errored" with the reason (for
  a fingerprint, what differed: "controls 3 → 2 (missing "שמירה"; new "להתחברות")") and the entry
  is listed in `standard.not_checked`: a failure where enforced, a reported gap otherwise, never
  "clean" or "skipped".
- What the run writes is kept free of the QA account and of tokens: every text that comes from a
  Playwright error, a page's URL or console, or the environment goes through one function
  (`redact` in `dod-shared.ts`) before it reaches `reports/`, `dod.json` or the console. It keeps
  the first line only (a Playwright call log is the lines after it), replaces the values of
  `DOD_PASSWORD`, `DOD_USER` and every other `DOD_*` (or `ARGOS_TOKEN`) whose name looks secret
  (a `*_SELECTOR` or `*_PATH` is not: `DOD_PASSWORD_SELECTOR` is named in the messages), and any
  JSON Web Token, with `[redacted]`, and cuts every URL's query and fragment except the route's own
  query from `routes.json`. The password is typed with `keyboard.insertText` once the field shows
  and takes typing (it waits up to 30 s for both, as `fill` would), never
  with `fill`, whose call log carries its value; the sign-in runs in global-setup's own browser,
  outside every test, so no trace, video or screenshot holds it (the config records none anyway).
  The file that says why the checks phase could not sign in is readable by its owner only. The QA
  user is treated as private too: the log says "QA session saved" without naming it.
- `pnpm dod` stopped by SIGINT or SIGTERM interrupts the phase that is running (so its teardown still
  writes `dod.json`; a checks phase stopped this way lists its entries as "not checked: the checks
  phase stopped by SIGTERM"), kills it a minute later if it is still there (at once on a second
  signal, a second Ctrl-C), and starts no other; it exits with the scored phase's code if that phase
  had finished, else 130 or 143. The
  QA session file is deleted after each phase however it ended, and first thing in each teardown.
  Each phase keeps its own Playwright output (`test-results/dod`, `test-results/dod-checks`).
- What the checks phase still does, and the guarantee does not cover: it signs in again and loads
  every checked route once more (twice when a try is retried) with the QA session, after the scored
  phase. It cannot change this run's scores, but an app that rate-limits by session or by account
  sees those loads, and the next run starts after them; a session that does not outlive the scored
  phase alone was already a problem.
- In the checks phase, one try ends at its 30 s deadline, whatever is still running; a try that ran
  out of time, a check call that failed as a whole, or any error under `CI` (`true` or `1`) gets one
  more try on a page that still answers (the viewport back and a trivial call, 5 s each), keeping
  the first try's result for every check that did not error in it (`standard_retried` says why).
  Each checks test ends its checks 10 s before its own timeout (105 s) and writes its file itself,
  once, so nothing is written after the phase's teardown has read it. A resize that loads a new document (a navigation or a same-URL reload) or
  changes the URL (`history.replaceState`) stops the measuring with an error that says which, and so
  does a page that moves after it loaded with no resize yet (a late redirect, said as one); a
  reload too early to see is recorded as the raw "Execution context was destroyed". A check that
  fails or runs out of time (a bad `coreUnit.selector`, a hung page) writes an `error` on that check
  and in `standard.errors`, never an unreachable page or, in report mode, a changed score.
- `maxTimeouts` (default 5): once that many entries of a run ran out of time in the standard's
  checks (a loaded machine, a page that blocks on resize), the rest of the run neither retries nor
  runs them: `standard.skipped_after_timeouts` in `dod.json` gives the count of entries not
  checked, the summary prints it, and in enforce each of them is "errored". The count is shared by
  the workers, and the entries already being checked when it is reached still finish, so a run can
  end with up to `maxTimeouts + DOD_WORKERS - 1` timed-out entries.
- `checksMinutes` (default 60): the checks phase as a whole stops then (`run-dod.mjs` interrupts it;
  its teardown still writes `dod.json`, and a minute later it is killed). The phase keeps the
  deadline itself as well, so a runner killed outright still ends it: no entry starts after it. Every entry it left no
  result for is listed in `standard.not_checked` (count and reason) and in the summary, and is
  "errored" where enforced; so is every entry when the checks phase has not run at all.
  `templates/ci/ui.yml` gives the job 120 minutes: with the default 60 here, the scored walk and
  the job's other steps share the other 60; a project whose scored walk takes longer lowers
  `checksMinutes` or raises `timeout-minutes`.
- `textFloorPx`: the smallest text the probe accepts (default 12).
- `helpDir` (optional): turns on `help-route`.
- `coreUnit` (optional): turns on `core-unit` for that one route.
- `languages` (optional): with two or more, turns on `both-directions`. A language matches the
  routes under its `routePrefix` or with its `query` (`"lang=en"`); one with neither is the default
  language and matches the routes no other language claims.
- `forbiddenWords` (optional): added to the built-in list, matched as whole words. What people
  wrote is not the interface's wording: mark it `data-user-content` (a client's message, a name
  they typed) or `translate="no"`, and forbidden-words skips it; typed field values are never read.
- A `coreUnit.route` that is not in `routes.json` is a configuration error: `routes.mjs --check`
  fails on it in either mode, and the DoD run lists it under `standard.config_errors`.

Every page check is held to stock shadcn/Radix markup as well as its own fixture
(`tests/fixtures/real-settings.html`, `real-table.html`): a check that fails a well-built screen
teaches people to ignore the checks.

What each check reads (the markers are the standard's: `data-help`, `data-state`):

| Check | Where | Fires on |
|---|---|---|
| `help-door` | every entry, except routes with `noHelp` (or the old `static: true`) | no visible `[data-help="door"]` inside a `header`/`[role="banner"]` or in the first 120px, or no visible `[data-help="screen"]`. With a modal dialog, sheet or menu open on load, the aria-hidden Radix puts on the page is looked past: the door is still the page's |
| `tooltip-only` | every entry | a visible element with a `title` and no readable text of its own (a lone `?` is not text), no `aria-describedby` to visible text, outside `[data-help]`, unless the title's words are already beside it as its label: a text in its parent or its wrapper's parent with exactly the title's words, up to 60 characters, headings not counted (an avatar beside the name passes; an icon under a heading of the same word, or beside a cell "עריכה אחרונה: אתמול" for the title "עריכה", does not), or the title as whole words in the label of its labelled group; or one described only by a hidden `[role="tooltip"]` in the DOM. The sidebar rail (`[data-sidebar="rail"]`) is not judged. A Radix tooltip is not in the DOM until hover, so its trigger is not judged |
| `disabled-reason` | every entry | a disabled control (or `aria-disabled="true"`) outside `[aria-busy="true"]` with no `aria-describedby` to visible text on it or on its group (a legend is linked that way: `aria-describedby` on the `role="group"` of time slots). Not judged where its place is the reason: the current page (`aria-current` other than `"false"`, a breadcrumb page), a numbered calendar day, a pager's, calendar's or carousel's previous/next (inside `[data-slot="pagination"]`, a pagination `nav`, `.rdp-nav`, a carousel's "השקופית הקודמת"/"Previous slide", a menu's "חזרה"/"קדימה" (back/forward) item, or a previous and a next control side by side outside a form), a stepper beside a number field or a number shown as text whose whole name is +/-, a stepper word ("הפחתה", "הוספה", "decrease", ...) or nothing (an unnamed icon); and an option or item whose own text gives the reason, two words or more with a letter, in brackets or after a dash ("פדיקור (אין תורים החודש)"). A wizard's disabled "הבא", also beside "הקודם" in a form, a disabled action in a grid row or a carousel slide, an icon-only "הוספה לסל" beside a quantity, "ייצוא (CSV)" and "09:00 - 09:45" all fire |
| `placeholder-label` | every entry | an input with a placeholder and no visible `<label>` or `aria-labelledby` to visible text (`aria-label` is not visible). A search box with an accessible name passes: `type="search"`, `role="searchbox"`, or a combobox inside a command palette (`[cmdk-root]`) or `[role="search"]`; any other combobox is a field |
| `input-attrs` | every entry | a text-like `<input>` with no `autocomplete`; a phone, email or number field without the matching `type` or `inputmode`, decided by its `autocomplete`, or by the last meaningful word of its `name` or `id` ("emailSubject" is a subject; "email_address", "phoneNumber" are what they say), or by two weak signals together (label words and a placeholder that looks like one) when no `autocomplete` token names what it is ("אימייל או שם משתמש" with `autocomplete="username"` is a login), never by a label alone and never on a field that declares another kind; at phone widths only, an input, textarea or select under 16px (iOS zooms: stock shadcn `Input` is fine, stock `CommandInput`, `text-sm`, is not). Search boxes, as in `placeholder-label`, are judged on the 16px floor only |
| `one-primary` | every entry | more than one action whose computed background equals the `--primary` that element itself inherits (so a multi-brand wrapper's own token counts), counted in the last open `[role="dialog"]`/`[role="alertdialog"]`/`dialog[open]` alone when one is open; skipped (and said so) when no `--primary` resolves. A thing filled to show its state is not an action: switches, checkboxes, radios, tabs, options, calendar cells, and anything with `aria-selected`, `aria-pressed`, `aria-checked` or `aria-current` |
| `nav-count` | 375 only | a fixed or sticky bottom `nav` with more than five items, or a badge there with no digit (`[data-badge]`, or a small absolutely placed filled element) |
| `empty-action` | every entry | a `[data-state="empty"]` with no visible button or link inside (`clear` needs none) |
| `error-toast` | every entry | an error (`[role="alert"]`, `[data-state="error"]`, `[data-type="error"]`) inside a toast region, found by structure whatever its label's language (`[data-sonner-toaster]`, a live `section` or `[role="region"][aria-live]`, a region holding Radix Toast's `ol[tabindex="-1"]`, or `[data-toast-region]`), or an error element removed from the page while nobody touched it |
| `error-field` | every entry | an `[aria-invalid="true"]` field with no `aria-describedby` to visible text. Only this static half is built; the half that submits a form and checks the focus is a later step |
| `forbidden-words` | every entry | on the interface's visible text, placeholders and button values, with niqqud removed first, outside `[data-user-content]`, `[translate="no"]`, `textarea` and editable areas: "נא", "אנא", "ניתן", "כעת", "אופס" as words (with a ו prefix, and "שניתן"), "!", emoji, slash, dot or bracket gender forms ("מטפל/ית", "לחץ/י", "מטפל.ת", "מדריך(ה)"; a dot needs two letters before it, so "ע.ה" and "ז.ל" pass), and the project's words (Latin ones in any letter case) |
| `core-unit` | its route, the light entry nearest its viewport | fewer than `min` of `selector` fully visible at `viewport`, above any fixed bottom bar and inside every clipping box |
| `probe` | once per route, split between its two light entries | 320x700, 390x844 and 768x1024 on the 375 light entry (touch pointer, with touch targets under 44 px), 1024x768 and 1280x648 on the 1440 light entry (mouse); each resizes its own page, so no page is loaded for it: sideways scroll, text under `textFloorPx`, one word of a control's label on two lines. A resize that navigates the page stops the probe with an error. "An icon covered by its badge" is not built |
| `state-coverage` | `routes.mjs --check`, and every `?state=empty` / `?state=error` entry | a route not flagged `static`, and not itself a `?state=` variant, with no `?state=empty` or no `?state=error` variant (other query parameters must match); and a `?state=empty` entry that renders no visible `[data-state]` of `empty`, `clear` or `filtered-empty`, or a `?state=error` entry with no visible `[data-state="error"]` |
| `help-route` | `routes.mjs --check`, with `helpDir` | a route without `noHelp` (or the old `static: true`) with no file `<helpDir>/<slug>.<any extension>`, the slug taken from the route pattern the way report slugs are: `/orders/[id]` and `/orders/:id` are `orders-id.md`, `/` is `root.md`. Every such route counts: the menu is not read |
| `brand-assets` | `routes.mjs --check` | no PRODUCT.md at the root, no `Brand` (or `מותג`, `המותג`) heading in it, or a file path the section names that does not exist: a link target with an extension, or a code span with a `/` and an extension or with an asset extension (`.svg`, `.png`, `.woff2`, ...), looked for from the root, under `public/` for a path starting with `/`, and through the project's `@/*` alias (else `src/`) for one starting with `@/`. `--primary` or `tokens.ts` in a code span is a value, not a path |
| `both-directions` | `routes.mjs --check`, with two or more `languages` | a language with no route in `routes.json` |

`tour-no-commit` is not built: no project has a tour manifest for it to read yet.

In `dod.json` each route has `standard: { <check-id>: { count, samples, skipped?, error?, verdict,
enforced } }` (its highest entry; `verdict` is `"errored"`, `"found N"`, `"skipped"` or `"clean"`),
each entry its own `standard`, `standard_retried` when it took a second try, `standard_skipped` when
the run had stopped the checks, `standard_unchecked` when the checks phase left it no result, its
`measured_url` and, on the light entries, `probe` by size; the top level has `standard` (mode, the
enforced ids, profile, per check id the routes, findings, errors and skips, `not_checked` by
reason, and what is not built) and `totals.standard_findings` (all findings),
`totals.standard_failures` (check ids with findings), `totals.standard_errored` (check ids that
errored) and `totals.standard_scored` (the enforced ones among both, which cost points).

## The extended checks (report only)

Five checks the experience standard lists that axe and the checks above do not cover
(`standard/experience.md`, rules A-01 to A-03, H-02 and H-03). `e2e/dod/extended-checks.spec.ts`
runs them in the checks phase, so only when `standard.json` exists, once per route that the
scored phase reached, on the light 1440 entry's page: each check loads the route again and judges
nothing until the access check and the scored page's fingerprint show it is that page. They only
report: one file per route, `reports/dod/results/extended/<slug>.json` (`{ route, mode: "report",
checks: { <id>: { count, kinds, samples, error? } } }`), and one line per route in the log
(`[dod] extended /calendar: forced-colors found 3, text-reflow clean, ...`). Nothing of them
reaches `dod.json`, the score or the exit code, and none of them can be put under `enforce` yet:
moving them into `dod.json`'s `standard` block is a change to the teardown, kept for when the kit's
other open branch has landed.

| Check | Where | Fires on |
|---|---|---|
| `forced-colors` (A-01, partly) | 1440x900, Chromium's forced colours (`forcedColors: "active"`, which paints the forced palette, not only the media query) | `boundary`: a button, field, select, switch, checkbox or slider with no border on any side and no outline, and no wrapper within 8px of it that has one (a native checkbox, radio or select, and anything under `forced-color-adjust: none`, are drawn by the system or the page and not judged); `focus`: one of the first 25 elements Tab reaches whose picture, 6px around it, is the same focused and not (a focus ring made of `box-shadow` alone, which forced colours remove); `state`: a selected, current, pressed or checked item that in normal colours looks different from an unselected one of the same kind beside it and in forced colours looks the same (it was told apart by a background or a shadow only); `mark`: an element 3px to 600px with no words in it or beside it, painted only by its background colour (a status dot, a progress fill), which forced colours paint the page colour |
| `text-reflow` (A-02) | 640x512 and 320x256: the 1280x1024 window at 200% (1.4.4: no loss, sideways scroll allowed) and at 400% zoom (1.4.10: also one scroll direction) | `clipped`: text partly outside a box that hides its overflow (`overflow: hidden` or `clip`, an ellipsis, a line clamp); text wholly outside its box is a closed panel and is not judged, nor is a slide of a carousel (`aria-roledescription`); `unreachable`: text partly beside the window on a side no scroll reaches (the right of a right-to-left page, the left of a left-to-right one, either side when the page does not scroll sideways); `sideways` (320 only): the page scrolls sideways, so it scrolls both ways. The 1.4.10 exception: text inside a box that scrolls on its own (a wide table, a map in its scroller) is reachable and not judged, whatever its width; a wide part with no scroller of its own makes the page scroll and is a `sideways` finding at 320. The fix for a table is its own scroller (`overflow-x: auto`) |
| `text-spacing` (A-03, partly) | 1440x900 and 375x812 | with the four overrides of 1.4.12 (`TEXT_SPACING_CSS`: line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em), text `clipped` or `unreachable` as above, or two texts that `overlap`, that were not before the overrides (a badge over its label on purpose is not a finding) |
| `consent-prechecked` (H-02) | the page as it loaded | a checkbox or switch that is on, whose label speaks of consent (mailing, updates, offers, marketing, cookies, sharing, third parties, privacy, "מסכים", "מאשר", Hebrew or English), other than a disabled one labelled necessary ("הכרחיות", "necessary") |
| `consent-refuse` (H-03) | the page as it loaded | an accept control ("אישור הכול", "לאפשר", "מסכים", "Accept all", ...) inside a box whose words are a consent request (cookies, mailing, marketing, consent, a permission, location, notifications): `no-refuse` when no refuse control ("דחיית הכול", "לא תודה", "לא עכשיו", "Reject all", ...) is in the box; `weak-refuse` when none is as prominent, the stated rule being: a button or link like the accept control, at least half its area, its text at least 85% of the accept text's size, and at least 4.5:1 against its own background (`PROMINENCE` in `consent-checks.ts`) |

What they cannot see, and the reviewer of each rule reads instead: a consent box or banner in
other words than the lists hold; a focus ring on an element past the first 25 Tab stops; text
spacing inside a shadow root (the overrides are a page stylesheet); a state told apart by a
background inside `forced-color-adjust: none`; and what a forced-colours user can do with a
control, beyond seeing its edge. Each is a heuristic in report mode, held, like the checks above,
to a page that fails it and a clean page that passes them all (`tests/fixtures/extended/`), and
each condition to a test that fails without it:

```bash
heavy-slot -- node ~/nadavai/templates/dod/tests/extended-checks.mjs               # tsc, fixtures, condition tests, one run-dod.mjs
node ~/nadavai/templates/dod/tests/extended-checks.mjs --skip-browser              # tsc only
```

## Moving a project to this template

Five projects run an older copy. What changes for each, in the order it bites:

- **Field renames in `dod.json`.** `axe.critical_serious` is gone: an entry has `axe.counted` (every
  node), `axe.scored` (the nodes that cost points) and `axe.by_impact`; `totals.axe_critical_serious`
  is `totals.axe_violations` (scored), next to `totals.axe_recorded` (all). Who reads the old names
  today, to update in the same change: therapy-flow-v2 `tests/fidelity/dod-clinic-words.test.ts`;
  sportchat-web its `dod-baseline`, `dodExtraViewports`, `dod-locale-twin` and `dod-narrow` tests and
  `e2e/baseline/look-asserting-files.json`; cash-next-app `e2e/dod/dod.spec.ts`,
  `global-teardown.ts`, `dod-shared.ts` and `states.spec.ts`.
- **The stale check.** `routes.mjs --check` now fails on a listed route the scan cannot find. Run it
  once; add each real route it reports to `_listed` with its reason (mexicani-shifts:
  `/missing-page-sample`), and remove the ones that are really gone.
- **axe.** The run adds the WCAG 2.1 tags and records every impact. With no `scoring.json` only
  critical and serious nodes cost points, as before, so the score moves only by what the new tags
  find at those impacts. Expect `axe_recorded` well above `axe_violations` at first; fix those, then
  set `"minorModerate": "enforce"`.
- **Unreachable pages.** A body that only says "forbidden", a `404` stat card or a `401` in a price no
  longer fails a page; an SPA's own not-found screen and the `data-state` markers now do. A route
  that newly reports "renders the not-found page" was never being measured.
- **`static`.** It now exempts state coverage only; add `"noHelp": "<reason>"` where the page has no
  help door on purpose. Until then the old form keeps working and prints a deprecation note.
- **The QA session was uploaded.** Projects that copied the old kit kept `qa-storage-state.json`
  (the QA account's session cookies) in `reports/dod/`, and the CI workflow uploads that folder with
  every report: update the kit, or at least exclude the file from the artifact (as `ui.yml` now
  does), and treat the QA account's sessions as exposed. Ending them: sign the QA account out
  everywhere (on Supabase, the admin global sign-out, `auth.admin.signOut(<its access token>,
  "global")`, or deleting its rows in `auth.sessions`), rotate its password, then delete the old
  `dod-report` artifacts. Deleting artifacts is a deletion: ask Nadav first, with the list,
  `gh api "repos/<owner>/<repo>/actions/artifacts?name=dod-report&per_page=100" --paginate --jq
  '.artifacts[] | [.id, .created_at, .expired] | @tsv'`.
- **Touch at 375 (score-moving).** The 375 entries now run with a touch pointer, so `(pointer:
  coarse)` matches and `(hover: hover)` no longer does. A project that sizes controls by pointer
  type gains up to 20 points on touch targets, but its larger touch-sized controls can also add a
  sideways scroll, so a score can move either way; one that swaps its interface on a pointer or hover
  query has that other interface measured at 375. Argos shows a one-time difference only on the 375
  screenshots of pages with pointer or hover queries.
- **The reduced-motion reload must land on the route (plain runs too).** After the reload that
  measures reduced motion, an entry whose path differs from the first load's (a session that expired
  mid-run and sent it to sign-in) is now `unreachable`, and the score is 0 until the session lasts
  the run. Before, that sign-in screen's motion was counted as the page's.
- **`pnpm dod` runs `run-dod.mjs`.** Change the `dod` script (Install, step 3). The standard's
  checks are a second Playwright run after the scored one; a project that calls `playwright test`
  directly gets the scored phase only. A test of the project's own in `e2e/dod` runs in the checks
  phase, not between scored entries.
- **The sign-in must land.** global-setup now fails the sign-in when, after the submit, the page
  still shows a sign-in form, or `DOD_READY_PATH` does: before, it saved whatever session it had.
  The path is not what decides, so an app whose form and dashboard are both at "/" signs in; it
  waits up to 15 s for the form to go, so a single-page app that changes its route only after its
  sign-in request lands too. A
  project whose ready page has a password field on purpose points `DOD_READY_PATH` elsewhere. The
  password field must show and take typing within 30 s (a field enabled a moment after load, or
  after a check of the email, signs in).
- **The checks need the fingerprint.** Results from an older kit have none, so a checks phase run
  on them judges nothing; run both phases with this kit (`pnpm dod` does). A route whose content
  changes a lot between two loads gets a `"fingerprint"` tolerance in `routes.json`, with a reason.
- **Run from the root.** The template finds its files from the working directory (or `DOD_ROOT`),
  not from `__dirname`; an ESM project drops its `import.meta` and JSON-attribute patch.
- **Heavily customised copies port by hand**, check by check, instead of copying the files over:
  SportChat (27 DoD files), therapy-flow-v2 (its own `routes.ts` and verticals), cash-next-app
  (`dod-probes.ts`, `states.spec.ts`, its auto sign-in).

## Tests of this template

`tests/` is not copied into projects. It serves small fixture pages and drives the real template
code against them twice, from a project with `"type": "module"` and from one without: every check
has a fixture that makes it fire and fires nothing else, `fixtures/clean.html` fires none and
scores 100 in `enforce` mode, and the A3 repairs have their own (an anonymous entry, prices with
401/403/404 in them, a `moderate` axe violation, a token without `@argos-ci/playwright`).
`routes.mjs --check` and the static checks run against small fake apps.

```bash
heavy-slot -- node ~/nadavai/templates/dod/tests/run.mjs            # both runs, about 45 minutes
heavy-slot -- node ~/nadavai/templates/dod/tests/run.mjs --only esm
node ~/nadavai/templates/dod/tests/run.mjs --skip-browser          # tsc and the static checks
```

It installs `tests/package.json` into `DOD_TEST_WORKDIR` (default `<tmpdir>/dod-template-tests`),
never into the repo, and runs Chromium only, with `DOD_WORKERS` workers (default 3).
