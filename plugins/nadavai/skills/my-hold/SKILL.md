---
name: my-hold
description: "רק תענה, אל תתחיל כלום: תשובה או תוכנית בלבד, בלי שום שינוי עד שאני אומר."
argument-hint: "[לא חובה: השאלה שלך. בלי כלום: ההודעה האחרונה שלך]"
disable-model-invocation: true
---
# my-hold: answer only, start nothing

Nadav is asking, thinking out loud or planning. In this turn he wants an answer, not an action.

His question or subject: $ARGUMENTS

If that is empty, it is his last message before this command.

1. Change nothing in this turn: no file edit, no commit or push, no deploy, no message or post, no new agent or workflow, no command that writes. Reading is fine, and often needed for a true answer: files, logs, the live state, the web.
2. What already runs keeps running. List it in one line (the task, the agent, the CI run) and stop one only if he says so.
3. Answer what he asked, with the answer in the first line, and no more than he asked. Only when he asks to understand or to plan ("בוא נבין מה עושים"), give: what exists today; what he asked for, in his words; two or three ways to do it, the one you recommend and why; what the first step would be; and the decisions that are his.
4. End with what you would do next if he says go, in one or two lines, so that his "כן" or "קדימה" is enough to start it.

The hold is for this turn and for the thing he asked about. His next message that asks for work lifts it.
