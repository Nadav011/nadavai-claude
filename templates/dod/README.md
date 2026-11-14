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
scored phase reached, on the light 1440 entry's page, in four runs: forced-colors, text-reflow and
text-spacing each open a new page of the route, and the two consent checks share one, since both
only read the page as it loaded. A run judges nothing until the access check and the scored page's
fingerprint show it is that page. They only report: one file per route,
`reports/dod/results/extended/<slug>.json` (`{ route, mode: "report", checks: { <id>: { count,
kinds, samples, notes?, tried?, changedWhenCut?, error? } } }`), and one line per route in the log
(`[dod] extended /calendar: forced-colors found 3, text-reflow clean (2 writes tried while cut off),
...`). `count` is the number of elements found, one finding per element (ten "עריכה" buttons with the
same fault are ten); `notes` say what a check could not judge, `tried` the writes the app tried after
the network was cut off, and `changedWhenCut` how the page changed when it was cut off (below); none
of them is ever a finding or part of `count`. A check that could not judge says why in `error`, and the log says "not checked" (a reason
a person can act on) or "errored" (anything else). None of them can be put under `enforce` yet:
moving them into `dod.json`'s `standard` block is a change to the teardown, kept for when the kit's
other open branch has landed.

They run last, so nothing of them reaches `dod.json`, the score or the exit code, whatever the
deadline: in the checks phase, `playwright.dod.config.ts` makes them their own project
(`extended`), the teardown of the project that runs every other check (`checks`), so they start
only after those have finished and never take their share of `checksMinutes`. A run starts only
while more than 20 seconds of that deadline are left; otherwise it writes `error: "not checked: out
of time ..."`. A one-route run writes that route's `extended/<slug>.json` and no other. With
`pnpm dod -- --grep "<slug>__"` that is because Playwright (1.64.1, measured) does not apply `--grep`
to a teardown project's tests, so every extended test starts, and each returns at once for a route
this run did not measure. `--grep "<slug>__|extended <slug>$"` (what `screen` step 7 runs) names the
route's extended test as well, so it holds on a version that does filter them.

### What the checks may set off, and the network cut

The checks move focus, resize the window, switch forced colours on and add a stylesheet, and an
app's own handlers can answer that with a save (a field that saves on blur, a draft saved on
resize, a mobile redirect that saves as it leaves). So each run has a browser context of its own,
made from the test's options and from the storage state the test started with, through a proxy on
loopback that the run starts for itself (`networkCut` in `a11y-extended.ts`; Chromium is told
`<-loopback>`, so the app's own `localhost` goes through it as well). Before the check starts, the
run cuts the network off (`guard.watch`): the proxy closes every connection it carries and refuses
every new one. Nothing puts it back: the context is closed while it is still cut off, then the proxy.

The kit measured this on Playwright 1.64.1's Chromium, with a logging server on loopback: after the
cut the server received nothing, on every row of the table below that says "cut". Every one of
those rows has a fixture page whose test asserts it on the server, through the same steps as the
spec, and the phase run asserts it for the spec itself. The same measurement is why the kit does
not use `context.setOffline(true)` or DevTools' network emulation: with either, a leaving
document's beacon and keepalive fetch, a message on an open WebSocket, a SharedWorker's request and
a WebTransport session still reached the server.

The context's route only records. A request that is not GET, HEAD or OPTIONS, made after the cut by
a live page, a popup, a frame or a dedicated worker, goes in the check's `tried` field, grouped by
method, path (its numbers folded to `#`) and sender, with how many times and what the check was
doing at the first ("the page tried to write (POST /save) 4 times while the network was cut off,
first when focus moved on with Tab"). It keeps 40 groups apart and counts the rest in one more;
`samples` describes at most 8: when there are more groups, the first 7 and an eighth sample that
counts the writes of the others. `count` is every write the route saw, described or not. The route
does not see a document that is leaving, a SharedWorker, a `fetchLater` or a socket: the cut stops
those too, but `tried` does not count them, so it is what the route saw, not all the app tried. It
is what the app did, not a fault of the screen: the log says "clean (N writes tried while cut
off)", never "found N". A run's writes are reported under its first check; for the consent run that
is `consent-prechecked`.

| What the page sends | What happens to it | Proved by |
|---|---|---|
| a write of a live page, a popup, a frame (also of another origin) or a dedicated worker: `fetch` (also `keepalive`), `XMLHttpRequest`, `sendBeacon`, a form posted into the page, a frame or a new window, `<a ping>`; also one set off by the check (focus, forced colours, a resize, a style tag) or as it ends | cut; recorded in `tried`, with who sent it and what the check was doing (the spec waits 500 ms after a check before it takes them; 40 kinds kept apart, 7 described) | `save-on-focus.html` (forced-colors), `save-xhr.html` (forced-colors), `save-forms.html` (forced-colors), `save-form-self.html` (forced-colors), `save-ping.html` (forced-colors), `save-in-popup.html` (forced-colors), `save-in-worker.html` (forced-colors), `save-via-sw.html` (forced-colors), `save-xo-frame.html` (forced-colors), `save-resize-style.html` (text-reflow), `save-resize-style.html` (text-spacing), `save-late.html` (forced-colors), `save-many-paths.html` (forced-colors), the phase run, `/save-on-focus`, the phase run, `/save-late`; M:cut, M:refuse-new, R:no-loopback, S:spec-no-proxy, M:tried, M:from-popup, M:from-worker, M:watch-moment, M:moment, S:no-settle, M:samples-cap, M:tried-keep, R:overflow-drops |
| a write of a document as it leaves (a redirect, a navigation, a popup closed), also through another frame's realm or in `pageswap` or `navigate`; `fetchLater`, at once, later or as the context closes | cut; not recorded (no route sees them) | `save-leave-nav.html` (forced-colors), `save-resize-leave.html` (text-reflow), `save-xrealm-leave.html` (forced-colors), `save-pageswap.html` (forced-colors), `save-popup-close.html` (forced-colors), `save-fetchlater.html` (forced-colors); M:cut |
| a WebSocket message, on a socket open since the load (from the page, a dedicated worker, a popup, a page that then leaves) or on a new one; a SharedWorker's requests; a GET (an image, a script, `EventSource`, a prefetch, speculation rules) | cut: the proxy closes every open connection and refuses new ones; not recorded | `save-ws-open.html` (forced-colors), `save-worker-ws.html` (forced-colors), `save-popup-ws.html` (forced-colors), `save-ws-leave.html` (forced-colors), `save-in-shared-worker.html` (forced-colors), `save-shw-iframe.html` (forced-colors), `save-get.html` (forced-colors), `save-keep-writing.html` (forced-colors), the direct test of `networkCut()`, the phase run, `/save-ws-open`, the phase run, `/save-keep-writing`; M:cut, M:drop-open, M:refuse-new, R:reconnect, S:spec-no-proxy |
| a WebTransport session | not sent at all: Chromium sends no QUIC through a proxy, cut or not | `save-webtransport.html` (forced-colors); R:no-proxy |
| a timer or a retry loop, an outbox kept in localStorage, `BroadcastChannel` or a `storage` event to another tab | cut; the context is closed while cut off and nothing it stored is captured, so the next run starts from the test's storage state | `save-retry.html` (forced-colors), `save-outbox.html` (forced-colors), the phase run, `/save-retry`, the phase run, `/save-outbox`, the phase run, `/save-tabsync`; M:cut, S:chain-state |
| a write while the page loads, from the page or a popup it opens (a page view, an error report, an auth refresh, a read through POST) | passes, as in the scored phase: the cut comes after the load | `reads-on-load.html` (forced-colors), `load-popup.html` (forced-colors), the phase run, `/reads-on-load`; R:cut-at-load |
| a GET that writes before the cut (a page view logged by GET) | passes, as in the scored phase | none |
| a WebRTC connection, as the page loads or during the check, from the page or a frame (a blank one, one of another origin, a srcdoc frame); its UDP goes past the proxy | refused: `RTCPeerConnection` is taken away in every document, and the run is not checked when the document that tried is still open as the run reads it (see the refusal, below) | `save-webrtc.html` (forced-colors), `save-webrtc-load.html` (forced-colors), `save-webrtc-iframe.html` (forced-colors), `save-webrtc-xo.html` (forced-colors), `save-webrtc-srcdoc.html` (forced-colors), the phase run, `/save-webrtc`, the phase run, `/save-webrtc-load`, the phase run, `/save-webrtc-iframe`, the phase run, `/save-webrtc-xo`, the phase run, `/save-webrtc-srcdoc`; M:webrtc, R:rtc-top-only, S:no-refusal |
| a page that changes when cut off (an offline banner, an error state) | checked as it is then; `changedWhenCut` names the change, and the log says "changed when cut off" | the phase run, `/cut-banner`; S:no-second-fingerprint |
| a page that leaves its route during a check (under the cut, a navigation to another document ends on an error page) | not checked, with where it went; nothing it measured there is reported | `save-spacing-redirect.html` (text-reflow), the phase run, `/save-spacing-redirect`; M:left, S:no-left-check |

The load window: until the cut, the context's requests pass, the page's own and those of a popup it
opens, because apps read through POST too (GraphQL, an RPC) and the scored phase let the same
requests pass. The cut comes after the page settled (`settle` in `dod-page.ts`: the network idle,
then 1.2 s), the access check and the fingerprint compare, so the page a check judges is the one the
scored phase saw. A write the app sends on its own in that window (a timer, a page view, an error
report while it loads) reaches the server, as in every phase of the kit.

The page under the cut. The proxy changes nothing the page can read: `navigator.onLine` stays true
and no `offline` event fires (measured; `setOffline` would set both). What the page meets is a
request that fails as a network error and an open WebSocket that closes. After the cut the run
settles the page again and takes one more fingerprint; when it differs from the one before the cut
(any heading or region word, or more than one control: an offline banner, an error state, a
signed-out screen), the result's `changedWhenCut` names the difference and the log says "changed
when cut off". The findings of that run are then of that state, not of the normal screen. A page
that polls changes at its next poll: one that comes later than the 1.2 s settle can change the page
while the check runs, and nothing names that. A navigation to another document fails under the cut
and shows an error page, so a page that leaves its route during a check (its main frame goes to
another path or site, or shows an error page) is "not checked: the page left its route during the
check (it went to an error page); nothing measured after that is reported"; a route change inside
the page by `pushState` names the path it went to (measured), and a change of the hash alone is not
followed.

The refusal: a WebRTC connection's UDP goes past a proxy, and so past the cut (measured: its STUN
requests reached the server after the cut). So the kit takes `RTCPeerConnection` away in every
document of the run, frames and popups included; it throws as a missing feature would, so nothing
is sent, and it marks the document whose `RTCPeerConnection` was called. The run reads those marks
twice, before the cut and after the check, in the documents then open (every page of the run and
its frames): when the document that tried is still open then, as it loads or during the check, the
run is "not checked: the page tries to start a WebRTC connection, which the network cut does not
reach, so these checks take it away". An attempt in a frame since removed or a popup since closed
fails the same way and sends nothing, but the run is not told, so it is reported as checked
(measured, review 7).

What persists between runs: nothing. Each run starts from the storage state the test started with
(anonymous: empty; signed in: the checks phase's sign-in), never from one captured after a run;
nothing a run's context stored (cookies, localStorage, sessionStorage, IndexedDB, an outbox) is
captured or written back; and the context is closed, still cut off, when the run ends, on success
and on failure, so an app's outbox, another open tab of the same app and a retry loop end with it.

An auth refresh by POST: while the page loads it passes, and it is a write: with refresh-token
rotation, each run sends the same refresh token from the same start state, so a route uses it four
more times, and reuse detection (Supabase's default) can then revoke the QA session on the server;
the scored phase's entries already do the same. After the cut it fails, and the app may then sign
itself out, so the check measures the signed-out screen; when that happens within the settle after
the cut, `changedWhenCut` says so, and later it does not. What a person does: run the checks with a
QA account whose session may be revoked, with refresh-token reuse detection off for it or a token
that does not expire during the run.

What a project does about a row it cannot accept (a GET that writes as the page loads, a WebRTC
page that is never checked): run the checks only against a QA account whose data may change; or
turn them off for that project, either by leaving `standard.json` out (which also turns off the
checks phase) or by deleting `e2e/dod/extended-checks.spec.ts` (which turns off these checks
alone). A project whose pages load only through a proxy of its own cannot use them: the run's
context goes through the kit's proxy, which connects directly. The fixture pages run in browser
cases, and most of them also through the spec itself in a real `run-dod.mjs` run, whose test asserts
that the server got no write while the extended checks ran (but the reads of `reads-on-load.html`
as it loads, and what `save-keep-writing.html` sends before its first write fails), and none at
all, over the whole run, of the pages that write only in these checks.
`save-in-shared-worker.html` and `save-shw-iframe.html` are in the browser cases only, since the
scored phase times out on a page that starts a SharedWorker.

### What each check finds

| Check | Where | Fires on |
|---|---|---|
| `forced-colors` (A-01, partly) | 1440x900, Chromium's forced colours (`forcedColors: "active"`, which paints the forced palette, not only the media query) | `boundary`: a button, field, select, switch, checkbox or slider with no border of 1px or more on any side and no outline of 1px or more, and no wrapper within 8px of it that has one (a native checkbox, radio or select, and anything under `forced-color-adjust: none`, are drawn by the system or the page and not judged; a ghost or icon button with no border is a finding, which its fix, a transparent border, removes); `focus`: one of the first 25 elements Tab reaches whose picture, 6px around it, is the same focused and not (a focus ring made of `box-shadow` alone, which forced colours remove); `state`: a selected, current, pressed or checked item that in normal colours looks different from an unselected one of the same kind beside it and in forced colours looks the same (it was told apart by a background or a shadow only); `mark`: an element 3px to 600px with no words in it or beside it, painted only by its background colour and not the colour behind it (a status dot, a progress fill), which forced colours paint the page colour |
| `text-reflow` (A-02) | 640x512 and 320x256: the 1280x1024 window at 200% (1.4.4: no loss, sideways scroll allowed) and at 400% zoom (1.4.10) | `clipped`: text partly outside a box that hides its overflow (`overflow: hidden` or `clip`, an ellipsis, a line clamp); text wholly outside its box is a closed panel and is not judged, nor is a slide of a carousel (`aria-roledescription`); `unreachable`: text partly beside the window on a side no scroll reaches (the right of a right-to-left page, the left of a left-to-right one, either side when the page does not scroll sideways, as when `html` or `body` hides what is wider); `sideways` (320 only): the page really scrolls sideways (not when `html` or `body` hides the overflow) because of an element that is not a part needing two dimensions; the sample names the widest such element. 1.4.10's exception, two ways: text inside a box that scrolls on its own (a wide table in its scroller) is reachable and not judged, whatever its width; and a part that needs two dimensions (a data table, `role="table"`, `role="grid"` or `role="treegrid"`, an image, a map or chart in `svg`, `canvas`, `video`, `iframe`, `role="img"`; a `table` with `role="grid"` or `role="treegrid"` whatever its columns; not a CSS grid layout, not a layout table, meaning one column with no header cell or caption, or `role="presentation"` or `role="none"`, not `role="table"`, `role="grid"` or `role="treegrid"` on an element other than a `table` that has no `role="row"`, not any role on an element other than a `table` that holds the page's `main` or its first `h1` (which would excuse the whole page), and not `role="application"`), or a wrapper that is wide only because of one, may make the page scroll sideways. Everything else must still fit the window: a paragraph, heading, search field or pagination made as wide as the table it goes with (WCAG's Understanding Reflow, Figures 9 and 13, both fails) is not two-dimensional, so it is the `sideways` finding, named as the widest element |
| `text-spacing` (A-03, partly) | 1440x900 and 375x812 | with the four overrides of 1.4.12 (`TEXT_SPACING_CSS`: line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em), text `clipped` or `unreachable` as above, or two texts that `overlap`, that were not before the overrides (a badge over its label on purpose is not a finding) |
| `consent-prechecked` (H-02) | the page as it loaded | a checkbox or switch (also one that only `aria-checked` says is on, and a native box hidden and drawn by its label) that is on, whose label speaks of consent (mailing, updates by mail or message, offers, marketing, cookies, sharing, third parties, privacy, "מסכימה", "מאשר", Hebrew or English; not an app's own updates), other than a disabled one labelled necessary ("הכרחיות", "necessary"). The check cannot tell a default from a choice she saved earlier (a profile page shows her own choice ticked), so the sample says "is on when the page loads (a default, or a choice saved earlier: a person reads which)" |
| `consent-refuse` (H-03) | the page as it loaded | an accept control ("אישור הכול", "לאפשר", "מסכים", "Accept all", ...) inside a box whose words, other than the button's own, are a consent request (cookies, mailing, marketing, consent, a permission, location, notifications): `no-refuse` when no refuse control ("דחיית הכול", "לא תודה", "לא עכשיו", "לא כרגע", "אחר כך", "ביטול", "Reject all", "Decline all", "Deny all", "Later", "Don't allow" with either apostrophe, ...) is in the box; `weak-refuse` when none is as prominent, the stated rule being: a button or link like the accept control, at least half its area, its text at least 85% of the accept text's size, and at least 4.5:1 against its own background (`PROMINENCE` in `consent-checks.ts`). Closing the box ("סגירה", an X) is not a refuse control (H-03). A generic "אישור", "OK" or "Got it" in a box with fields of its own is that form's submit and is not judged. Colours are read as the browser paints them (any syntax: `oklch`, `color-mix`, hex), each faded by its element's and its ancestors' `opacity` and `filter: opacity()`, and a translucent background is laid over what is painted under the control's centre (`elementsFromPoint`: its ancestors, and a backdrop beside the banner), down to the page's own canvas (dark under `color-scheme: dark`); when an image or a gradient is behind the refuse control, its contrast is not judged: if its area and text size pass, it gets a note ("contrast not judged"), not a finding |

Each check is a heuristic in report mode, held to fixture pages that fail it and pages that pass
them all (`tests/fixtures/extended/`, `pass.html` holding each exemption), and each condition and
threshold, and each part of the network cut, to a test that fails without it:

```bash
heavy-slot -- node ~/nadavai/templates/dod/tests/extended-checks.mjs               # tsc, fixtures, mutants, run-dod.mjs runs, spec mutants
node ~/nadavai/templates/dod/tests/extended-checks.mjs --skip-browser              # tsc and the table of the cut only
heavy-slot -- node ~/nadavai/templates/dod/tests/extended-checks.mjs --skip-run --cases-only  # the fixture cases, no mutants
node ~/nadavai/templates/dod/tests/extended-checks.mjs --print-channel-table       # the table above, from the test's data
```

### What this does not catch

What the checks miss, and what the reviewer of each rule reads instead:

- A consent box or banner in other words than the lists hold.
- A focus ring on an element past the first 25 Tab stops.
- Text spacing inside a shadow root: the overrides are a page stylesheet.
- What a forced-colours user can do with a control, beyond seeing its edge.
- A shell of the window's height that hides its overflow (`h-screen overflow-hidden`) with a menu
  longer than the window: links wholly below its edge read as a closed panel, so nothing is reported
  although no scroll reaches them.
- Under `html { overflow-x: hidden }`, a row of links is reported once, for the link that straddles
  the edge, not for those wholly past it.
- A decorative image wider than the window counts as a two-dimensional part and is not reported
  (Understanding Reflow would have it fit the window).
- A layout table with two or more columns and no header cell counts as a data table.

What the network cut does not stop, or the result does not report:

- Writes while the page loads, before the cut: the page's own and a popup's, by any method, a GET
  that writes, and an auth refresh (with refresh-token rotation, each of the four runs sends the same
  token again). They reach the server, as in the scored phase.
- `tried` counts only what the context's route sees: a live page's, popup's, frame's or dedicated
  worker's request that is not GET, HEAD or OPTIONS. It does not count a GET, a leaving document's
  write, a SharedWorker's request, a `fetchLater`, a WebSocket message, or a `fetch` from a popup
  opened empty (`window.open("")`), which hangs under any context route (measured, Playwright
  1.64.1) and so is never sent. The cut stops all of them; the report does not name them.
- A page that changes after the 1.2 s settle that follows the cut (a poll that fails later, a sign-out
  after a failed refresh) changes during the check, and `changedWhenCut` does not say so. The compare
  allows one control to differ, so a change of one button alone is not named; a page whose text moves
  by itself (a carousel) may be named although the cut did not change it.
- A route change by the hash alone is not followed, so a check on a hash-routed app that switches
  screens during it reports the other screen under this route.
- A page that tries to start a WebRTC connection is "not checked" only when the document that tried
  is still open as the run reads it (before the cut and after the check); an attempt in a frame
  since removed or a popup since closed fails the same way and sends nothing, but the run is not
  told, so it is reported as checked.
- Fenced frames were not measured: a page here cannot make one (`new FencedFrameConfig(url)` is an
  illegal constructor in this Chromium, review 7), so an ad slot that writes from one is not tested.
- Prerender was not measured beyond the fetch: a speculation-rules prerender fetches its page, and its
  script sent nothing before or after the cut (review 7), so a prerendered next screen that writes is
  not tested.
- HTTP/2 inside the proxy's tunnel was not run: https was measured over HTTP/1.1 only (the test server
  offered no h2). The cut destroys a tunnel whole either way, but a connection multiplexed inside one
  was not measured.
- Name lookups (DNS) after the cut were not observed: review 7's page that looks up names that do not
  resolve sent nothing to the server, and what a lookup itself sends was not measured.
- A page whose network never stays quiet for 500 ms (measured: a request every 100 ms from the load
  on; also a page that starts a SharedWorker, as said above) is not checked: it fails the run.
  `settle` waits for the network to go idle with no limit of its own (Playwright Test's navigation
  timeout is 0), so each scored test runs out its 120 s; Playwright then closes the page, and the
  entry is written as unreachable (`page.waitForTimeout: Target page, context or browser has been
  closed`), listed among the entries "the QA account could not open" (measured, review 8: the
  account's access is fine, the page never went quiet), and scores 0; the run exits with the scored
  phase's failure, and the extended test, finding the entry unreachable, returns without checking
  anything.
- A project whose pages load only through a proxy of its own: the run's context connects directly
  through the kit's proxy, so its pages do not load as the scored phase saw them.
- Measured on Playwright 1.64.1's Chromium over http and ws, and over https and wss with a
  self-signed certificate (review 7), on loopback. WebTransport was measured only as "no QUIC packet
  left the browser".

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
