# Research protocol (stage 2)

Merged from MediZen `research/rea/` and `~/social/research/PROTOCOL.md` (2026-10-30 to 2026-11-07).

## One folder per tool
`research/<tool>/` holds:
- `REPORT.md`
- `ROW.md`, its row in the comparison table
- `SCORES.json`
- `shots/NN-name.png`
- `evidence/`, sanitized
- `REA-LOG.md`, with the questions asked and the evidence for each

A subagent cannot write a file named `REPORT.md` or `ROW.md`, because the harness refuses report files. It returns the text, and the orchestrator saves it by script (`tools/extract-*.mjs`).

## The same briefs everywhere
- Write 2-4 fixed task briefs per category before the first tool, and run the same text in every tool. MediZen's were core clinic flows: booking, the record, a receipt, a reminder. Social's were a feed post, a story and a reel for one test brand.
- Use only test assets and an invented test scenario. Never use client data.
- For each brief, record the exact steps, the minutes to a usable result, how many regenerations, the credits or money spent, and the first and final outputs.

## Scoring rubric
Score 0-5 on fixed axes, with one evidence path per score. Pick the axes per category before the first tool and keep them. Examples: Hebrew and RTL accuracy, speed to a result, density and clarity, states and errors, help and onboarding, mobile, and the honesty of claims. `COMPARISON.md` is the score table.

## Depth and coverage
`COVERAGE.md` says, per tool, what was seen live, what came from shipped files, and what is blocked, with the reason.

The depth levels, in order:
1. the public surface
2. the page's network and scripts
3. inside a logged-in account, observing only
4. behind a paywall: static REA of the JS chunks, the UI copy files, the route lists and the help center

A tool is not "studied" until its depth row is filled.

## Accounts and trials
- `research/ACCOUNTS.md` lists every account opened: the identity, the date and its state.
- `research/TRIALS-TO-CANCEL.md` lists every trial: the plan, the charge if it is not cancelled, the date, the cancel rule, the cancel time and the proof shot. The orchestrating session checks every row before the day ends.
- **Card trials.** Cancel first, before any use. Some vendors end access when you cancel; in that case the rule cannot hold, so ask Nadav before you open the trial. Any card screen stops the agent: money is asked every time (`acting-on-behalf.md`).
- **Sign-ups and logins** follow `acting-on-behalf.md`: agent-browser with the vault, never a typed password. A CAPTCHA, an SMS code or a phone check goes to Nadav.

## REA
- Load `nadavai:reverse-engineer-anything`.
- Never run `analyze_web_bundle` on a live React app, because it ran out of memory on 2026-10-30. Download the scripts with Playwright into a scratch folder, analyze that folder, then delete it.
- Record HARs into scratch. Strip cookies, auth headers and login bodies. Keep only a sanitized summary.
- Every conclusion separates observation, inference and unknown, and cites an evidence id or a path.
- Observe only:
  - do not replay a private API
  - do not extract prompts or templates to copy them
  - do not touch other users' data
- A "read-only" REA can still write: an "open door" click created an empty record in production. Note every accidental write, and delete it only with the owner's yes.

## Browsers
- Claude in Chrome is for reading Nadav's own sessions, such as his trial accounts and his mail for a code. Run only one agent in it at a time, because two agents break the shared tab group and leave orphan tabs.
- Run agent-browser and Playwright with one browser per lane, closed when done, through `heavy-slot`, with `ignoreDefaultArgs: ['--disable-dev-shm-usage']`.
- Email codes: only the mailbox the task names. Verify the account in the page title before you search. Never iterate through accounts.

## Sources
- `[V]` the vendor page was opened. `[3P]` a third party. `[S]` a search snippet only, not opened. Each tag carries a URL and a date. A claim without a path or a URL is not evidence.
- When a research MCP goes inactive mid-run (Bright Data "Customer is not active"), fall back to official pages and tag the source type. Never fill the gap from memory.

## Law and tax
- One file per country: the laws and regulators that touch the product, such as privacy, consumer protection, tax documents, accessibility, spam and health claims.
- The questions for counsel and for the CPA collect into ONE package each: `plan/COUNSEL-PACKAGE.md` and `plan/CPA-PACKAGE.md`. Each item gives its spec block and the interim decision it runs on until the answer comes.
