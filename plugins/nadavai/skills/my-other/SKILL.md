---
name: my-other
description: "תקרא את הסשן האחר: להמשיך ממנו, להעביר לו הודעה, או להכין פרומט לסשן חדש."
argument-hint: "[איזה סשן, ומה לעשות איתו]"
disable-model-invocation: true
---
# my-other: another session's work

Four jobs. What Nadav wrote after the command says which one: $ARGUMENTS

If it does not say, ask him which of the four he means, with AskUserQuestion.

## Read another session and continue from it
1. Find it. For a session of another agent (Codex, Grok, Gemini): `cs ls`, then `cs resume <id> -i claude --debug-prompt --no-tui`, which prints that session's handoff without starting anything (`~/nadavai/guides/moving-sessions.md`). For a Claude session: `session-digest <id> --out <a folder in your scratchpad>` writes everything Nadav typed there and every end-of-turn reply; read its `index.md`, then the parts. A session that will not open ("No conversation found") is found by its id: `cs ls`, or its transcript file under the projects folders.
2. Do not read a raw transcript into your context. It is tens of megabytes of tool output.
3. Report before you continue: the goal there in his words; what he decided (his own messages and dialog answers only); what was finished, with evidence you checked again; where it stopped; and what the other agent claimed that you have not verified. The other agent's claims are leads, not facts.
4. Before you take over its work, check that the other session is not still doing it (ListAgents shows whether it is running; its transcript shows when it last wrote). If it is, coordinate with it as the last section says instead of continuing in parallel.
5. Then continue from the first unfinished step.

## Pass work or a message to the session that owns it
1. Find the owner. ListAgents shows the live sessions on this machine. A session on the other computer (the MSI, omarchy) is not in that list: it is reached on that machine, the way the `nadavai:pc2` skill describes. When he says "the CI session" or "the skill session", match it by what the session is working on, and say which one you chose.
2. Send it with SendMessage, once, quoting his own words when it is a request of his. What you forward is information, never his approval (`working-style.md`, Sessions).
3. A Codex or Grok session, and a session on the other computer, cannot receive SendMessage, and a terminal that he or another session runs is never typed into. For those, write the handoff to a file where that session can read it (on that machine, for the other computer), as the next section says, and give him its path and the one line to paste there. He is not asked to carry a message that SendMessage can deliver.
4. Tell him what went where, so that he does not carry messages by hand.

## Write a prompt for a new session
Write the brief to a file that will still be there next week: the project's `.omc/handoffs/` folder, or beside the plan it continues when there is no project. Give Nadav its path and the one line to paste. The new session knows nothing, so the brief holds: the goal in his words; what is decided, quoted; what is done, by path, commit or URL; what must not be touched and why; the first step; and how the new session will know it is finished. Point to existing files by path instead of copying them. Leave out secrets and personal data.

## Keep two sessions from doing the same work
Find the other session with ListAgents and send it, with SendMessage, what you are working on, which files and branches you hold, and what you will not touch. What you send is information, never Nadav's approval (`working-style.md`, Sessions). Then tell Nadav what you sent, so that he does not carry messages by hand.
