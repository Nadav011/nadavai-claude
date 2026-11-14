---
name: my-review
description: "ביקורת מלאה על כל הסשן: מה ביקשתי, מה קרה לכל בקשה, מה פוספס או נעצר, דרכים אחרות, והאם סגורים ב-100%. בודקים חדשים קוראים את השיחה עצמה."
argument-hint: "[מתאריך, או על מה להתמקד]"
disable-model-invocation: true
---
# my-review: a full review of this session

Nadav has worked in this session for hours or days, across many tasks, and no longer holds the picture. He wants one answer he can rely on without reading the conversation again: what he asked for, what happened to each request, what was missed, and whether the work is closed.

Your own memory of the session is not a source for this. After a compaction you hold a summary, and a review built on it looks complete while leaving out exactly what the summary dropped. So the review reads the transcript, and reviewers who did not do the work check it.

## 1. Build the sources
- Run `session-digest ${CLAUDE_SESSION_ID} --out <a new folder in your scratchpad>`. It writes, in time order and in parts small enough to read whole: what Nadav typed (U), what he picked in dialogs with the options and any note he typed (A), his commands (C), goal conditions (G), your end-of-turn replies (R), your text before each dialog (Q), and other sessions' messages (X), with a mark wherever the context was compacted.
- If the digest cannot be built (the tool is missing, no transcript matches, it fails), stop and tell Nadav. Do not review from memory.
- Read its `index.md`. The last command it lists has to be this `/nadavai:my-review` call; if it is not, the digest is of another session, and one of the wrong session is worse than none. If the index shows the session starting later than this work did, the earlier part is in another transcript: say so in the first line of the report.
- If Nadav named a window, or the digest has more than 18 parts, run it again with `--since YYYY-MM-DD` so that it fits, and say in the report which days were left out.
- The digest repeats what he typed, so it stays in the scratchpad: do not commit it or send it anywhere.
- List the plan, spec and decision files this session wrote or worked from, and what it built: the repository with its branch or commit range, the deployed address, the documents.

## 2. Two kinds of reviewer, started together
Use `nadavai:reviewer` agents with `model: opus`. Give each one the paths and its question from this section, not your view of how the session went. Each writes its findings to a file you name and returns a short summary. They cost real tokens, so start only these.
- **Conversation reviewer** (one for every 6 parts of the digest, three at most): reads its parts and the plan files. For every request Nadav made it gives one state: done, quoting the reply that shows the evidence; assumed done (reported done, no evidence shown); stopped midway; forgotten; changed from what he asked; waiting on someone. It also lists his questions that got no answer, promises in your replies that were not kept, decisions you made without asking him, and replies that contradict each other. The request as he typed it is the source of truth, not a later summary of it.
- **Product reviewer** (one): checks what was built against the goal. It assumes that a month from now this failed and looks for how: what breaks, what was never tested, what is shallower than the goal needs. For each main part it says whether a simpler or stronger way exists, and how established products do it.

## 3. Verify before you report
Check every finding against the live state yourself (the code, the data, the site, the run), with scoped checks only. A reviewer's report is a lead, not evidence. Mark what you could not check as "לא אומת". Fix nothing in this step: the picture comes first.

## 4. The report to Nadav
In this order:
1. What the review is based on: what was read in full, what was left out, how many times the session was compacted.
2. The goal of the session, in his words.
3. A table: each request or problem, what was done, the state today, the evidence.
4. What was missed, stopped midway, or changed from what he asked.
5. Where the work is not deep enough.
6. Other ways for the main parts, and which one you recommend.
7. What you decided alone.
8. What waits on someone else, and on whom.
9. What is left, in the order to do it, and what is planned next.
10. Where the reviewers and you disagree.

Then one line: "סגורים ב-100%: כן", or "סגורים ב-100%: לא, חסר:" with the list. With any doubt the answer is "לא".

This command asks for the picture first, so here the report comes before the leftovers are finished. That is the one place where it differs from `working-style.md` (Finishing); the reply still ends the way Finishing says. After the report, go on and close what is yours.

Nadav's window or focus, if he gave one: $ARGUMENTS
