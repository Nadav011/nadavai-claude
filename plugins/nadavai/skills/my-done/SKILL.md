---
name: my-done
description: "סיימנו את הכול? כל בקשה שלי ומה קרה איתה, והאם אפשר לסגור את הסשן."
argument-hint: "[על מה להתמקד]"
disable-model-invocation: true
---
# my-done: did we finish everything (the quick check)

Nadav asks whether the work he asked for in this session is finished. This is the quick check: no reviewer agents, a few minutes at most. The whole picture with rounds and time is `/nadavai:my-map`; the deep check is `/nadavai:my-review`.

1. Get his requests from the transcript, not from your memory of it: run `session-digest ${CLAUDE_SESSION_ID} --owner-only --out <a new folder in your scratchpad>` and read the parts. They hold only what he typed, what he picked in dialogs and the goal conditions, so they are short. With more than 6 parts, run it again with `--since` for the last few days and say which days you left out. A line in `index.md` that starts "NOT IN THIS DIGEST" names another file of this session with messages he typed: run the command on it too. If the digest cannot be built, say so in your first lines and list the requests from the conversation, marked as from memory. The folder stays in the scratchpad.
2. Give each request one state, with its evidence (a command you ran now and its result, a URL, a commit, a file):
   - done: the evidence shows it works now;
   - assumed done: it was reported done and you did not re-check it now. Say so, because an earlier report is not evidence;
   - stopped midway, forgotten, or changed from what he asked;
   - waiting: on whom, and since when.
   When you hesitate between done and not done, it is not done.
3. For what was meant to ship, say where it is, each with its evidence: in main (the commit), live on the domain (the address and a check made now), and for store apps each app on each platform. What he names below is checked item by item.
4. Close the loose ends he asks about every time: messages that belong to other sessions were forwarded; what was learned is saved where the next session finds it (the skill, the plugin, memory) and the other machine has it; and whether anything waits on him or on someone outside (a client, an accountant, a lawyer, a store review).
5. Run `session-close-check` as `working-style.md` (Finishing) says, and open and close the reply the way that section sets. The opening answer is about this session's own work: another session's work does not turn it into "לא", and goes in one separate line near the end. A message that belongs to another session and was not forwarded yet is this session's to forward: forward it before you answer, as Finishing says.
6. The table of requests comes right after the opening. If part of the session was left out, say so before the closing lines, with: "לא כל הסשן נבדק. לביקורת מלאה: /nadavai:my-review".

This command asks for the picture first, so here the report comes before the leftovers are finished. That is the one place where it differs from Finishing. After the report, go on and finish what is yours.

Nadav's focus, if he gave one: $ARGUMENTS
