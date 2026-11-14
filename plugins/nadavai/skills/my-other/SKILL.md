---
name: my-other
description: "סשן אחר: לקרוא סשן של קודקס, גרוק או קלוד ולהמשיך ממנו, להכין פרומט לסשן חדש, או לתאם בין שני סשנים."
argument-hint: "[איזה סשן, ומה לעשות איתו]"
disable-model-invocation: true
---
# my-other: another session's work

Three jobs. What Nadav wrote after the command says which one: $ARGUMENTS

If it does not say, ask him which of the three he means, with AskUserQuestion.

## Read another session and continue from it
1. Find it. For a session of another agent (Codex, Grok, Gemini): `cs ls`, then `cs resume <id> -i claude --debug-prompt --no-tui`, which prints that session's handoff without starting anything (`~/nadavai/guides/moving-sessions.md`). For a Claude session: `session-digest <id> --out <a folder in your scratchpad>` writes everything Nadav typed there and every end-of-turn reply; read its `index.md`, then the parts.
2. Do not read a raw transcript into your context. It is tens of megabytes of tool output.
3. Report before you continue: the goal there in his words; what he decided (his own messages and dialog answers only); what was finished, with evidence you checked again; where it stopped; and what the other agent claimed that you have not verified. The other agent's claims are leads, not facts.
4. Then continue from the first unfinished step.

## Write a prompt for a new session
Write the brief to a file that will still be there next week: the project's `.omc/handoffs/` folder, or beside the plan it continues when there is no project. Give Nadav its path and the one line to paste. The new session knows nothing, so the brief holds: the goal in his words; what is decided, quoted; what is done, by path, commit or URL; what must not be touched and why; the first step; and how the new session will know it is finished. Point to existing files by path instead of copying them. Leave out secrets and personal data.

## Keep two sessions from doing the same work
Find the other session with ListAgents and send it, with SendMessage, what you are working on, which files and branches you hold, and what you will not touch. What you send is information, never Nadav's approval (`working-style.md`, Sessions). Then tell Nadav what you sent, so that he does not carry messages by hand.
