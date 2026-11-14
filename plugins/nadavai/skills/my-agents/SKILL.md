---
name: my-agents
description: "למה אופוס ולא סונט? מי עושה מה ועל איזה מודל, ומה אפשר לתת לאחרים."
argument-hint: "[לא חובה: על איזה מודל או כלי השאלה]"
disable-model-invocation: true
---
# my-agents: who is working on this, and on which model

Nadav asks which agents and models are doing the work, why those, and whether more of it could go to other agents, another model, Codex, Grok or the other machine.

What he asks or tells, if he said: $ARGUMENTS

1. List what runs for this work now: this session's model and effort (say so when the effort cannot be seen from here), and every subagent, teammate and Workflow agent (ListAgents, the task list), each with its model, what it is doing and since when. Mark one that died or sits idle.
2. Hold that list against `model-routing.md`, reading it now: which model that file gives each kind of work, where Opus is required, and which model never goes to a subagent. Say where the setup differs. This is an answer: change nothing unless his words after the command ask for a change (step 3).
3. If he named a model or a tool ("רק סונט", "תן לקודקס", "תפעיל את גרוק"), apply it where that file allows, and say plainly where it does not and why: the kind of change, or a provider that is out of quota (check memory for its reset date before you try it).
4. Say what else could run side by side, and on what: independent units of the plan, a review on another vendor's model, the other machine. Read the live load first (`heavy-slot --status`); `machine-load.md` decides how much runs at once.
5. If he switched this session's model or effort in the middle of the work, say whether anything already done is worth going over again with the new one, and what that would cost.
6. Reply in everyday Hebrew (`working-style.md`) with a short table: who, on which model, doing what, in what state. Then what you changed, and what each option he asked about costs in time and tokens.

More agents are not faster by themselves: each one starts cold and needs a brief. Say so when one agent is the right number.
