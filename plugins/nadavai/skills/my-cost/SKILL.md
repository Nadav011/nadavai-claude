---
name: my-cost
description: "איפה הולכים הטוקנים והכסף? מה עולה הכי הרבה, ומה לחסוך בלי לפגוע באיכות."
argument-hint: "[לא חובה: על איזו עבודה, או כמה ימים אחורה]"
disable-model-invocation: true
---
# my-cost: where the tokens and the money go

Nadav asks what this way of working costs, where it is wasteful, and whether the same quality can be had for less.

What he is asking about, if he said: $ARGUMENTS

1. Measure first: `token-audit` for the period he means (seven days when he names none), `subagent-context` for how large agents start and end, `executor-quality` for how often work is rejected per model, `guard-stats` for how often the guards fire. Report numbers from these runs, not impressions.
2. Name the five largest costs and what each one buys. A cost that buys nothing is waste: an agent that explored again what its caller already knew, a duplicate run, a server left idle, a model larger than the work. A review that catches real defects is not waste.
3. Before you propose a lever, search memory for an earlier decision about it (`grep -ril '<term>' ~/.claude/projects/*/memory/`). He has already decided against several; say so instead of proposing them again.
4. For each lever that is left, give the expected saving, what it risks, and how the result would be measured a week later. Rank them by saving against risk.
5. Do now what is inside this session and loses nothing: stop an agent that is no longer needed, stop a server left running, give the next agent a brief instead of a new exploration (`model-routing.md`). A change to the rules, the models or the settings is a global change: propose it with its numbers, and it is made when he asks for it.
6. Reply in everyday Hebrew (`working-style.md`) and in plain numbers: what the period cost and on what; what of it is waste; what you stopped just now; and the two or three changes worth making, with what each would save.

A paid plan, an upgrade or a new paid tool is the money gate (`acting-on-behalf.md`), asked at that moment.
