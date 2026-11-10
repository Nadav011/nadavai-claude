# Action safety

For a new application, an action-safety audit, or a change to a business action's preconditions, writes or external effects, completion or status reporting, recovery, or a read that gates those, load `nadavai:action-safety` (fallback: `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/action-safety/SKILL.md`; if neither exists, report the gap). Text and spacing work needs no safety audit.

Two invariants hold whether or not the skill is loaded:
- Before anything that messages real people is switched on for a client, replay it on that client's recent real inbound messages without sending, and show the counts of what it would have sent and to whom.
- A bug that a client reported gets its root cause, a sweep for the same class of bug in the code and in production data, and a regression test, before the reply to the client.
