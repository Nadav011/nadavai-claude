---
name: my-next
description: "מה עכשיו? הצעד הבא ומי עושה אותו, ומה מחכה לי."
argument-hint: "[על מה]"
disable-model-invocation: true
---
# my-next: what now

A step just ended and Nadav asks what comes next. He wants the next move and whether he is needed, not a status report (that is `/nadavai:my-status`).

1. Check the live state of what just ended and of anything still running: a task, a CI run, a deploy, another session. Do not answer from memory.
2. Answer in at most six lines, in this order:
   - what just finished, with its evidence in a few words;
   - the next step and who takes it. When it is yours, say what you are starting now and how long it should take;
   - what waits on him: the exact action or question, one line each, or "כלום" when nothing does;
   - what waits on someone or something else (a client, a store review, a date);
   - when it is worth his coming back.
3. If the work is finished, say so in the first line and name `/nadavai:my-done` for the check.
4. After the reply, start the next step when it is yours. `working-style.md` says what is yours to finish (Finishing) and what waits for him (Approval gates); this command changes neither.

A decision that is his goes into AskUserQuestion, not into the six lines.

What he asked about, if he said: $ARGUMENTS
