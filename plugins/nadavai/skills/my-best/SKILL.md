---
name: my-best
description: "זו הדרך הכי טובה? יש משהו מוכן שעושה את זה? עמדה אמיתית, חלופות, ואיך עושים את זה המובילים."
argument-hint: "[על מה]"
disable-model-invocation: true
---
# my-best: is this the right way, and does something ready exist

Nadav wants your real position on the approach (the plan, the tool, the method), not agreement.

The subject: $ARGUMENTS

If that is empty, the subject is the approach this session is following now.

1. State the approach as it stands, in two lines, and what it is for.
2. Check that it has to be built at all: the codebase, the installed tools and skills, the platform, and maintained projects on GitHub, npm or PyPI. Before you name a tool, search every project's memory for an earlier decision about it (`grep -ril '<name>' ~/.claude/projects/*/memory/`), and tell him if he already decided against it.
3. Find how two or three established products or teams handle the same problem. Read their own pages and give the URL for each.
4. Compare the current approach with the two or three real alternatives: what each costs in time, money and risk, and why it wins or loses here. Question the premise too: is this the right problem to solve, and is the plan bigger than the problem needs?
5. Answer in this order: your position in one sentence (keep it, change it, or replace it, and with what); the comparison; what you verified and what you assume; your confidence; and what evidence would change your mind.

If the current way is right, say so plainly and stop. Do not invent objections. If it is wrong, say what changing course would cost now.
