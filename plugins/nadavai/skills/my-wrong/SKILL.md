---
name: my-wrong
description: "זה לא מה שהתכוונתי: מה ביקשתי מול מה שיצא, וחלופות לפני שבונים שוב."
argument-hint: "[מה לא טוב]"
disable-model-invocation: true
---
# my-wrong: this is not what I meant

Nadav looked at the result and it is not what he asked for, or it is not good. He does not want it defended, and he does not want the same thing built again slightly changed.

What is wrong, in his words: $ARGUMENTS

1. Go back to what he asked. Take the request and every reference he gave (a site, a screenshot, an earlier version he approved) from the transcript, word for word: `session-digest ${CLAUDE_SESSION_ID} --owner-only --out <a new folder in your scratchpad>` holds everything he typed. Your memory of the request is where the wrong reading lives.
2. Say in two or three lines what he asked for, what you built, and where the two parted: a word you read differently, a reference you did not follow, something you added that he did not ask for, or something that was better before and was lost.
3. If it was better before, find that version (the commit, the deployed build, the screenshot), show the difference, and bring back what he had approved before anything new is made.
4. If a word of his has more than one reading, do the understanding check of `working-style.md` (Requests): two or three readings as concrete examples he can judge at a glance, in one AskUserQuestion, your recommended one first, and his answer recorded in `GLOSSARY.md` as that section says. For a screen or a design, the examples are shown the way the nadav-design skill shows them, and a reference he gave is followed faithfully, one section at a time.
5. If the reading is clear and only the result fell short, say what exactly is below the bar, fix that, and show before and after.
6. He sees the direction (the readings, or a first section) before the whole thing is made again.

When he says only "גרוע" or "לא טוב" and gives nothing to go on, show him two or three different directions instead of asking him to explain.
