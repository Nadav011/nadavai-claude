---
name: my-client
description: "תכין הודעה ללקוח: טיוטה מלאה על מה שנעשה, ונשלחת רק אחרי שאישרתי."
argument-hint: "[למי, ועל מה]"
disable-model-invocation: true
---
# my-client: prepare the message to the client

Nadav wants the message he will send to a client, a partner or a client's team about this work: what was done, what changes for them, the links, and what he needs from them.

Who it is for and what it should cover, if he said: $ARGUMENTS

1. Read `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/client-messages/SKILL.md` and follow it. It sets the style, the process (draft, approve, send, read back) and the log.
2. Find out who the message is for and what they last wrote: read the chat first (`whatsapp.md`, read-only), so that the draft answers their latest message and repeats nothing they were already told. If he did not say who it is for and the session does not settle it, ask him once with AskUserQuestion.
3. Build the content from what was verified in this session, not from what was planned. Each claim ("תוקן", "באוויר", "נשלח") is one you checked now, and each link is one you opened, signed out where the client will be signed out.
4. Write the draft to a file, as that skill says, in the language and tone of that chat, and give him the file's path: the text he copies is the file, because the terminal's output can break a line in the middle. In the reply show the draft for reading, and above it anything that could trip him up: a promise, a date, money, a legal point, an item you could not verify.
5. This command prepares the message. The send is the step `client-messages.md` and `whatsapp.md` describe: it follows his explicit yes for this message, and then a live session sends it, reads it back and logs it as the skill says.

If the client reported a bug and the message says it is fixed, `action-safety.md` sets what has to be true before that sentence is written.
