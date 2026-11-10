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

Under `close-first` every rule of SKILL.md stays as written.

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
  `standard/profiles.md` (next to this folder). Their rules are not restated here or in SKILL.md.
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

`PLATFORM` is recorded in setup step 1: `capacitor-bundled`, `capacitor-remote` (`capacitor.config.*` sets
`server.url`), `pwa` or `expo`; the desktop browser is always a target too. Store, OTA and install rules belong to
`rules/store-apps.md` and the `nadavai:store-apps` skill.

- iOS and Android are judged separately. A platform gets a manifest and an install offer only while it has no
  public store listing; once it has one, installed-PWA users get the move notice. The desktop browser's own install
  stays.
- Install checks (setup 9b), for a platform still allowed a PWA install: the served manifest's fields (`name`,
  `short_name`, `start_url`, `display`, `lang`, `dir`, 192 and 512 icons with a maskable purpose, theme and
  background colours), HTTPS, a service worker whose fetch handler answers a failed navigation, and Chrome's
  install button on the live URL. Not `lighthouse_audit`: Lighthouse 12 has no PWA category.
- Capacitor: load `nadavai:store-apps` (its `references/shell-checklist.md` and `references/native-bar.md`) with
  `capacitor-app-development` and `capacitor-plugins`. `ship` checks the app installed from the public listing and
  the OTA status as store-apps defines.
- Expo: the DOM-based gates (DoD, Lighthouse, `ui-check`) do not apply to a native screen; the app's own
  `apps/native/AGENTS.md` and scripts hold its checks. The full Expo profile lands in a later step.
