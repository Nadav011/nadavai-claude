---
name: my-save
description: "תשמור את זה לתמיד: לאן זה נכנס, באיזה נוסח, ושזה יהיה בכל המחשבים."
argument-hint: "[לא חובה: מה לשמור]"
disable-model-invocation: true
---
# my-save: keep this for good

Something was learned, decided or built in this session that Nadav wants every later session, project and machine to have, so that it is not worked out again.

What to keep: $ARGUMENTS

If that is empty, list what this session produced that is worth keeping (what failed and why, what worked, a decision of his, a word of his, a procedure that was verified) and keep each one. One kind is not kept on your own pick: a change to a rule or a skill in `~/nadavai` that he did not name is listed with its exact wording for him to choose (`working-style.md`, Learning), and the rest is saved.

1. For each item, find whether it is already recorded: the project's files, `GLOSSARY.md`, the memory of every project (`grep -ril '<term>' ~/.claude/projects/*/memory/`), and the rules and skills in `~/nadavai`. Update the record that exists instead of adding a second one.
2. Put it where it will be read at the moment it is needed:
   - a fact about him, a preference, a decision, a pointer to a resource: memory;
   - a word of his and what it means: `GLOSSARY.md` (`working-style.md`, Requests);
   - a verified, repeatable procedure of one project: a skill under `.claude/skills/`;
   - something every project needs: the matching skill or rule in `~/nadavai`, following `nadavai.md` (a worktree, commit, push, `update.sh`, `agnix` on what you touched). When he named the item, this command is his request for that change;
   - a mistake that code can stop: a test, a lint rule or a hook before any text (`/nadavai:my-never` is the command for that).

   Before a lesson becomes rule or skill text, say how often it will recur: one that applies to this project or this once goes to memory or the plan; only one that would recur across sessions becomes rule or skill text.
3. Write it short and specific: what it is, when it applies, why, and the date. A decision is recorded as his only when he typed it or picked it; anything else is written as "recommended, not decided".
4. A line that would make agents ask him, wait for him or decline a task is his to decide (`nadavai.md`): give him the exact wording and the case it is for, and leave it out until he answers.
5. When the lesson belongs to a skill that another session owns or uses, tell that session with SendMessage what changed.
6. Prove that it took: show the text as saved and where, and that a new session gets it (the memory index lists the file, the skill is listed, `update.sh` ran here), and say which machines still have to pull. The memory of most projects stays on this machine (only a project whose memory folder is a link into the synced `~/Documents/agent-memory/` reaches the other computer), so what every machine needs goes to `~/nadavai`.
