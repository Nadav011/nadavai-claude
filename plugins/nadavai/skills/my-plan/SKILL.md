---
name: my-plan
description: "בוא נתכנן ונאפיין, בלי לבנות: מה כבר קיים, שאלון אחד, החלופות, זמן ועלות."
argument-hint: "[כותבים כאן: מה מתכננים]"
disable-model-invocation: true
---
# my-plan: plan and specify, and build nothing yet

Nadav wants to understand and plan before anything is built: a new project, a feature, a move of data, an app whose earlier specs were never finished. In the sessions where he asked this he then had to ask which version is the newest and whether an older spec exists («יש אפיון גם של קודקס וקלוד לא שעישנו ואף פעם לא ממשנו אותו ?»), added requirements one message at a time, and once wrote «אל תתחיל לבנות כלום עד שסימנו ובדקנו את הכל».

What is being planned: $ARGUMENTS

1. Inventory first, before any question: every version, spec, plan, demo and session on this subject, in every tool (Claude, Codex, Grok), newest first, with the ones that were written and never built. Say which is the latest and what each adds. Read the code as it is now. Sessions are found the way `my-other` finds them (`${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/my-other/SKILL.md`, step 1).
2. One questionnaire, not a question per message (AskUserQuestion, up to four per call, your recommended answer first, each reading as a concrete example: `working-style.md`, Requests). It holds only the product decisions that are his, the additions he otherwise brings later (a WhatsApp bot, being found in search, what to measure, an independent review), and, when he named none, the quality bar as one of his own apps. An idea with no anchor at all goes through the `nadavai:deep-interview` skill (`working-style.md`, Requests).
3. Write the plan small (`~/nadavai/guides/documents.md`, read before writing): the option you recommend with two or three alternatives and why each lost, how an established product does it with its URL, the edge cases up front (no data to bring over, a person who does nothing), the cost and the time, and the units in the order a person gets something to use.
4. Build nothing of what is being planned: no code, no migration, no change to a live system, until he says to build (`working-style.md`, Requests). A bug found on the way in what already exists is still fixed, as its own commit (`working-style.md`, Code).
5. Show him the first rough shape, opened as a page with one concrete example, before polish and before a review round: the shape of a plan is his to judge (`working-style.md`, Requests). After he accepts the shape it gets one independent review round (`~/nadavai/guides/review-rounds.md`).
6. Reply with what he has to decide at the top, then the link to the plan.
