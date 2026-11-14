# nadav-design · shared rules (every mode reads this before its first step)

## Tempo

Declared in the first step of every mode that runs steps (all but `next`, which starts nothing) and written in
the run log (`.omc/design-runs/<mode>-<date>.md`, or the output repo's `RUN-LOG.md` in `redesign`):

- `close-first`: a live app with real customers.
- `flow`: a new project, a site, a demo.

Tempo follows the app, not the artifact: a redesign demo or a new screen of a live app with real customers is
`close-first`. When the project does not make it obvious, ask once with AskUserQuestion; until he answers, and
whenever you cannot ask (a subagent, a Workflow agent), it is `close-first`.

Two words, used below:
- A **checkpoint** is the end of a mode step, of a screen or of a round. It always comes before any push,
  landing, ticked checkbox or STATUS line.
- **Final** means pushed, landed, ticked, or written to the STATUS line.

Under `flow`:
- Evidence is logged and work continues.
- A question that blocks nothing is batched to the next checkpoint.
- The visual change gate collects its before and after pairs into one sheet per checkpoint (Nadav approved
  this on 2026-11-10). The sheet carries every visual change of the checkpoint with its before and after. Cases 1
  and 2 of the gate (`SKILL.md`) are committed after screen step 8b and listed there so he can reverse them; only a
  case 3 change waits for his keep, change or revert on the sheet, and only what depends on that answer stays
  local and does not become final before it [I]. This covers setup's per-step commits and the commit of screen
  step 8b.
- A failure stops only the part that failed.
- "Ask before starting another screen" does not apply.

Under `close-first` every rule of SKILL.md and of the mode files stays as written.

## Track

Declared with the tempo in the first step, and written in the same run log. The track follows the page being
built, not the repo: Camstore's home is `site`, its shop and checkout are `app`.

- `app` (the default): a product people operate. SKILL.md and the mode files as written.
- `site`: a site that presents (a portfolio, a marketing or landing site, a showcase with a scroll film or 3D,
  the home of a store). Read `tracks/site.md` before the first step. Its table says which app rules change, and
  its order of work replaces the design steps of `screen` for the presenting pages; `setup`, the DoD, the visual
  change gate and `ship` stay.
- `client-demo`: a site or an app built to win or brief a client, with invented content. Read
  `tracks/client-demo.md` before the first step.

When the request does not make the track obvious, ask in the same AskUserQuestion as the tempo.

**A reference from Nadav**, in any track and any mode ("like this", a link, a video, a screenshot, another app):
read `shared/reference.md` first. The first deliverable is `REFERENCE.md`, the first row is built and shown
before anything else is built, and no alternative concept is offered unless he asks for one.

## An app is built once

The demo of an app becomes the app. The page is not code: the app's build of a screen is its only build, and nothing
is rebuilt after it to match the page. Nadav asked for this rule (11.11.2026) [N]; point 5 holds his global gates
(`floor`); points 1 to 4 and 6, and point 5's properties and proofs, are the choice of the session that wrote it [I].
1. **A standalone page for the direction only.** Outside the app's code, only for the first direction round, one
   round unless Nadav asks for another: the main journey as one playable flow, never isolated screens.
2. **After the plan is approved, the demo lives in the app.** Direction approved and tagged, build plan, his approval
   of it, then the build session, preview first. Approval of the direction never starts work in an app repo.
3. **Approved means a frozen, tagged commit.** Any design change after it is made in the app's preview, never in the
   standalone page; from then on that page is read-only reference.
4. **The preview comes first.** Demo code and invented data never reach the build real users get (web, OTA or store).
5. **The preview cannot reach anything real.** It runs on invented data only, from a fake backend in the app repo (a
   staging or test backend is not invented data). Nobody plays the preview, on any machine, before its check script
   passes there (on a local tree, the parts «What runs when» names); until then only the build session runs it, and
   only to run the checks. While he plays, the served tree does not change: an edit is a new tree, and he plays it
   only after its check passes on it. He opens the shell, never the app's port, always in a browser, never inside a
   native shell (store, OTA or live-reload dev build). Until the check script passes, the preview listens on loopback
   only. He plays it at that machine (a device reaching the same process over the LAN or Tailscale counts, the policy
   naming its origin); anywhere else only on one of his own domains, never a claude.ai artifact; a host or a DNS
   record that costs nothing is set up without asking and named in the report with how to undo it, any cost is asked
   at that moment (the money gate), and removing an existing DNS record is his [I]; never on the app's production
   hosting, the production domain, a subdomain of it, or a host inside a production cookie's `Domain=` scope; and
   before the link is shared, the whole check script except the no-demo check runs against the deployed URL and
   passes.
6. **Behaviour logic is written once** [I]: plain functions with no browser, framework or demo import, never under
   the demo folder. Before he plays a preview simulating it, its logic has a test running the cases exhaustively, or
   over every combination up to a size the test states, with a mutant per asserted property failing it.

Not covered: track `site`, track `client-demo` with no app behind it, SportChat v4's running build. MediZen's
standalone demo, older than the rule, is exempt from point 1's one-round limit. A fault in this rule or its tools
stops that step and is reported («Where a fault goes»). **The full rule is `shared/built-once.md`.** Read it in full
before `redesign` step 8 and its plan review, each unit of the build session, setup step 10b, `screen` in an app that
has a preview, `shared/standalone-demo-to-app.md` work, and any mode or agent that starts, opens, screenshots, shows,
hosts or shares the app's preview or sends its address to anyone. Unsure whether work touches the preview: read it.
Where the two differ, the full rule holds.

## Looking at screenshots

Measure first (DOM or ARIA snapshot, computed styles, console, a pixel-diff number) and look at images for the
visual judgement only. Read several images in one turn (parallel Read calls) or as one contact sheet, and never
re-read an image already in context. Why: 12.7K image reads in 14 days became about 8.7K separate requests, 6.3K
of them carrying a single image (2026-11-07).

- Numbers: `ui-check <url> [--width 375,1440] [--theme light,dark] [--json]` (overflow either side, off-screen
  and clipped controls, overlaps and fixed-bar cover, touch targets, viewport meta, console, axe, RTL
  `text-align:left`; exit 1 means findings).
- A competitor's or a reference's colours, type and spacing: `dembrandt <url> --json-only` (keep `colors`,
  `typography`, `spacing`, `borderRadius`, `shadows`, `components`; skip `favicons`).
- Text in a screenshot: `tesseract <img> - -l heb+eng`.

## His words

The understanding check is `rules/working-style.md`, "Requests"; it is not restated here. What this skill adds:

- Before the first design step, read `GLOSSARY.md` at the project root, `~/nadavai/guides/glossary.md` and
  `REJECTED.md` at the project root, each when it exists.
- The two or three readings shown to Nadav are things he can see: a crop of his own earlier approved work, a small
  rendered sample, or a reference link with the exact part marked. Never prose alone.
- A look or a choice he rejects is appended to `REJECTED.md` with his words and the date (in `redesign`, at the
  output repo's root, because that mode never writes into the app repo). Nothing listed there is proposed again.

## The experience standard

- Before a screen is planned, built, changed or audited, read `standard/experience.md` and
  `standard/profiles.md` (next to this folder). Their rules are not restated here, in SKILL.md or in a mode file.
- `standard/rejected.md` seeds a new project's `REJECTED.md`.
- `standard/examples.md` lists work Nadav approved in his own words, as examples to start from, never as the bar
  (`standard/rejected.md`, "Another product as the bar").
- `plan`, `screen`, `audit` and `ship` end their report with how many of the standard's rules were checked only
  by `reviewer` or by `none` on the screens they covered.

## Where checks run

- **Landing** (a non-draft PR into main): only `lint:ui` and `node e2e/dod/routes.mjs --check`, where the repo's
  `.woodpecker/*.yml` wired them. A landing gets no secrets. No landing runs the DoD or Lighthouse today; a
  path-scoped DoD gate on the landing is decided and lands in a later step.
- **Nightly** (omarchy, repo `Nadav011/nadavai-nightly`, checked out at `~/Projects/nadavai-nightly`): runs the
  repo's own `.github/workflows/ui.yml` on main through `act`: the DoD, and Lighthouse where that repo's nightly
  runs it (`sc-ui` runs none; `gr-ui` audits the commit production serves). That file is the nightly's input, not
  a GitHub gate: `bin/audit` stops without it, and its DoD score gate line (template: `DoD score must be 100`) is
  the only thing that turns the nightly red. It posts `nadavai-ui` as a report. Its keys (`DOD_USER`,
  `DOD_PASSWORD`, `ARGOS_TOKEN`) live in `~/nightly/secrets/<repo>.env` on omarchy and are added by the CI
  session. Read it with `ssh omarchy /home/nadav/nightly/bin/ci-summary <repo>`; its reports and uploaded
  artifacts are in `/home/nadav/nightly/logs/<repo>-<sha7>-ui-reports/` on omarchy.
- **`audit` and `ship`** take the scores from the nightly when it covers the tree they measure (main's head for
  `audit`, the release sha for `ship`). The screenshots later steps read (`reports/dod/screens/<slug>__...png`)
  come from the nightly's `dod-report` artifact unzipped into `reports/dod/` when it holds them, otherwise from
  `heavy-slot -- PM dod` locally. Lighthouse comes from the nightly when it ran it on that tree, otherwise from
  `heavy-slot -- PM exec lhci autorun` locally. A local full run waits for an idle machine (the quality bar's
  load rule).
- **`ship` pre-flight**: a green landing of the release sha (`ci-wait <repo> <sha>`) and the last nightly
  `nadavai-ui` on main green. A red nightly blocks `ship`.
- **The CI step** (a Setup artifact and part of "setup done") is present when the repo's `.woodpecker/*.yml` has
  a `lint:ui` or DoD step (a bare `routes.mjs --check` is not a DoD step), or when `.github/workflows/ui.yml` has
  the DoD score gate line and the nightly checkout has a `*-ui.yml` for the repo. A nightly workflow names its repo
  by its command `bin/audit <key>-ui`, and `bin/audit` maps `<key>` to the repo (`REPO=([tf]=therapy-flow-v2
  ...)`); match on that, not on the file name. On a machine with no nightly checkout, `ui.yml` with the score line
  counts, and the report says first that the nightly registration could not be verified there. With neither,
  setup is incomplete.
- **Setup step 14(b)** copies `~/nadavai/templates/ci/ui.yml` to `.github/workflows/ui.yml` as the nightly's input
  (written for pnpm 10: on npm, yarn or bun replace the setup action and every `pnpm` command with `PM`; merge
  into an existing one; keep `dod` as its own job so the `dod-report` artifact uploads), then verifies the
  landing step and the repo's nightly workflow. Those belong to the CI session: each one missing becomes a
  written request to it (what to add, the `PM` commands, the keys), an open item that session owns.

## Platform

`shared/platform.md`: what each `PLATFORM` (`capacitor-bundled`, `capacitor-remote`, `pwa`, `expo`) changes in the
design steps, which skill owns each Capacitor topic, and the native form of every gate on the Expo app. Read it in
setup step 1, and again before any step that touches a shell, a device or a release.
