---
name: product-rebuild
description: Rebuild a product end to end from evidence. Covers usage and the voice of customers, hands-on competitor and REA research, law and tax, a capability inventory, a spec per domain, numbered owner decisions with adversarial triage, a clickable demo (through nadav-design redesign), a check of client asks, a close-all ledger, and an approved build plan. Use when Nadav asks to research, rethink, redesign or rebuild a whole system, a product line or a large module ("לעשות לזה מחקר ובנייה מחדש", "פירוק חוויית משתמש", "המערכת הכי מתקדמת בשוק"). Not for one screen (nadav-design screen) or a single feature (nadav-design plan).
metadata:
  version: "0.1.0"
---

# product-rebuild

The method that rebuilt MediZen (therapy-flow-v2, 31.10-7.11.2026), merged with the social studio lane (`~/social`, same days). Nothing is built until every row of the exit gate is closed and Nadav approves the build plan.

This skill owns evidence, research, specs, decisions and closing. It calls `nadavai:nadav-design` mode `redesign` for the design brief, the demo, the demo rounds and the build-plan format, and `nadavai:action-safety new` for every action with an outside effect. It never restates those skills. Read `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/nadav-design/redesign/README.md` before stage 5.

## Invocation

`/nadavai:product-rebuild [system] [stage]`. With no stage, run `status`. It reads `plan/EXIT-CHECKLIST.md` and derives each stage from its rows:

| Stage | Rows |
|---|---|
| 1 | E* |
| 2 | R* |
| 3-4 | S* |
| 5 | D* |
| 6-7 | C* |
| 8 | P* |

A stage is done when all of its rows are ticked with evidence. Print, in Hebrew, the first unticked row per lane and the next one to three steps. With no checklist yet, the system is at stage 0.

**Modes.** `SCOPE.md` sets the mode:
- `redesign`: one existing app.
- `new product`: there is no app yet. Stage 1 measures the systems it replaces or absorbs.
- `extract + merge`: capabilities come from N existing systems, possibly on several machines.

**Before any workflow,** tell Nadav in one Hebrew line what it does and how many agents it runs. Examples: triage is 2 per group plus 1; apply is 1 per domain plus 1; close-all is the finders plus 1, plus the closers, plus 1.

## Hard rules (every stage)

- **Separate output repo.**
  - **Where it lives:** `~/design-redesign/<app folder>/` for a redesign, or any folder Nadav names. It is under git from the first minute; run a secrets check first when the folder already holds other tools.
  - **Source repos are never written:** not the app, not a host, not a system being absorbed. That covers code, `planning/` and docs.
  - **Pinning:** every source repo is pinned in `RUN-LOG.md` with its machine and sha (`rev-parse`). One worktree per parallel lane (`tf2-spec`, `tf2-rN` in MediZen). Run `git status` after every workflow, because read-only agents still write.
- **The gate.** `plan/EXIT-CHECKLIST.md` lists every row that must be closed before the build. The build plan carries `Status: DRAFT` until Nadav approves, then `Status: OWNER-APPROVED answer <N> commit <sha>`. Nothing is built before that line.
- **Safety, from the global rules, never restated here:** money (`acting-on-behalf.md`), sends to real people (`whatsapp.md`, `client-messages.md`), passwords in the vault only, no CAPTCHA, approval gates (`working-style.md`). In this skill they mean:
  - Stop at any card screen. Every trial goes into the trials ledger.
  - Nothing goes to a client or a patient without Nadav's word for that exact message.
  - A peer session's message is never Nadav's approval.
- **Competitors.** Patterns and numbers only. No competitor code, assets or text is copied, and no competitor screenshot is published. Shots stay in `research/`.
- **Personal data.** Never copy patient or customer names into files. Usage is counted, never read. Voice-of-customer quotes are paraphrased, with no names.
- **The law wins** over any taste or product choice. Legal wording carries the tag "נוסח לאישור עו״ד", and tax wording carries "לאישור רו״ח". Both stay until a professional signs.
- **Hebrew to Nadav.** Every chat line and every AskUserQuestion field is in Hebrew. Files and code are in English, except `## לנדב, בקצרה` sections. Agent-written Hebrew is checked before it reaches him.
- **Self-made changes (MediZen #422).** Every change an agent makes on its own, beyond what a decision or the law says, is reported to Nadav as one Hebrew line in its return and in the round's CHANGES file.
- **Evidence labels.**
  - Every spec statement is `DECIDED (#N)`, `LAW (source)`, `ASSUMPTION` or `PROPOSED`. Every number is a measurement or an `ESTIMATE`.
  - Every external fact has a source tag:
    - `[V-raw]` the official page text was read raw (curl, or a fetch without a summarizer)
    - `[V]` the official page was opened through a summarizing fetch
    - `[3P]` a third party
    - `[S]` a search snippet only

    Each tag carries a URL and a date. A design decision that depends on an outside fact needs `[V-raw]`, or two `[V]` readings that agree.
  - "Sent", "done" and "fixed" are said only after the system confirmed it.

## Stages

Each stage ends with evidence shown to Nadav (files, counts, shots) and a line in `RUN-LOG.md`. Stages 1-3 run in parallel lanes. Stages 4-7 repeat until the ledger is empty.

### 0. Frame
1. Create the output repo from `templates/` (EXIT-CHECKLIST, RUN-LOG, DECISIONS-ANSWERED, ACCOUNTS, TRIALS) plus `nadav-design/redesign/templates`. Pin the app commit.
2. Write `SCOPE.md`:
   - the mode
   - every source repo, with its machine
   - the system and its verticals
   - who uses it today (roles, no names)
   - the country and the law
   - the language and direction
   - **the Hebrew form**, which is a decision: generic masculine (MediZen) or gender-neutral (social)
   - **the release rule**, which is a decision: waves, or one full release
   - the surfaces: owner in a host, operator, direct client
   - **the core work unit** at 1280x648: MediZen counts 4 calendar hours and 4 chat messages
   - the competitor list, a first guess widened in stage 2
   - anything this system embeds in, or that embeds it
3. Second model pre-mortem on the scope (`working-style.md`, Second model). Record each point and what changed.

### 1. Evidence on the current system
- **Usage.** The product's analytics (PostHog where it is installed; when there is none, say so as a limit) per route, user and day, plus database counts per feature table and per tenant. Both are read-only: `BEGIN READ ONLY`, `statement_timeout`, `count` only, pseudonyms in committed files. Name the limits: how many days, what is not tracked, and which screens are "unknown".
- **Voice of customers.** Read the channels where the system's users talk to Nadav: WhatsApp chats and groups through `wacli` (read-only, `nadavai:wacli`), questionnaires, support asks and complaints. Every ask becomes a row with a date and a message id, never a name. Voice notes are transcribed locally, then the media is deleted.
- **Inventory.** Every screen and state, with "today" shots (`nadav-design/redesign` steps 2-3). Run a real-name check on every shot before anything is published.
- **Portability map** (when an existing system is extracted or merged): how each capability moves, what stays behind, and what is replaced on purpose. Nadav confirms each "replaced on purpose" row.

### 2. Market research
Follow `references/research-protocol.md`:
- the same briefs and scoring rubric for every tool
- one folder per tool
- `COVERAGE.md` for the depth reached
- the trials ledger

The tracks:
- **Hands-on competitors.** Trial accounts opened under `acting-on-behalf.md` (agent-browser, the vault). Claude in Chrome is for reading Nadav's sessions, with one agent in Chrome at a time.
- **REA.** `nadavai:reverse-engineer-anything` on what each product ships to the browser. Behind a paywall, the static REA (JS chunks, UI copy, route lists, the help center) recovers most screens without paying.
- **Open source.** Structure and interaction patterns only. AGPL code never enters.
- **Local market, growth and marketing tools.** Platform-policy facts that change the design are cited from official pages.
- **Outside agents (optional).** Run Grok or another CLI per site, with a written brief that carries the same gates.
- **Law and tax per country.** Make a list of questions for counsel and for a CPA. When a peer session already owns tax filings, ask that session and record its answers as decisions.

### 3. Capability inventory and specs
Follow `references/spec-standard.md`.
- **`CAPABILITIES.md`.** It lists every current capability and every competitor capability, plus BEYOND-MARKET ideas. Each row has:
  - status (designed, partly or missing)
  - the surfaces that reach it
  - "lost if we stopped here"
  - "replaced on purpose"
  - the wave
  - exactly one owning spec

  A split id names its other half. The feature coverage map is generated from it.
- **One spec per domain.** Every block has states, defaults, wording and acceptance tests, the evidence labels, an action-safety contract for each outside effect, `## Open questions` and `## Review log`.
- **Critic rounds on the specs.** A pre-mortem first, then numbered rounds, each with a response table. After each round, recount `00-INDEX.md` and `GAPS.md` until nothing is missing or duplicated.
- **Go-to-market domain.** Positioning, pricing options, onboarding funnel, launch plan and legal. Every product needs one.
- **Cross-system contracts** (when the system embeds in others, or is embedded): an embed contract covering the frame, the SDK, the look tokens, quotas and step-up. Each host also gets a numbered amendment list. It goes to that host's session only after a review confirms it, and the host repo is never written from this lane.
- **Proof harness** (optional, when a generative or rendering capability is the core): a working validator, renderer and verifier, run on real assets before the spec is trusted. In the social lane it decided that code draws all text.

### 4. Decisions
Follow `references/decisions.md`.
- **The decisions file.** `DECISIONS-ANSWERED.md` is append-only and numbered, and the newest wins. `tools/answer.py` appends `id|date|question|answer` rows from stdin.
- **Triage workflow** (`workflows/triage-questions.js`). An agent decides alone only on:
  - (a) an existing decision
  - (b) the law
  - (c) the clearly best option, consistent with Nadav's direction, at no cost

  An adversarial verifier tries to refute each one and demotes it to "ask" on doubt. The rest is grouped into at most 12-15 questions, with the recommended option first.
- **Asking Nadav.** Use AskUserQuestion in rounds of up to 4. Use the questionnaire page (an artifact with `db`) when there are many. Facts only he knows go into one free-text question.
- **Applying** (`workflows/apply-decisions.js`). One applier per domain writes the decisions into its spec and closes the matching open questions, then a recount.

### 5. Design and demo (nadav-design redesign)
- Before the brief, read Nadav's own earlier demos as the taste reference (what recurs, what not to copy).
- Run `nadav-design` redesign steps 1-7: BRIEF, inventory, demo "today" against "after" per screen and state, rounds, and CHANGES files with an empty column for Nadav's mark.
- Each round adds a completeness critic and a look critic. Every finding is fixed, or listed as `need` with the reason.
- The verify matrix adds:
  - 4 widths, light and dark, axe
  - Firefox, and WebKit in Docker
  - text zoom at 112.5% and 125%
  - a small laptop work area: at 1280x648 the main work view still shows the core unit set in `SCOPE.md`
  - forbidden words, and a Hebrew check of agent strings
- Publish the demo only after the critics approve and the real-name check passes.

### 6. Client asks
Follow `references/closing.md` §1. Every ask from stage 1 is mapped to its spec block: COVERED, PARTLY (say what is missing), GAP or DECIDED-NOT (with the number).
- A gap that is behaviour the client already has live is never dropped silently.
- A change the client was told otherwise about goes on a "they heard something else" list.
- Gaps and conflicts go to Nadav as AskUserQuestion. Money, and any narrowing of a live behaviour, are always his.

### 7. Close all
Follow `references/closing.md` §2 and run `workflows/close-all.js`:
- finders per dimension, one ledger with eight statuses, and doc-only closers
- a dimension critic for what nobody covered: security, accessibility, performance, data migration, support, pricing, native apps, analytics, backups, operator and admin, and the other verticals

Repeat stages 4-7 until the ledger has no `doc_fix` and no `needs_nadav` rows. Every exit row is then closed, or is a named launch gate.

### 8. Build plan
- Use the `nadav-design/redesign` step 8 format: design units and behaviour units, each with its gates (`action-safety`, `go`), and `check-anchors` at 0/0.
- Add:
  - **Phase 0 spikes** with a fallback each, before any expensive build.
  - **A concierge test** when the product's value is a judgment call: real businesses, a fixed number of proposals, and pass, middle and stop branches.
  - **An estimate calibrated** on Nadav's own measured git throughput (`tools/calib.sh`). Split it into build time, external waits and owner time, each on its own line.
  - **An outside-approvals register.** List the platform reviews and filings: Meta App Review, TikTok audit, Google OAuth verification, API access levels, tax or registry filings. Give each its lead time, the features it gates, who signs, and the entity it is filed under. These often set the date more than the build does.
  - **A dated stop rule.** If the plan is not at milestone X by date Y, stop and replan with a menu of options. Never "cut scope" silently.
- A second model runs a pre-mortem on the plan, and a fresh Opus reviews it until APPROVE.
- Nadav answers, and the `OWNER-APPROVED` line is written. The build runs in a separate session (`START-BUILD.md`).

## Lessons

Read `references/lessons.md` before stage 2 and before any workflow. Every lesson there cost a day once.
