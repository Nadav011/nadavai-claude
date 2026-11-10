# nadav-design · shared rules (every mode reads this before its first step)

## Tempo

Declared in the first step of a run and written in the run log (`.omc/design-runs/<mode>-<date>.md`, or the
output repo's `RUN-LOG.md` in `redesign`):

- `close-first`: a live app with real customers. Nothing is built until every decision is closed, and nothing is
  shown as final while anything is open.
- `flow`: a new project, a site, a demo.

When the project does not make it obvious, ask once with AskUserQuestion.

Under `flow`:
- Evidence is logged and work continues.
- A question that blocks nothing is batched to the next checkpoint.
- The visual change gate collects its before and after pairs into one sheet per checkpoint, and nothing is
  committed as final without Nadav's keep, change or revert (he approved this on 2026-11-10).
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

## Where checks run

- **Landing** (a non-draft PR into main): only `lint:ui` and `node e2e/dod/routes.mjs --check`, where the repo's
  `.woodpecker/*.yml` wired them. A landing gets no secrets. No landing runs the DoD or Lighthouse today; a
  path-scoped DoD gate on the landing is decided and lands in a later step.
- **Nightly** (omarchy, repo `Nadav011/nadavai-nightly`, checked out at `~/Projects/nadavai-nightly`): the full DoD
  and Lighthouse on main, from the repo's own `ui.yml` (template `~/nadavai/templates/ci/ui.yml`) run through act.
  It posts `nadavai-ui` as a report. Its keys (`DOD_USER`, `DOD_PASSWORD`, `ARGOS_TOKEN`) live in
  `~/nightly/secrets/<repo>.env` on omarchy and are added by the CI session. Read it with
  `ssh omarchy /home/nadav/nightly/bin/ci-summary <repo>`; its reports are in
  `/home/nadav/nightly/logs/<repo>-<sha7>-ui-reports/` on omarchy.
- **`audit` and `ship`** read the nightly result when it covers the tree they measure (main's head for `audit`, the
  release sha for `ship`). A full DoD or `lhci` run that is still local goes through `heavy-slot --`, on an idle
  machine (the quality bar's load rule).
- **`ship` pre-flight**: a green landing of the release sha (`ci-wait <repo> <sha>`) and the last nightly
  `nadavai-ui` on main green. A red nightly blocks `ship`.
- **The CI step** (a Setup artifact and part of "setup done"): a DoD or `lint:ui` step in the repo's own
  `.woodpecker/*.yml`, or a `*-ui.yml` workflow for the repo in the nightly repo's `.woodpecker/`. A nightly
  workflow names its repo by its command `bin/audit <key>-ui`, and `bin/audit` maps `<key>` to the repo
  (`REPO=([tf]=therapy-flow-v2 ...)`); match on that, not on the file name. CI files belong to the CI session:
  setup copies none, and a missing half becomes a written request to the CI session (what to add, the `PM`
  commands, the keys), an open item that session owns.

## Platform

`PLATFORM` is recorded in setup step 1: `capacitor-bundled`, `capacitor-remote` (`capacitor.config.*` sets
`server.url`), `pwa` or `expo`; the desktop browser is always a target too. Store, OTA and install rules belong to
`rules/store-apps.md` and the `nadavai:store-apps` skill.

- iOS and Android are judged separately. A platform gets a manifest and an install offer only while it has no
  public store listing; once it has one, installed-PWA users get the move notice. The desktop browser's own install
  stays.
- Capacitor: load `nadavai:store-apps` (its `references/native-bar.md` and checklists) with
  `capacitor-app-development` and `capacitor-plugins`. `ship` checks the app installed from the public listing and
  the OTA status as store-apps defines.
- Expo: the DOM-based gates (DoD, Lighthouse, `ui-check`) do not apply to a native screen; the app's own
  `apps/native/AGENTS.md` and scripts hold its checks. The full Expo profile lands in a later step.
