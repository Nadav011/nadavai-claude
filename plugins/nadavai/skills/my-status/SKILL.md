---
name: my-status
description: "מה מצבנו? מה נעשה, מה רץ עכשיו, מה מחכה ולמי, וכמה זמן עוד."
argument-hint: "[על מה להתמקד]"
disable-model-invocation: true
---
# my-status: where the work stands and when it ends

Nadav is switching in from other sessions and wants to know in half a minute where this one stands and whether he is needed. He has not seen your tool calls.

1. Check now the live state of everything you are about to call running or waiting: the background task, the CI run, the deploy, the other session. Do not report it from memory.
2. Answer in the form `working-style.md` (Reporting to Nadav) sets for a status question. "Since his last message" means since the message before this command.
3. Add what that form leaves out:
   - where the remaining time goes: building, checks, waiting, and what could run in parallel to shorten it;
   - an end time only when something measured supports it (how long such a run usually takes, how many units are left). Otherwise say what the estimate depends on.

A failure or a stalled item goes in the first lines, not the last. Silence about a failure is the worst thing this reply can do.

Nadav's focus, if he gave one: $ARGUMENTS
