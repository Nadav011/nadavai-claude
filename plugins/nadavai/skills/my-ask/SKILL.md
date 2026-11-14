---
name: my-ask
description: "תשאל אותי את כל מה שפתוח, בבת אחת: רק מה שבאמת שלי להחליט, עם דוגמאות והמלצה."
argument-hint: "[על איזה נושא]"
disable-model-invocation: true
---
# my-ask: ask me everything that is open

Nadav wants every open question now, in one go, so that he is not stopped again later.

1. Collect what is open: the decisions this work needs that nobody with the right to decide has made, and anything you guessed.
2. Remove what is not his to answer. A fact you can find (in the repo, the docs, the data, his earlier messages, `GLOSSARY.md`, memory) you find. A detail that is cheap to change later, or an edge case users will not notice, you decide yourself. Keep what changes what people see, costs money, speaks in his name, or cannot be undone.
3. Ask what remains with AskUserQuestion: up to four questions per call, the one that blocks the most work first, grouped by topic. Each question shows two or three options as concrete examples he can judge at a glance (what the user sees, the opening line of the message, the number), with your recommended option first and marked. He can always answer in his own words.
4. After his answers, write each one where the next session will find it (the spec or the plan; `GLOSSARY.md` for a term), in his words with the date. Then continue the work.
5. End with the list of what you decided yourself in step 2, one line each, so that he can reverse any of them.

If nothing is open, say so in one line. Do not invent questions.

The topic, if he gave one: $ARGUMENTS
