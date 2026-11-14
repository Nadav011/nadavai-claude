# Build plan · <App> redesign into the real app

Status: DRAFT

(The line above is a token the tools and `next` read: `Status: DRAFT` until Nadav approves the finished plan, then
`Status: OWNER-APPROVED answer <N> commit <sha>`, written by the parent session only. The review record goes here:
reviewed <date>, review <n> APPROVE, every later edit diff-confirmed, second model <Grok / Codex / Antigravity / fresh Opus>.)
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
- Before starting a unit, re-read «An app is built once» in the installed skill (nadav-design
  `shared/built-once.md`, in full): it changes as projects report faults.
- Unit 1 is the preview on invented data, isolated and checked as nadav-design `shared/built-once.md`, «An app is
  built once», point 5, says. Nobody plays the preview, on any machine, before its check script passes there. No unit
  builds a screen a second time.
- A screen the demo drew keeps every control and state on its phones at the tag, one it did not draw every control,
  state and role variant of its INVENTORY.md row, unless a numbered answer removes it (`screen` steps 1 and 8b).
- Units land as «An app is built once», point 2, says; a long branch is named here with its reason.
- For a standalone demo that predates that section, what the token and component units take from the tag and what
  reaches users when: nadav-design `shared/standalone-demo-to-app.md`.
- One unit per branch and PR; the order below; shared components before screens.
- What needs Nadav's go before it runs (migrations, auth, payments, store publishing, paid services) is marked `go`.

## Units
State is `todo` until the build session marks it `done <sha>`; the `next` gap scan counts the rows not `done`.

| Unit | What | Files | Demo | Acceptance | Size | Depends | Go | State |
|---|---|---|---|---|---|---|---|---|
| U-1 | The app's preview on invented data, isolated and checked as `shared/built-once.md`, «An app is built once», point 5, says | `…` | — (the main journey of STORY.md plays in it) | the preview's check script passes (points 4 and 5), each proof shown failing on its planted case first, and is a step of the landing CI; after it passes, Nadav plays the journey | from the fake backend's surface (auth, data API, functions, storage, realtime the app uses); often the largest unit | — | `go` when it needs a host, a DNS record or any cost | todo |
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
