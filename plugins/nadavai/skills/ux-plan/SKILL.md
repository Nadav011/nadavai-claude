---
name: ux-plan
description: "Plan one feature before code: PRD via /write-spec, JTBD, Intent flows + IA + localize, ux-heuristics with RTL, optional Claude Design mockup, ends with the screen list. Use when Nadav types /ux-plan FEATURE or asks to plan a feature the right way. Thin shortcut: runs the `plan` mode of the nadav-design skill."
---
# ux-plan

This is a shortcut for the `plan` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `plan $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `plan`** section verbatim with `plan $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat.
