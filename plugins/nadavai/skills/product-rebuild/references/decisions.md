# Decisions (stage 4)

## Files
- `DECISIONS-OPEN.md`: the question bank. Each row has an id, a question, options, a recommendation and its state (`פתוח` or `נענה #N`).
- `DECISIONS-ANSWERED.md`: append-only rows `| N | date | id: question | answer |`. The newest number wins over every older decision and over any spec text.
  - When an agent decides on Nadav's behalf, the answer says so and names the basis, for example "הוחלט בלי לשאול, לפי #N" or "לפי חוק X §Y".
  - A fact from a peer session, such as the tax session, is recorded with that session as the source.
- `tools/answer.py` appends rows from stdin (`id|date|question|answer`) and marks the bank row answered.
- A decision row that changes an older one names the number it updates ("מעדכן את #492").

## When Nadav says "decide what you are sure of" (MediZen 7.11)
Run `workflows/triage-questions.js` with `args`:
```
{ repo, questions_json, out_dir, groups: [...], owner_quote }
```

**Decide** only on one of these, and name which:
- (a) **decided:** a numbered decision answers it
- (b) **law:** a law or regulator rule forces it; give the section
- (c) **best:** clearly the most advanced and professional option, consistent with Nadav's standing direction, at no cost and with no change to a numbered decision; say why the others are worse

**Ask** whenever any of these holds:
- it is a fact only Nadav knows
- it costs money or sets a price
- it sends anything to a real person
- it narrows or reverses a decision
- it is a taste choice he has not delegated
- the sources conflict
- the agent is unsure

An adversarial verifier then tries to refute every decide. On doubt, the question goes back to ask. In MediZen the verifier demoted 36 of 87.

The remaining asks are grouped into at most 12-15 questions:
- each has a Hebrew title, one plain line, 2-4 full options with the recommended one first, the why, and the ids it answers
- facts go into one free-text question

## The light path (a small run, no workflow)
When there are few questions, the orchestrator may make rulings by evidence on the same three bases. Each ruling is listed for Nadav and confirmed in the next question round. It is not final until he has seen it.

## Asking
- **Format.** AskUserQuestion, up to 4 questions per call. Every field is in Hebrew, and each question stands on its own: Nadav may not see earlier text.
- **Many questions.** Use the questionnaire artifact, with `db` and `user`, rules admin-only, and collections `answers` and `overrides`. Read the answers back with ArtifactData.
- **An answer that is a question back** ("מה זה X?", "מה הכוונה?"): explain in two lines and ask again. It is never treated as an answer.
- **An answer that delegates** ("לפי רשות המיסים"): route it to the right session, record the fact, then record the decision.

## Applying
Run `workflows/apply-decisions.js` with `args`:
```
{ repo, spec_dir, domains: [...], from, to, watch: ["#N: note", ...] }
```
1. One applier per domain changes the blocks each decision touches: states, defaults, wording and tests. It cites the number, removes the matching open question, and fixes any block the decision contradicts.
2. A recount runs.
3. The self-made-change lines come back under "לנדב, בקצרה" and go to Nadav (#422).

Decisions that arrive while a pass is running go into the queue file for the next pass. A running applier never gets them mid-run.
