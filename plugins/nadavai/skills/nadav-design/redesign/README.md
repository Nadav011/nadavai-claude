# nadav-design · mode `redesign` · the full procedure

A whole-app redesign, demo first. The mode produces, in an output folder of its own: a design language Nadav
approved, an inventory of every screen and state of today's app, a demo with «היום» and «אחרי» columns for every
screen and every state, the decisions (asked, answered, numbered), the proposed features, a history Nadav can go back
through, and a build plan whose citations of the demo are machine-checked, reviewed until approved, cross-checked by a
second model, and handed to a build session with a START-BUILD prompt.

**It never writes into the app repo**, not even `.omc/`: the app is read and its dev server is run, nothing more.
Everything this mode produces lives in the output repo: the run log (`RUN-LOG.md`, the checklist with one evidence line
per step), every debt (DECISIONS-OPEN.md, the plan, BRIEF.md) and the plan's state. The build happens later, in a
separate session started from START-BUILD.md once Nadav approved the plan, and every screen it builds passes the
`screen` mode's gates (DoD 100, the visual change gate) against the demo's phones.

**Owner decisions stop the work.** A choice only Nadav can make is asked when it comes up (AskUserQuestion, recommendation
first) and nothing that depends on it is built before his answer is recorded. In a workflow, where an agent cannot
ask, the lane leaves that part as it is and returns it as a `need` (`decision` or `visual`); the round's gate stays
closed and the parent asks him as soon as the run returns. **The demo is the visual change gate of this mode:** the app
does not change, and every round ends with CHANGES-<date>.md (before and after for every change) that Nadav goes over
and answers keep, change or revert before the next round starts.

Generalized from the SporChat v4 redesign (22.9–11.10.2026: 28 screens, about 1,000 phones, 60 answers, 214 plan
units). The lessons of that run are written into the steps below with their reasons; «Operating lessons» collects them.

## What is in this folder

| Path | What it is |
|---|---|
| `tools/build.py` | Assembles the demo from `redesign.json`: one self-contained page (local fonts embedded), screen switcher, theme tokens, icons, today's shots, tab bar, lint rules. Fails on a missing section or placeholder, an icon reference with no symbol, a tab-bar item with no screen, a remote font. `python3 tools/build.py --config redesign.json [out/<lane>.html]` |
| `tools/publish-prep.py` | Moves every inline image out of the page into `pub/a/`; fails when the page is still over the 16 MB artifact limit. `python3 tools/publish-prep.py --config redesign.json` |
| `tools/shoot.mjs` | Screenshots every section and every phone screenful by screenful; reports console errors, failed and blocked requests (only local files load), document overflow, text or media cut by a clipping box, and (at `--width 320`) clipped text; `shot` lists the screens covered, `machine` the load it ran under; `advisory` leads (text under 4.5:1 on a solid background, controls under 44px) for a verifier to confirm or dismiss; `labels.json` maps phone numbers to column labels. Exit 0 only when the problem lists are empty. `node tools/shoot.mjs --config redesign.json [--dir work/shots/<theme>] --theme dark|light [--width 320] [--in pub/index.html] [ids]` |
| `tools/today-from-dod.py` | «היום» source 1: copies a DoD shot only when its dod.json entry is 2xx, reachable, not redirected and painted (and, with files, newer than their last commit); lists the rest for INVENTORY.md. `python3 -I tools/today-from-dod.py --config redesign.json --dod <app>/reports/dod/dod.json --app <app> home=/:src/app/page.tsx book=/book:src/app/book/page.tsx` |
| `tools/capture-today.mjs` | Full-page shots of today's app for the «היום» columns, from a local server (or an owner-approved deployed site, signed out). Service workers blocked, WebSockets fenced like every request; every route proves it is the intended screen (`expect`, `reject`); first-visit overlays dismissed (`local_storage`); the page walked (bounded: an infinite feed ends, reported as "truncated") so lazy images load. A failed screen moves its old shot to `today/.stale/`. `node tools/capture-today.mjs --config redesign.json` |
| `tools/inventory-scan.py` | Every route of a Next app router app with its loading/error/not-found boundaries, state signals and a control count (grep-level leads); `--controls <route>` lists one route's controls with file:line. `python3 -I tools/inventory-scan.py <app> [--controls /book]` |
| `tools/icons-from-lucide.mjs` | Writes the app's own lucide icons (from its lucide-react install) as SVG files into `icons/`. `node tools/icons-from-lucide.mjs <app>/node_modules/lucide-react icons calendar chevron-left=back` |
| `tools/contrast.py` | WCAG ratios of palette pairs for BRIEF.md, before any phone exists. `python3 tools/contrast.py '#eef1f4/#111418'` |
| `tools/check-anchors.py` | Every demo label the plan cites exists inside a column label of its section; every stated count matches; every cited screen exists; unit ids in the demo exist in the plan; missing sections or plan are errors. `(cd <out> && python3 tools/check-anchors.py --config redesign.json [--plan file])` |
| `tools/decisions-open.py` | Counts the open rows of DECISIONS-OPEN.md (every row whose «מצב» is not exactly «הוכרע · תשובה N»); the round-close checkpoint runs it and the owner gate needs it at 0. `python3 tools/decisions-open.py DECISIONS-OPEN.md` |
| `tools/journal-state.py` | Reads a Workflow run's journal: finished and unfinished agents, the models they ran on, and whether resuming would re-run finished work; «unknown» (exit 3) on a malformed journal or missing model data. `python3 tools/journal-state.py <run-dir> work/state/wf.json` |
| `tools/dry-run-workflow.mjs` | Runs a workflow script with mocked agents: a pure-literal `meta`, phase titles, `model: 'opus'` on every call, args size in bytes, and any exception, inside `parallel()` too. `node tools/dry-run-workflow.mjs workflows/demo-round.js args.json [--empty]` |
| `tests/run.mjs` | The regression tests of all of the above (one per failure mode a review found). `PLAYWRIGHT_MODULE=… node tests/run.mjs` |
| `templates/` | `redesign.json`, `parts/` (the shared base: page, phone, component skeleton), `section.html`, `BRIEF.md`, `INVENTORY.md`, `STORY.md`, `DECISIONS-OPEN.md`, `DECISIONS-ANSWERED.md`, `FEATURES-PROPOSED.md`, `CHANGES.md`, `build-plan.md`, `START-BUILD.md`, `gitignore` |
| `workflows/demo-round.js` | One demo round for the Workflow tool: spec → (first build: shared components) → lanes → requests ×2 → rebuild → one full fresh verify → fix → targeted confirms (≤3, every finding id accounted for) → CHANGES and round state. Also the first build (`mode: 'build'`) and every continuation (`startAt`). |
| `workflows/plan-review.js` | The plan: write → fresh reviews to APPROVE → a diff-only confirm after every later edit → second model → START-BUILD and checklist. Returns reviewer gates; Nadav's approval is asked afterwards. |
| `examples/mini/` | A two-screen fixture that every tool runs on (see its README). Rerun it after changing a tool. |

Tools need Python 3 and Node; Playwright comes from the app's own install (`--pw`, `$PLAYWRIGHT_MODULE` or the
config's `"playwright"`), never installed globally: `<app>/node_modules/playwright/index.mjs` with npm;
`<app>/node_modules/@playwright/test/index.mjs` or `<app>/node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs`
with pnpm. **Network:** the demo loads only local files (fonts are local files
embedded by build.py), and capture-today reaches only the base origin and the origins the config lists; anything
else is blocked and fails the run. Every origin that is not local needs Nadav's recorded approval (`today.approvals`),
and a deployed site is only ever captured signed out (README step 2, source 4). Copy `tools/` into the output folder at step 0, so the folder builds on its own on any machine;
a tool fixed mid-run is ported back here in `retro`.

## The output folder

Default `~/design-redesign/<app>/`, **outside the app repo** and outside `/tmp` (tmpfs: a reboot on 27.9.2026 wiped a
night of logs, worktrees and shots). Its own git repo with a checkpoint commit after every phase.

```
redesign.json  BRIEF.md  INVENTORY.md  STORY.md  DECISIONS-OPEN.md  DECISIONS-ANSWERED.md  FEATURES-PROPOSED.md
CHANGES-<date>.md  START-BUILD.md  RUN-LOG.md (the mode's checklist, one evidence line per step)
state/<round>/ (each round's open findings, rejections, plan items, needs and work gates: committed, read by a
continuation and by the plan session)
ORCHESTRATION-LOG.md (what ran, what broke, what was decided; the session's memory)  fonts/ (local font files)
parts/ (shared lane)  sections/<id>.html  css/<id>.css (one lane each)  icons/  assets/  today/ (inputs, committed)
changelog/<id>.md  history/<id>/<round>-<nonce>-<tag>/{pre,after}/ (per run: a retry never overwrites the real "before")
plan/build-plan.md  plan/HISTORY.md  plan/reviews/  plan/START-BUILD-CHECKLIST.md
tools/ (copied at step 0)  tools/local/ (this run's own helper scripts: committed, because INVENTORY.md and BRIEF.md
cite them and work/ is lost on a fresh clone)  work/ (scratch, state, shots: gitignored)  out/ (lane builds)  pub/
```

## Column labels: the contract between the demo and the plan

| Label | Meaning | Rule |
|---|---|---|
| `היום · <route>` | today's app, a screenshot | never edited |
| `אחרי · <state>` | the new design | the main phones of a screen |
| `מצב · <state>` | one state of the screen (empty, loading, error, offline, permission, the screen's own) | one phone per state INVENTORY.md lists; a component's variants may share phones, with INVENTORY.md «Component variants» naming the phone that shows each one (the words verifier checks it) |
| `חדש · מאושר · <title>` | a feature Nadav approved that does not exist today | as finished as any phone |
| `מוצע · <DD.MM> · אחרי הליבה · <title>` | a proposal for after the core | dashed frame (`.col.proposal`), and under the phone `<p class="col-note">אחרי הליבה · נכנס לתוכנית ב־<date> · <unit></p>` |

The plan cites labels verbatim (`` `s-home` «אחרי · הריצות הקרובות» ``), so **a label is never renamed or removed
once the plan exists**: a changed design gets a new label, and `check-anchors.py` proves the citations after every edit.
Route text and Latin inside a label sit in `<bdi dir="ltr">`.

## Demo rules (every target phone)

- Looks like a shipped premium native app in dark, in light and at 320px. Real copy in the app's language, plausible
  real data on ONE timeline (dates, names, numbers agree on every screen).
- RTL-first, logical properties only; numbers and Latin in `dir="ltr"` islands; contrast 4.5:1 (3:1 large); 44px targets;
  nothing under the tab bar or home indicator; no internal notes, ids or approval pills inside a phone.
- Shared components live once, in `parts/00-head.html`, and look identical everywhere; a screen's own CSS goes in
  `css/<id>.css` with a screen prefix (`.home-`, `.pf-`).
- Nothing today's screen has disappears unless an answer removes it ("בלי למחוק דברים"): INVENTORY.md is the checklist.
- Every state of every screen is designed. Icons are one set (`icons/`), the app's own, never emoji: lucide-react apps
  through `tools/icons-from-lucide.mjs`, lucide-static apps by copying its `icons/<name>.svg`, others from the app's
  own SVG sources.
- The design language is BRIEF.md's, from the app's own character. Never another app's look, never the generic
  Impeccable look, and never `/impeccable craft`, `bolder`, `overdrive` or `delight`.

## Scale (step 0 decides it)

| App | Fix lane | Verify group | First build | Rounds |
|---|---|---|---|---|
| up to 8 screens | 2 screens | 4 screens | subagents one by one | usually 1 round + confirms |
| 9–20 screens | 3–4 | 6–7 | a workflow, or subagents in batches of 3 | 1–2 rounds |
| over 20 | 4 | 7 | a workflow | as many as Nadav's answers need |

One browser at a time on this laptop, whatever the size (`shooters: 1`, the default; see «Operating lessons»). Raise
it only on a machine with measured memory headroom.

## The steps

Each step ends with its evidence shown to Nadav (Hard rules of SKILL.md); questions are asked when they come up.
Chat in plain Hebrew, short lines, the why before the what; code, files and commits in English.

### 0. Preconditions and scale
- Pin today's app: which checkout is "today" (one with a clean tree, on the commit the team ships; fetch first when
  the project's CLAUDE.md says so), and record `git -C <app> rev-parse HEAD`, `git -C <app> status --short` and
  `git -C <app> ls-remote origin main` in RUN-LOG.md and at the top of INVENTORY.md. Many worktrees and a stale main
  checkout make "the app" ambiguous otherwise.
- Never run the app in its own checkout: a dev server or a build writes caches, lockfiles and env files. Run it from a
  throwaway worktree (`git -C <app> worktree add <scratch> <sha>`, removed afterwards) or a copy, and record
  `git -C <app> status --short` before and after in RUN-LOG.md; any difference stops the run until it is explained.
- Read the app: routes (Next `find app -name page.tsx`, Vite the router), layouts, shared components, loading/error
  files, guards and roles, DESIGN.md and PRODUCT.md when they exist, who the users are. Count screens and states.
- Size the run with «Scale». Create the output folder: `git init`, copy `tools/`, `templates/parts/` to `parts/`,
  `templates/gitignore` to `.gitignore`, `templates/redesign.json` and fill it (screens, phone size, theme tokens,
  nav, local fonts, playwright path, `today`), start RUN-LOG.md, then the first commit:
  `git -C <out> add -A && git -C <out> commit -m "chore(redesign): start <app>"`.
- Evidence: the screen and state counts, the sizing, `git -C <out> log -1`.

### 1. Design language (BRIEF.md)
- From the app's own character: its users, its moment of use, its existing brand, DESIGN.md/PRODUCT.md when they exist
  (say what is kept and what changes). Colour roles with measured contrast, type ladder, shape and space, the shared
  components one per job, motion, voice. The tokens go into `redesign.json`.
- Show two or three phones of the main screen built in it (dark and light) so Nadav judges a look, not a document.
  Build path at this step (no `today/` yet): `sections/<main>.html` from the template with only «אחרי» columns,
  `screens` holding just that screen, and every other tab-bar item `"screen": null` (drawn, inert); the «היום»
  column and the other screens come at step 3. `tools/build.py`, then `tools/shoot.mjs` (its `advisory.contrast`
  checks the palette in place).
- Fonts: the app's own, as local files (a font the app already uses is not a new font). With `next/font`, take the
  `.woff2` files from `.next/static/media/` of a build and read family and weight from the `@font-face` rules in
  `.next/static/css/*.css`; or the matching `@fontsource/<family>` package's files; or the files in the app's
  `public/`. Copy them into `fonts/` and list them in `fonts`.
- When the app has no live light theme, ask Nadav: designed but off, or dark only (BRIEF.md «Light theme»).
- Nadav approves with AskUserQuestion (recommendation first, 2–4 concrete options). The approval line goes into BRIEF.md.
- Evidence: the approved BRIEF.md and the phones.

### 2. Inventory
- INVENTORY.md: every screen, its route, every state (empty, loading, error, offline, permission, role variants,
  the screen's own), every control today, the data shown. STORY.md: the main user journey for the STORY verifier.
- Inventory helper: `python3 -I tools/inventory-scan.py <app>` gives every route with its boundaries, state signals
  and a control count (grep-level leads, said so in the file). The per-control list of a screen is written when the
  screen enters a lane (`--controls <route>`), not up front for every route.
- **Today's look, in this order; the first source that works wins, per screen:**
  1. The project's DoD shots, through `tools/today-from-dod.py` only: it reads the checkout pinned at step 0's
     `reports/dod/dod.json` and copies a shot only when its entry is 2xx, reachable, not redirected (also in the older
     `redirected`/`landed` format), painted (`reached: true`; an older DoD without the field is rejected until
     `e2e/dod` is updated from the template), and newer than the last commit of the route files it is given
     (`--app` and the files are required). The DoD writes a shot even for a route it
     could not open, and it does not block service workers, so then Read every accepted PNG and record in INVENTORY.md
     that the route's `expect` text is visible in it; a shot that does not show it is deleted and the screen falls
     through to source 2, like every route the tool rejected.
  2. `tools/capture-today.mjs` against the app's local dev server (run from the throwaway worktree of step 0), with a
     QA session for screens behind a login (storage state outside the repo; the app's API origin in `allow_origins`,
     approved like any non-local origin).
  3. The same against a local production build of that worktree, run with a safe environment (no secrets it does not
     need).
  4. A deployed site, only with Nadav's approval: ask him (AskUserQuestion), record his answer in
     DECISIONS-ANSWERED.md with the site's host in the row, and add `today.approvals: {"<origin>": "answer N"}`; the
     tool checks that row N exists and names the host. Signed-out public pages only: no `storage_state` and no
     `local_storage` (either can carry a session), read-only (the tool only navigates).
  5. None: the screen goes into `today_missing` ({name: reason}), its column reads «היום · לא צולם · <reason>», build.py
     draws a placeholder, and INVENTORY.md «Screens that could not be captured» says which sources were tried. The
     «אחרי» phones of that screen are drawn from reading the code.
- Every capture route carries `expect` (text only the intended screen shows) and the config lists the app's known
  wrong-page texts in `reject` (its offline page, its error boundary): a service worker or a redirect can otherwise
  hand back the wrong screen with status 200. `local_storage` dismisses first-visit overlays; the tool walks the page
  so lazy images load; a full-page shot paints fixed elements once, so use `"full": false` where that misleads.
- A capture that fails moves the old shot to `today/.stale/`, so the build reports it missing instead of embedding a
  picture of the wrong screen. A shot is evidence only of the run that wrote it.
- Evidence: the file, the counts, `ls today/`.

### 3. Demo
- One `sections/<id>.html` per screen from `templates/section.html`: «היום», «אחרי», a «מצב» phone per state,
  approved new features, proposals. Build with `tools/build.py`, shoot dark, light and 320 in both themes with
  `tools/shoot.mjs`, Read every phone at every scroll position, iterate until every report is clean.
- First the shared components BRIEF.md names go into `parts/00-head.html` (replacing the template's skeleton), proven
  with one test phone each; only then the screens, built from those components. STORY.md must exist before the
  first verify: without it the journey is unchecked and the demo gate stays closed.
- Large apps: `workflows/demo-round.js` with `mode: 'build'` (Workflow only when Nadav opted in; otherwise the same
  roles as subagents one at a time: the shared owner first, then the lanes).
- Publish a first look (step 10's rules) so Nadav can react early.
- Evidence: the build line (`missing [] leftover []`), the clean report.json files, the link.

### 4. Questions
- Every open decision is a row in DECISIONS-OPEN.md (options, recommendation first, the source phone). Ask them in
  AskUserQuestion batches of up to 4, recommendation first, as soon as they come up (a round's `needs` the moment
  the run returns). A question the code, BRIEF.md or an earlier answer already settles is not asked again: its row is
  answered with the reference (that answer's number) and stays «פתוח» until it is applied by the next spec start. No
  row is ever closed by hand. Nothing that depends on an open decision is built before the answer is recorded.
- Answers go to DECISIONS-ANSWERED.md, numbered, in Nadav's words, and are never re-decided. Precedence everywhere:
  the newest answer, then DECISIONS-ANSWERED.md, then the plan, then the notes in the sections.
- Evidence: the numbered answers.

### 5. New features
- A feature that does not exist today is never slipped into an unmarked «אחרי» phone, not even an approved one:
  approved, it gets its own «חדש · מאושר · …» phone (also when it extends an existing screen).
  Proposed for after the core: «מוצע · <date> · אחרי הליבה · <title>» with the note under the phone. Both rows in
  FEATURES-PROPOSED.md; what is decided against goes to its «לא נבנה» table so no session builds it by mistake.
- Every row reaches the plan (a unit, an after-the-core unit, or «Not built»).

### 6. Rounds
- A round applies Nadav's new answers and fixes, then verifies. Fix lanes own their screens' files only; a change
  to another lane's file is a request, applied in two passes; the shared lane alone edits `parts/`.
- Verify with FRESH Opus agents that made none of the fixes, read-only, by lenses: (a) craft, native feel, flows,
  states, accessibility; (b) words, RTL, data consistency, completeness against INVENTORY, answers, features and the
  plan; (c) STORY: the main journey across screens. Verifiers get the list of rejected findings so they do not
  re-report them without new evidence.
- **The gate** (SporChat rounds 24–26: five full sweeps of a large demo found 7, 2, 4, 4, 8 P1 and never reached zero,
  because a fresh sweep of a big surface always finds something new): ONE full fresh sweep; fix everything it found;
  then targeted confirms of exactly those findings, at most 3. Every finding carries an id, and each confirm must
  account for every id it was given, exactly once, as confirmed (with proof) or still open; an id it does not return
  stays open. Confirms also report regressions the fixes caused. What the last confirm still reports is handed over,
  never fixed unverified. A finding whose fix belongs in the plan goes to the plan track. A missing verifier means
  nobody looked: the round's "0 left" would be false, so it stops. Verifiers and confirms read the shots and open no
  browser; lanes shoot one at a time.
- **Nadav's answers are never rejected.** Every item the spec makes from an answer carries its number in `source`; a
  lane may reject other items (with the item id and a reason) but never one with a source: a conflict comes back as
  a `need` for him. A rejected item that carried a source closes `answersApplied`, and CHANGES-<date>.md lists every
  rejection with its reason.
- **Green means all of it:** the spec applied, no answer rejected, every lane and the shared owner returned, no request left unhandled,
  no owner decision open, the STORY walked, the rebuild clean in all five passes (dark, light, 320 dark, 320 light,
  pub) over every screen with check-anchors passing whenever a plan exists, every finding confirmed, and the round
  state saved. `demoNoBlocking` allows P2 polish to stay open; `demoClean` allows nothing. Plan-track findings go to
  the plan and do not hold the demo gate.
- **Owner decisions have one authority: DECISIONS-OPEN.md.** A row stays «פתוח» until a run applies its answer: that
  run's close agent marks «הוכרע · תשובה N» every «פתוח» row answer N settles (the question its «מאיפה השאלה» names,
  and any row that names answer N). An answer counts as applied only when every part of it reached an agent that
  finished it: an item of it that a lane rejected or never returned, a request or need it caused, leaves it open.
  `ownerQueueEmpty` needs the close agent's count AND `tools/decisions-open.py`'s count (run by the round-close
  checkpoint; every row whose «מצב» is not exactly «הוכרע · תשובה N» is open, a row closed in any other words
  included) to be 0, in every run, never inherited. Answers are applied, never closed by hand: they go into
  `args.spec` and the run starts at `spec` (or the next round opens with them). An answer that changes nothing (keep,
  already settled) still becomes one spec item, «no change: <why>», so the run that records it closes its row.
- **A continuation is never green by default:** a run that starts later (`startAt`: `rebuild`, `verify` or `confirm`)
  takes the gates of the phases it skips from the earlier run's `state/<round>/work-gates.json`, passed as
  `priorGates` with `continues: <its nonce>`; a file of another round or another run counts for nothing, and without
  it those gates stay false. A continuation takes no `args.spec`, `args.items` or `args.shared` (they go in by starting
  at `spec`) and cannot start at `lanes`. A spec start without `args.spec` passes the round's latest
  `state/<round>/work-gates.json` as `priorGates` (or `noSpec: true` for a round that has no answers at all), and is
  refused when that run left specApplied, answersApplied, lanesComplete or requestsHandled false. Every run has a
  fresh `nonce`.
- **Then Nadav reviews the round:** CHANGES-<date>.md screen by screen, keep, change or revert, in AskUserQuestion
  batches; his answers are numbered in DECISIONS-ANSWERED.md and feed the next round. Every change or revert answer
  also gets a «פתוח» row in DECISIONS-OPEN.md (source: CHANGES-<date>.md), so the round cannot go green before a spec
  start applies it.
- With the Workflow tool (only when Nadav opted into multi-agent orchestration): `workflows/demo-round.js`, see
  «Running a round». Otherwise the same roles as subagents (`model: 'opus'`), one at a time.
- Evidence: the round's `gates` and `confirms` (structured fields), the rebuild's clean reports.

### 7. History (so Nadav can go back to anything he liked)
- Before a section is edited: `history/<id>/<round>-<nonce>-<tag>/pre/` gets `<id>.html` and `<id>.css` (only when that
  folder does not exist yet). After: the shots of
  the changed phones in `…/after/`. One dated line per change in `changelog/<id>.md` («r3 · 11.10 · …», plain Hebrew).
- At the end of a round: `CHANGES-<date>.md` from the template, plain Hebrew, grouped by screen, before and after paths.
  Going back = copy `pre/` into `sections/` and `css/`, rebuild.

### 8. Build plan
- `plan/build-plan.md` from the template: units in build order, each citing the demo states it builds by column
  label, acceptance, size, dependencies, `go` where Nadav must approve (migrations, auth, payments, store publishing,
  paid services). Every answer and every feature row lands somewhere. `tools/check-anchors.py`: 0 missing, 0 wrong.
- Review: a fresh Opus reviewer, read-only, until APPROVE; after an APPROVE, the fix round is checked by a DIFF-ONLY
  confirm against a snapshot (on 2.10.2026 full reviews after an APPROVE kept breeding new findings for 10 rounds).
  Fix by simplifying, never by adding machinery.
- Second model: `omc ask codex` on the config default (gpt-6.1-sol at xhigh; never pass `-m` or an effort flag);
  when Codex cannot run, `omc ask grok`; when neither runs, a fresh Opus with a clean context. Never skipped, never the
  author's own review. Its findings are fixed and diff-confirmed. Approval by any reviewer means APPROVE with nothing
  HIGH or MEDIUM left, whatever the verdict word.
- Every edit after an APPROVE (LOW polish, the second model's fixes, START-BUILD itself) is followed by a diff-only
  confirm, at most 3 per chain; approval holds only when the last step is a confirm that says APPROVE, so no edit is
  left unchecked. A rejection with nothing to fix still blocks.
- Then START-BUILD.md (the paste prompt, its line `Status: DRAFT`) and `plan/START-BUILD-CHECKLIST.md` (every item a command
  with its expected result, the plan checks run from the output repo) from the template. `workflows/plan-review.js`
  runs all of it and returns `reviewApproved` and `readyForOwner`, never Nadav's approval.
- **Nadav approves the finished plan** (reviewers approving is not him approving): show him the plan in plain Hebrew
  (what gets built, in what order, what only he does, the readings the plan made) and every second-model finding with
  what was done with it (the workflow result's `second.findings[i].done` and `second.findings[i].note`: changed, or
  rejected and why),
  then AskUserQuestion approve or change. Record the answer in DECISIONS-ANSWERED.md with the output repo's commit,
  replace the line `Status: DRAFT` in the plan and in START-BUILD.md with exactly
  `Status: OWNER-APPROVED answer <N> commit <sha>`, commit. Only then is the handoff ready; `next` reads that token.
- Evidence: the verdicts, which second model ran, check-anchors output, Nadav's numbered answer.

### 9. Partners (optional, only when Nadav asks)
A partner prototype and a guide site for people outside the team. Not templated: it is a project of its own. The
SporChat example is `~/sporchat-design-backup-2026-09-22/scratchpad/v4/partner/`, `partner-site/` and `guide/`
(proposal phones never enter the prototype; a fact on a partner page is checked against the app's main branch;
contact addresses masked until they work; published only on Nadav's own domain).

### 10. Ship
- Commit the output repo. Publish the demo: `tools/publish-prep.py`, prove `pub/index.html` with `tools/shoot.mjs --in
  pub/index.html` (no failed request), then a claude.ai artifact (copy `pub/` into the session scratchpad; the tool
  refuses roots outside it; say which account the link lives in) or Nadav's own domain. **Never a `*.vercel.app` link.**
- Report in plain Hebrew with the links, the gates, what is open and what only Nadav does next. Then end like every
  mode, from the output repo: the ticked checklist in `<out>/RUN-LOG.md` (never in the app repo), the gap scan, and
  `הבא: …`.

## Running a round with the Workflow tool

1. Prepare the inputs as FILES in the output repo: new answers (`answers/r3.md`), per-lane items
   (`work/items/r3-<lane>.json`, FINDING shape, ids unique in the round such as `I-r3-4`), the earlier rejections.
   Args carry only paths and small values, and for every item file its `sources`: `{"<item id>": "answer N"}` for each
   item that carries Nadav's answer, so a lane that rejects one is caught even when it does not echo the source. The
   gate depends on it: an answer item missing from `sources` is invisible to `answersApplied`.
2. Write the args (see the header of `workflows/demo-round.js`; `themes: ["dark"]` for a dark-only app), then dry-run:
   `node tools/dry-run-workflow.mjs workflows/demo-round.js args.json` and again with `--empty`. Exit 0 before launching.
3. Launch: `Workflow({ scriptPath: '<skill>/redesign/workflows/demo-round.js', args })`. Log the run id in
   ORCHESTRATION-LOG.md.
4. Read the result's `gates` (step 6 «Green means all of it» lists them): `demoNoBlocking` is the bar for showing
   the demo as done; `demoClean` also has no P2. The full open list (with ids), the rejections, the plan items and
   the owner needs are in `state/<round>/` (committed; the close agent appends to it, never truncates).
5. The round's `needs` go to Nadav at once (step 4), then CHANGES-<date>.md for keep/change/revert, before the next
   round; `state/<round>/plan.json` feeds `workflows/plan-review.js` as `planItems`.

**When a run is cut** (usage limit, reboot, login expiry): run `tools/journal-state.py <run-dir>`. If it says resume
is safe, resume with the same script and args. If it says do NOT resume: a run cut before «Changes» wrote no
`work-gates.json` of its own, so never pass an earlier run's file in its place. Put the cut run's needs (from the
extracted state) into DECISIONS-OPEN.md and to Nadav before the restart, then restart at `spec` WITH the cut run's
`args.spec` (and item files) again and the round's latest `state/<round>/work-gates.json` as `priorGates`: the lanes
re-check every item, so finished work is a no-op, and nothing the cut run never applied goes missing. Only a run that reached «Changes» can be continued with
`startAt` (`rebuild`, `verify` or `confirm`, the last with `confirm: [{lane, file, findings: [{id, section, severity}]}]`),
`priorGates` from its `state/<round>/work-gates.json` and `continues: <its nonce>`. Check the `models` line after any
resume.

## Operating lessons (each with its why)

- **Every `agent()` passes `model: 'opus'`.** After a usage-limit resume on 29.9.2026 the agents silently ran on a
  smaller model; it was found only in their meta files. `journal-state.py` prints the models; the dry run enforces it.
- **Large data travels in files, never in workflow args.** Args over about 57 KB fail. The scripts take paths.
- **One browser at a time; memory is the gate, load only advises.** With swap full, earlyoom killed headless Chrome
  and agents' Bash calls hung for hours (25–26.9.2026). Before shooting: with less than 2 GB available or swap over
  80% used, wait (check every minute, at most 10 minutes), then stop and report. A 1-minute load above twice the CPU
  count is waited out for at most 10 minutes, then the shoot runs anyway with one browser and the load is recorded
  (`report.json` "machine"): on 12.10.2026 another workflow held the load at 42–76 for over 20 minutes with 18–22 GB
  free, and a wait with no bound never ends. One shooting agent at a time (`shooters: 1`); every prompt carries the
  MACHINE RULES.
- **Checkpoint commits of the output repo after every phase.** SporChat lived through two machine restarts and three
  usage cuts; what was committed survived.
- **Resume replays cached agents only up to the first agent whose first attempt failed.** Everything after it runs
  live again (on 6.10.2026 a resume restarted about 40 finished agents). Check with `journal-state.py`; when it says
  do NOT resume, restart at `spec` with the extracted state as item files («When a run is cut»). Only a run that
  reached «Changes» is continued with `startAt` (`rebuild`, `verify` or `confirm`).
- **A fresh reviewer is never the author, and the author never approves its own work.** Verifiers and confirms are
  read-only agents that made none of the fixes; the plan's second model is another model or a clean-context Opus.
- **Gates are computed from structured fields, never by grepping prose.** A ship was blocked on 7.10.2026 because a
  report's own table contained the word "failed". Every gate in the workflows reads a schema field.
- **A missing verifier is not a pass.** On 30.9.2026 a run reported a clean demo because every verifier of the last
  cycles had failed and "0 left" meant nobody looked.
- **Bounded confirms, not endless sweeps.** See step 6.
- **Diff-only confirm after an APPROVE.** See step 8.
- **Port 8900 (or whatever server Nadav keeps open) is his.** Never use or stop a server you did not start.
- **No network beyond the app's local dev server.** The demo is local files only and capture-today is fenced to the
  dev server plus the listed origins; a blocked request fails the run instead of quietly loading from production.
- **Owner decisions are never built in advance.** A workflow lane returns a `need` and leaves the part alone; a
  pre-built "recommended" option turns into a decision Nadav never made.
- **Plain Hebrew to Nadav, ADHD format:** short lines, one idea per line, the why first, no English jargon;
  AskUserQuestion with a recommendation for every decision. Code, files and commits in English.

## redesign.json

| Field | Meaning |
|---|---|
| `title`, `lede` | the page title and the masthead (`{{TITLE}}`, `{{LEDE}}`); `title_html` replaces the masthead title when a Latin brand needs its `<bdi>` |
| `lang`, `dir` | the page's language and direction (`he`, `rtl`) |
| `output` | the shared demo file (`demo.html`); lanes build to `out/<lane>.html` |
| `phone` | `width`, `height` (CSS px of the screen) and `frame` (px); become `--phone-w`, `--phone-h`, `--frame` |
| `playwright` | absolute path of the app's `node_modules/playwright/index.mjs` |
| `dirs` | `parts`, `sections`, `css`, `assets`, `icons`, `today`, relative to the config |
| `fonts` | local font files `[{family, file, weight, style}]` embedded by build.py (no URLs; no new font without asking Nadav) |
| `tokens` | theme-independent custom properties: `font`, radii, `safe-b`, `nav-h` |
| `theme` | `default` and the `dark` / `light` token sets the base CSS uses (`page*`, `bg`, `surface*`, `hair`, `ink*`, `accent*`, `ok`, `warn*`, `danger`, `focus`) |
| `screens` | `[{id, tab}]` in demo order; `sections/<id>.html` carries `id="s-<id>"` |
| `nav` | the tab bar: `items: [{id, label, icon, screen}]` in order from the start edge (`screen: null` = drawn but inert); `{{NAV:<id>}}`, `{{NAV:<id>:unread-<other>}}` |
| `labels` | the label words check-anchors treats as citations (`today`, `after`, `new`, `state`, `proposal`) |
| `plan`, `anchors` | the plan path; `unit_id` regex, `id_sources`, `retired`, `split`, `stop` for check-anchors |
| `today` | `base_url`, `routes: [{name, path, expect, expect_selector, wait, full}]`, `reject`, `local_storage`, `allow_origins`, `approvals` (`{"<origin>": "answer N"}` for every non-local origin; row N of DECISIONS-ANSWERED.md must name the host), `storage_state` (local only), `theme`, `scale` for capture-today |
| `today_missing` | `{name: reason}` for screens no source could capture (step 2, source 5) |
| `publish_limit_mb` | the page size publish-prep fails above (default 16) |
| `sr_only` | classes the clipped-text check skips |
| `lint` | `[{name, pattern, hint}]` regexes counted per section at build time (not fatal) |
