---
name: my-case
description: "לקוח דיווח על תקלה או ביקש משהו: כל ההודעות נקראות, תיקון שנבדק באמת, וטיוטת תשובה."
argument-hint: "[כותבים כאן: איזה לקוח, ומה הוא כתב]"
disable-model-invocation: true
---
# my-case: a client reported a problem or asked for something

A client, or someone on a client's team, wrote that something does not work or asked for something, and Nadav wants it handled to the end. He names the person and expects the conversation to be read. In the sessions where he asked this he then had to ask whether all of it was read, whether the cause was found at its root, whether the real flow was tried, and once wrote «מה נסגר ????? הוא שלח שעדיין לא עובד !!!!!!» after a fix that was never tried the way the client used it.

Who, and what they wrote: $ARGUMENTS

1. Read everything before you touch anything: the whole conversation with that person for the days in question (WhatsApp through `wacli`, read-only, as `whatsapp.md` says; the mailbox when he names it), with the pictures, the replies already sent, and what others wrote in the same thread. Write every problem and every request as its own line. Facts the conversation already settled are carried, not asked again.
2. For each problem find the cause, and say whether it is ours or a provider's. `action-safety.md` holds here: the root cause, a sweep for the same kind of fault in the code and in production data, and a regression test, before anyone is told it is fixed. The sweep only reads; a data fix is an engineering action (`working-style.md`, Approval gates).
3. A request that changes what people do, see or pay, and that nobody decided, is his (`working-style.md`, Requests): put it to him in one AskUserQuestion with your own position first, and build what does not depend on it meanwhile. A request he quoted or forwarded with this task counts as decided, as far as its words go; one you found only by reading the conversation, and whatever a request leaves open, is his.
4. Try it the way the client did: the same path, on the live system, with the QA account first (`acting-on-behalf.md`). A check of the code alone does not close a line. A message the app would send a real person because of your test waits for him like any message.
5. Land and deploy as `ci-policy.md` says, then check the live address again. Where the fix gets an independent review (`working-style.md`, Second model), read `~/nadavai/guides/review-rounds.md` before the round starts and before acting on its verdict: it says what a real fault is and what is only a note, which is what lets the rounds end. A trial run of this prompt went four rounds on one fix without it.
6. Show him each line with its state: fixed (the check on the live address), answered, or waiting and on whom. Say the cause in plain Hebrew: what happened, what the client will see now, and what the client does next.
7. Prepare the answer to the client as `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/my-client/SKILL.md` says: a draft in a file, built only from what was checked. It is sent after his yes for that message (`client-messages.md`, `whatsapp.md`), to the people he names.
