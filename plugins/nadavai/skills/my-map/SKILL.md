---
name: my-map
description: "איבדתי את התמונה: מה נסגר, מה נשאר, באיזה סבב אנחנו וכמה זמן עוד. על כל הסשן מההתחלה, בלי לפספס שום בקשה."
argument-hint: "[על מה להתמקד]"
disable-model-invocation: true
---
# my-map: the whole session on one page

The session has run for days and through many rounds, and Nadav has lost the picture: what is closed, what is left, which round this is and how long it will still take. He wants one page he can hold in his head, with nothing he asked for missing from it. This is a map, not a quality review: no reviewer agents. The deep check is `/nadavai:my-review`.

1. Take his requests from the transcript, not from your memory of it: run `session-digest ${CLAUDE_SESSION_ID} --owner-only --out <a new folder in your scratchpad>` and read every part. It holds what he typed, what he picked in dialogs and the goal conditions for the whole session, so it is short even after weeks. A line in `index.md` that starts "NOT IN THIS DIGEST" names another file of this session with messages he typed: run the command on it too. If the digest cannot be built, say so in your first line and build the map from the plan files and the conversation, marked as from memory. The folder stays in the scratchpad.
2. Read what the work itself recorded: the plan, the goal, the task list, each round's report or review verdict, and the decision trail if the work kept one. Check the live state of what you are about to call closed or running.
3. Sort every request into a handful of topics, named in his words. Each request ends in one state: closed (with its evidence), open (what exactly is still missing), not started, dropped (who decided, and why), or waiting (on whom). A request reported as done that you did not check now is "closed by an earlier report, not checked now". Count them: every request from the digest appears in exactly one row, and the totals add up to the number of requests you found. One that fits no topic gets its own row instead of being left out.
4. The rounds: which round this is, what each earlier round closed in one line, what the current round is doing and what is left in it, and what ends the rounds (the stop rule this work uses). If the number of rounds still to come is unknown, say what it depends on.
5. The time: what remains, split into building, checks and waiting, with an estimate taken from the measured pace of this work (how long the last rounds took, how many units are left). Say what the estimate rests on and what could shorten it. Without a measured basis, give the range and say it is a guess.
6. The reply, in this order:
   - three lines first: how much is closed out of how much, which round this is, and when it should end;
   - the table by topic: closed, open, waiting;
   - what is left, in the order it will be done;
   - what waits on him, each with its exact question;
   - what you decided alone since the last time he looked, from the decision trail or your replies;
   - what the map is based on: the digest read in full or not, and how many times the session was compacted.

Fix nothing while you build the map. After the reply, continue the work where it stood.

Nadav's focus, if he gave one: $ARGUMENTS
