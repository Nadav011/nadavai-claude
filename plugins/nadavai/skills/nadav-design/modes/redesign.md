# nadav-design · mode `redesign`

## Mode `redesign` (the whole app, demo first, no app code)

Part of the nadav-design skill. Before this file read the Hard rules of `SKILL.md`, then `shared/rules.md`
and `shared/platform.md`. Every path here is relative to the skill folder, one level above this file.


Read `redesign/README.md` (next to this file) before step 0 and follow it step by step: it holds the procedure, the tools (`redesign/tools/`), the templates and the workflow scripts. Generalized from the SporChat v4 redesign (22.9–11.10.2026). This mode never writes into the app repo (not even `.omc/`): the demo, the decisions, the debts, the run log and the build plan live in an output repo of its own, and the build session that START-BUILD opens after Nadav approved the plan takes every screen through `screen`'s gates.

0. **Preconditions and scale.** Declare the tempo and the track. Read the app (routes, components, states, DESIGN.md/PRODUCT.md when present, users), count screens, size the run (README «Scale»). Pin the app's commit. Output folder outside the repo and outside `/tmp` (`~/design-redesign/<app>/`), its own git repo, set up as README step 0 lists. Evidence: the app's commit, the counts, the sizing, `git log -1`.
1. **Design language.** BRIEF.md from the app's own character, on DESIGN.md/PRODUCT.md when they exist; never another app's look or the generic Impeccable look, never `craft`/`bolder`/`overdrive`. Nadav approves (AskUserQuestion, recommendation first). Evidence: the approved BRIEF.md and two or three phones in it.
2. **Inventory.** INVENTORY.md (every screen, state and control today), STORY.md (the main journey), today's look from the sources README step 2 lists in order (a screen none can capture is drawn as «היום · לא צולם»). Evidence: the files and `ls today/`.
3. **Demo.** Shared components from BRIEF.md first, then one section per screen: «היום», «אחרי», a «מצב» phone per state; dark, light and 320; RTL-first, real copy, 44px, 4.5:1, local files only. `tools/build.py`, `tools/shoot.mjs`. Evidence: the build line and clean reports.
4. **Questions.** DECISIONS-OPEN.md, asked in AskUserQuestion batches of up to 4, recommendation first; answers numbered in DECISIONS-ANSWERED.md, never re-decided.
5. **New features.** «מוצע · <date> · אחרי הליבה · <title>» phones with the note under the phone, in FEATURES-PROPOSED.md, carried into the plan.
6. **Rounds.** Fix lanes by screen group with cross-lane requests, rebuild, fresh Opus verify by lenses (craft, words and sources, the STORY), ONE full sweep then targeted confirms that account for every finding id (≤3). Green only when all of it holds (README «Green means all of it»). Then Nadav answers keep/change/revert on CHANGES-<date>.md. `redesign/workflows/demo-round.js` only when Nadav opted into multi-agent orchestration; otherwise subagents one by one, with the model `rules/model-routing.md` names for the role. Evidence: the round's `gates` and his answers.
7. **History.** `pre/` before every edit, `after/` shots, a dated changelog line per change, CHANGES-<date>.md in plain Hebrew per round.
8. **Build plan.** Units cite column labels, `tools/check-anchors.py` 0 missing and 0 wrong; fresh Opus review to APPROVE, then a diff-only confirm, then the second model (`rules/working-style.md`, "Second model"; `omc ask codex` on the config default, never `-m`); every later edit diff-confirmed; START-BUILD prompt and checklist (`redesign/workflows/plan-review.js`). Then Nadav approves the finished plan (AskUserQuestion); reviewers approving is not him approving. Evidence: the verdicts, which second model ran, his numbered answer.
9. **Partners** (only when Nadav asks): a partner page and guide; README points to the SporChat example.
10. **Ship.** Commit the output repo, publish the demo (claude.ai artifact or Nadav's own domain, never `*.vercel.app`), report with links, and end like every mode (checklist in the output repo's `RUN-LOG.md`, gap scan, `הבא:`).

README «Operating lessons» gives each rule its why: `model: 'opus'` on every `agent()`; big data in files, never in workflow args; one browser at a time after `uptime`; a checkpoint commit per phase; restart at `spec` from the extracted state (`tools/journal-state.py`) instead of resuming past a failed agent; a reviewer is never the author; gates read structured fields, never prose.
