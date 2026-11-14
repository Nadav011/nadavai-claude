---
name: my-missed
description: "דילגת על מה ששאלתי: תשובה על כל מה שנשאר בלי מענה."
argument-hint: "[על מה דילגת]"
disable-model-invocation: true
---
# my-missed: you skipped what I asked

Nadav wrote several things in one message, or asked something earlier, and part of it got no answer. He should not have to ask a third time.

What he says was skipped, if he named it: $ARGUMENTS

1. Take his recent messages word for word, not from memory: `session-digest ${CLAUDE_SESSION_ID} --owner-only --out <a new folder in your scratchpad>`, and read from the last message you answered in full up to now. When he says the goal itself was lost, read the whole session.
2. Split each message into its separate asks: every question, every instruction, every "וגם". A file, a link, a screenshot or another session's text that he pointed to is an ask to read it: open it now if you did not.
3. Give each ask one state: answered (and where), done (with the evidence), partly, or skipped. When you hesitate, it is skipped.
4. Answer or do every "partly" and "skipped" one now, in the order he wrote them, each under his own words quoted in one line. An ask that is one of the gated actions, or a decision that is his, is listed with its exact question instead (`working-style.md`, Approval gates and Requests).
5. Open the reply with one sentence that says what he meant overall, so that he sees he was understood. Then the list. Close with what is still open, and on whom.

If the session drifted from its first goal, say what that goal was in his words, what it turned into, and what of the first goal is still not done.
