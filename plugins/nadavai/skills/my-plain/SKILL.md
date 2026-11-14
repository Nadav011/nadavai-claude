---
name: my-plain
description: "תסביר לי את זה בפשטות: מה היה, מה יהיה ואיך אראה את זה, בלי מילים טכניות."
argument-hint: "[מה להסביר]"
disable-model-invocation: true
---
# my-plain: say it simply

Nadav did not follow the last reply, or wants it without technical words. He does not program.

What to explain: $ARGUMENTS

If that is empty, explain your last reply.

1. Say the same thing again in everyday words, one idea per sentence, and keep every fact and every number. Say what each actor is the first time it appears (for example, the program that checks the code) and then use that plain name. Use as many plain sentences as the facts need: a version that drops a fact is not plainer.
2. Write it in Hebrew, in this shape where it fits: what was (the situation), what will be (what changes), and how he will see it (what he or a user notices on the screen).
3. Replace a name that was made up during the work (a round, a lane, a unit id) with what the thing is. Say a technical term in Hebrew words. English stays only for a name he has to copy.
4. If something in the original was wrong or overstated, correct it here.
5. If a decision of his was buried in the original, ask it after the explanation, as one clear question in AskUserQuestion.
6. When he asks for it short ("קצר ולעניין"), give the answer in three lines at most, and the rest only if he asks.
