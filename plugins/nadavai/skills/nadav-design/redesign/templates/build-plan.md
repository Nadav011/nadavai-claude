# Build plan · <App> redesign into the real app

Status: DRAFT

(The line above is a token the tools and `next` read: `Status: DRAFT` until Nadav approves the finished plan, then
`Status: OWNER-APPROVED answer <N> commit <sha>`, written by the parent session only. The review record goes here:
reviewed <date>, review <n> APPROVE, every later edit diff-confirmed, second model <Codex / Grok / fresh Opus>.)
**Nadav has decided everything this plan builds on:** DECISIONS-ANSWERED.md 1–<n>. No product question is open inside
the plan; a reading the plan had to make where an answer was silent is named in «Readings» below.
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
- Unit 1 is the preview on invented data and its no-demo check. No unit builds a screen a second time.
- One unit per branch and PR; the order below; shared components before screens.
- What needs Nadav's go before it runs (migrations, auth, payments, store publishing, paid services) is marked `go`.

## Units
State is `todo` until the build session marks it `done <sha>`; the `next` gap scan counts the rows not `done`.

| Unit | What | Files | Demo | Acceptance | Size | Depends | Go | State |
|---|---|---|---|---|---|---|---|---|
| U-1 | The app's preview on invented data, and the check that keeps demo code and invented data out of the production build | `…` | — (the main journey of STORY.md plays in it) | Nadav plays the journey in it; the check fails on a planted demo import and passes clean | M | — | no | todo |
| U-2 | Tokens and shared components | `…` | `s-home` «אחרי · …» | | M | U-1 | no | todo |
| U-3 | <screen the demo drew> | `…` | `s-<id>` «אחרי · …» and the N «מצב ·» labels | | S | U-2 | no | todo |
| U-4 | <screen the demo did not draw> | `…` | — (INVENTORY.md «<screen>»; designed in the preview) | | S | U-2 | no | todo |

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
