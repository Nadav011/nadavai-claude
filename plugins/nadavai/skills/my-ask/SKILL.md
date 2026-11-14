---
name: my-ask
description: "תשאל אותי את כל מה שפתוח: שאלון אחד, רק מה שבאמת שלי להחליט, עם דוגמאות והמלצה."
argument-hint: "[על איזה נושא]"
disable-model-invocation: true
---
# my-ask: ask me everything that is open

Nadav wants every open question now, in one go, so that he is not stopped again later.

1. Collect what is open: the decisions this work needs that nobody with the right to decide has made, and anything you guessed. A question you asked earlier that got no answer comes first, restated in full, because he may have lost it.
2. Remove what is not his to answer. A fact you can find (in the repo, the docs, the data, his earlier messages, `GLOSSARY.md`, memory) you find. A detail that is cheap to change later, or an edge case users will not notice, you decide yourself. Keep what `working-style.md` leaves to him: the five gated actions (Approval gates), a product decision that changes what a person does, sees or pays and that nobody decided, and a word of his with more than one reading (Requests).
3. Say how many questions there are, then ask what remains with AskUserQuestion: up to four questions per call, grouped by topic. Order them by how much the answer changes: first the ones that change the structure of the work or block the most of it, last the ones that change one screen. Each question shows two or three options as concrete examples he can judge at a glance (what the user sees, the opening line of the message, the number), with your recommended option first and marked. He can always answer in his own words.
4. After his answers, write each one where the next session will find it (the spec or the plan; `GLOSSARY.md` for a term), in his words with the date. Record only what he picked or typed: an option he did not pick is not written as his. Then continue the work.
5. End with the list of what you decided yourself in step 2, one line each, so that he can reverse any of them.

If nothing is open, say so in one line. Do not invent questions.

The topic, if he gave one: $ARGUMENTS
