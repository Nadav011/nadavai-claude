# Action safety

For a new application, an action-safety audit, or a change to a business action's preconditions, writes or external effects, completion or status reporting, recovery, or a read that gates those, load `nadavai:action-safety` (fallback: `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/action-safety/SKILL.md`; if neither exists, report the gap). Text and spacing work needs no safety audit.
