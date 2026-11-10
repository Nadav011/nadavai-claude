# Action safety

For a new application, an action-safety audit, or a change to a business action's preconditions, writes or external effects, completion or status reporting, recovery, or a read that gates those, load `nadavai:action-safety` (fallback: `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/action-safety/SKILL.md`; if neither exists, report the gap). Text and spacing work needs no safety audit.

Two invariants hold whether or not the skill is loaded:
- Before anything that messages real people is switched on for a client, or its reply logic changes, replay it on that client's last 7 days of real inbound messages with every external effect off (no send, no database or calendar write, no webhook), and show Nadav the counts of what it would have sent and to whom, with a few examples. It is switched on only after his yes.
- A bug that a client reported gets its root cause, a sweep for the same class of bug in the code and in production data (read-only: each data fix it finds is listed for Nadav, and deletions and migrations stay behind their gate), and a regression test where the repo keeps tests (otherwise a recorded reproduction), before the reply that tells the client it is fixed. An acknowledgement that it is being handled can go earlier, under `client-messages.md`.
