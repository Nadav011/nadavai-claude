# Build plan · <App> redesign into the real app

Status: DRAFT

(The line above is a token the tools and `next` read: `Status: DRAFT` until Nadav approves the finished plan, then
`Status: OWNER-APPROVED answer <N> commit <sha>`, written by the parent session only. The review record goes here:
reviewed <date>, review <n> APPROVE, every later edit diff-confirmed, second model <Codex / Grok / fresh Opus>.)
**Nadav has decided everything the drawn screens of this plan build on:** DECISIONS-ANSWERED.md 1–<n>. No product
question about them is open inside the plan; a reading the plan had to make where an answer was silent is named in
«Readings» below. Screens the demo did not draw are designed during the build, in the app's preview: their questions
are asked there (START-BUILD rule 3), and their units' sizes include that design time.
Change log: `plan/HISTORY.md` (a record, not a rule). Reviews: `plan/reviews/`.
**Approved demo:** tag `demo-approved-<date>` (commit `<sha>`, answer <N>). The page at that tag is read-only reference;
any design change after it is made in the app's preview (`shared/rules.md` of nadav-design, «An app is built once»).

> **לנדב, בקצרה:** מה התוכנית בונה, בכמה שלבים, מה כבר מוכן, ומה רק אתה עושה (שלוש עד שש שורות).

## How to read a unit
- **Demo:** the states the unit builds, cited as `s-<screen>` «<column label>», copied verbatim from the demo
  section. `(cd <out> && python3 tools/check-anchors.py --config redesign.json)` proves every citation (0 missing),
  every stated count (0 wrong) and every cited screen; it runs after every edit to this file and is item 1 of the
  START-BUILD checklist.
- Count forms the checker reads: `the N «אחרי ·» labels`, `the N «מצב ·» labels from «A» to «B»`,
  `the N labels from «A» to «B»`, `the N «P» labels up to «X»`, `N × «P»`.
- A unit is done when its acceptance passes, its screens pass the `screen` mode's gates (DoD 100, the visual change
  gate against the demo), and a reviewer who is not its author approves it.

## Rules for the build session
- The demo at the tag is the target for the screens it drew; every other screen and state is designed in the app's
  preview from BRIEF.md and the shared components. The app's existing behaviour, strings, routes and data code stay
  unless a unit changes them.
- Unit 1 is the preview on invented data, isolated from everything real, with its check script (nadav-design
  `shared/rules.md`, «An app is built once», point 5), which every later unit runs too. Nobody plays the preview, on
  any machine, localhost included, before that script passes. No unit builds a screen a second time.
- A screen the demo drew keeps every control and state on its phones at the tag unless a numbered answer removes
  it; the `screen` step 8b verifier checks it against those phones (the weaker check: the parity tool is not on
  main), and a control or state missing without an answer stops the unit.
- A screen the demo did not draw keeps every control, state and role variant of its INVENTORY.md row unless a
  numbered answer removes it; a control missing without one stops the unit and goes to Nadav. A reviewer checks this
  against the row (the capability diff tool is not in this skill on main yet).
- Each unit lands by its own PR into main, so the landing CI and the preview's check script run on it. In an app
  with live users, the redesigned screens land behind a flag that is off for users, or reachable only through the
  preview's route, until the cut-over unit, so nothing reaches customers unit by unit. A long branch instead is
  named here with its reason, the checks each unit runs locally, and the landing CI on the cut-over PR.
- One unit per branch and PR; the order below; shared components before screens.
- What needs Nadav's go before it runs (migrations, auth, payments, store publishing, paid services) is marked `go`.

## Units
State is `todo` until the build session marks it `done <sha>`; the `next` gap scan counts the rows not `done`.

| Unit | What | Files | Demo | Acceptance | Size | Depends | Go | State |
|---|---|---|---|---|---|---|---|---|
| U-1 | The app's preview on invented data, isolated as point 5 lists: no `.env*` file or inherited variable read by its build or server, only the start script's variables, real hosts → `.invalid`; network fenced to its own origin in the browser and on the server; sends, charges, scheduled jobs, webhooks, analytics and real sign-in off | `…` | — (the main journey of STORY.md plays in it) | the preview's check script, a step of the landing CI: (a) no demo code or invented data in the build users get (web; OTA bundle and each store build on Capacitor or Expo, run where point 4 says), (b) the resolved server and client-bundle environment on the preview's allowlist, (c) a planted call to a live host from browser code and one from server code both blocked, (d) each provider's key absent and host blocked, listed per item; each check fails on its planted case, then passes clean. Nobody plays the preview, on any machine, localhost included, before the script passes; after it passes, Nadav plays the journey | M | — | `go` when it needs a host, a DNS record or any cost | todo |
| U-2 | Tokens and shared components | `…` | `s-home` «אחרי · …» | | M | U-1 | no | todo |
| U-3 | <screen the demo drew> | `…` | `s-<id>` «אחרי · …» and the N «מצב ·» labels | every control and state on the cited phones at the tag is in the preview, or a numbered answer removes it (`screen` step 8b verifier, the phones at the tag beside the preview shots) | S | U-2 | no | todo |
| U-4 | <screen the demo did not draw> | `…` | — (INVENTORY.md «<screen>»; designed in the preview) | every control, state and role variant of its INVENTORY.md row is in the preview, or has a numbered answer that removes it | S (with design time) | U-2 | no | todo |
| U-5 | Cut-over (an app with live users): the long branch or the flag goes live | `…` | — | every unit before it `done`; Nadav's go | S | U-1…U-4 | `go` | todo |

## After the core (from FEATURES-PROPOSED.md)
| Unit | Proposal | Demo | Answer | Size |
|---|---|---|---|---|

## Not built
| What | Why | Answer |
|---|---|---|

## Readings
Where an answer was silent and the plan had to choose: the choice and why, so approving the plan approves it knowingly.

## מה רק נדב עושה
| # | פעולה | למה רק הוא | מתי |
|---|---|---|---|

## Round 1 changes
(Change logs from here down are not checked by check-anchors: they quote old labels on purpose.)
