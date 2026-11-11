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
  this on 2026-11-10). A commit that carries a visual change stays local and is listed on that sheet until he
  answers keep, change or revert; nothing in it becomes final before his answer. This covers setup's per-step
  commits and the commit of screen step 8b.
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

The demo of an app becomes the app: its screens are never built a second time to look like a demo. Nadav named
the double build as a problem that keeps coming back and asked for a rule against it in his rules and in this
skill: «שזה יהיה בחוקים של שלנו גם של הסקיל שלא יהי את הפידחות האלה יותר» (11.11.2026) [N]. He left what the
rule says to the session that wrote it, so the four points below are its choice [I].

Why: every second build opens gaps. SportChat v4: 39 of 183 findings were visible differences between the demo and
the built app, found by hand. MediZen: the standalone demo (`~/design-redesign/tf2-r12/proto/v2.html`, about 10,000
lines) is in round 13 and still changing, its spec took 8+ commits in one day, and its build is planned at 27 to 54
weeks, so the demo and the app drift apart. shifts: four look rounds on standalone pages of two or three isolated
screens failed («לא יודע כבר»); the look is now applied to the whole demo that lives inside the app. And he
understands a demo only when it plays like the real app (`standard/rejected.md`, "A catalog of screens and states as
the demo").

For an app (a product with screens people work in):
1. **A standalone page for the direction only.** A page outside the app's code is allowed for one thing: the first
   direction round (the look and the direction), and only one round. It is already the main journey as one playable
   flow, never isolated screens. Why: the shifts rounds on isolated screens failed, and every later round on a page
   of its own is work the app never gets.
2. **After the direction, the demo lives in the app.** Once Nadav approved the direction, the demo is built in the
   app's own code, from its real components, on invented data (a preview or demo mode of the app), and that is what
   he is shown and plays with. Going live is replacing the invented data source with the real one, not a second
   build of the screens. Why: what he approves is then the code that ships, so there is nothing to drift. Examples:
   shifts' `src/demo/` (mock data, the app's own shadcn components); therapy-flow's `pnpm dev:salon`
   (`scripts/salon-preview.ts`, the real app on a synthetic in-process backend).
3. **Approved means a frozen, tagged commit.** The approved demo is a git tag in its repo, and the build plan names
   the tag. Any design change after it is made in the app's preview, never in the standalone page; from then on that
   page is read-only reference, and a parity check compares the app to the tag. Why: a page that keeps changing under
   a plan built from it (MediZen) leaves the build aiming at a moving target; a tag is the one version both sides read.
4. **The preview comes first.** The preview on invented data is the first unit of a build, not a later one. Demo code
   and invented data never reach the build real users get, and a check proves it (shifts' `pnpm verify:no-demo` is
   the example). Why: the screens are designed inside the preview, so it exists before them; and invented people in
   the production build would be shown to real customers.

Who builds the preview: in a new app, setup step 10b; in an app that is redesigned, the build session, as unit 1 of
the plan (`redesign/README.md`, step 8), because mode `redesign` never writes into the app repo.

Not covered by this rule:
- Track `site`, and track `client-demo` when no app stands behind it: the page is the product, or no app exists.
- An app in the middle of a build that started from a standalone demo (SportChat v4): it finishes as planned, with
  its parity and capability checks. Its plan is not rewritten to this order.
- An existing standalone demo that is not approved yet (MediZen's): it is finished on its own page and frozen
  (tagged) at approval, not converted into the app; its build then starts with the preview (point 4).

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
