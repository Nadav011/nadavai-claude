---
name: my-never
description: "למה זה קרה, ושלא יקרה שוב: שורש הבעיה, חיפוש של אותה בעיה במקומות אחרים, ומנגנון שעוצר אותה."
argument-hint: "[מה קרה]"
disable-model-invocation: true
---
# my-never: why did it happen, and make sure it does not happen again

Something went wrong, often more than once, and Nadav wants it made impossible, not apologised for. This is about that one problem; do not turn it into a sweep of every past mistake.

The problem: $ARGUMENTS

If that is empty, it is the failure just discussed.

1. Find the root cause from evidence: the transcript, the logs, the code, the data. Say what happened, why, and why nothing caught it. If you cannot show the cause, separate what you know from what you guess.
2. Look for the same class of problem elsewhere: the same pattern in this code, in the other projects that share it, and in production data (read-only). List every place you find. What those places need is done under `working-style.md` (Approval gates) and `action-safety.md`.
3. Choose the enforcement, taking the first of these that works: a structure in which the mistake cannot be made; a type or a schema; a lint rule or a hook whose message names the fix; a test; a script that makes the right action one command; and text in a rule or a skill last.
4. Prove that the enforcement fires: reproduce the mistake on purpose and show the check catching it. An enforcement you have not seen fire is a hope.
5. Report the cause, where else it was found, what stops it now with the proof, and what is still open.

A fix inside this project you make now. A fix that belongs in `~/nadavai` follows `nadavai.md`. Something that fails a wrong action in code, with a message that names the right one (a test, a lint rule, a check in a script, a guard on a command that is wrong every time), you build, prove and report. Text that would make agents ask him, wait for him or decline a task is his to decide: give him the exact wording and the case it is for.
