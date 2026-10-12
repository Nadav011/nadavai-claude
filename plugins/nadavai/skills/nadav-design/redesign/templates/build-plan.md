# Build plan · <App> redesign into the real app

Status: DRAFT

(The line above is a token the tools and `next` read: `Status: DRAFT` until Nadav approves the finished plan, then
`Status: OWNER-APPROVED answer <N> commit <sha>`, written by the parent session only. The review record goes here:
reviewed <date>, review <n> APPROVE, every later edit diff-confirmed, second model <Codex / Grok / fresh Opus>.)
**Nadav has decided everything this plan builds on:** DECISIONS-ANSWERED.md 1–<n>. No product question is open inside
the plan; a reading the plan had to make where an answer was silent is named in «Readings» below.
Change log: `plan/HISTORY.md` (a record, not a rule). Reviews: `plan/reviews/`.

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
- The demo is the target; the app's existing behaviour, strings, routes and data code stay unless a unit changes them.
- One unit per branch and PR; the order below; shared components before screens.
- What needs Nadav's go before it runs (migrations, auth, payments, store publishing, paid services) is marked `go`.

## Units
State is `todo` until the build session marks it `done <sha>`; the `next` gap scan counts the rows not `done`.

| Unit | What | Files | Demo | Acceptance | Size | Depends | Go | State |
|---|---|---|---|---|---|---|---|---|
| U-1 | Tokens and shared components | `…` | `s-home` «אחרי · …» | | M | — | no | todo |
| U-2 | <screen> | `…` | `s-<id>` «אחרי · …» and the N «מצב ·» labels | | S | U-1 | no | todo |

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
