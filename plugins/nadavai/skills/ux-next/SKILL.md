---
name: ux-next
description: "Where this project stands in the UI/UX loop (setup → retro → audit → screen → ship) and the next one to three commands to run, read from .omc/design-runs, the setup files and docs/ui-audit/PLAN.md. Use when Nadav types /ux-next, asks \"what now\", \"what is next\", \"where were we\", \"what did I forget\", or forgets the order. Thin shortcut: runs the `next` mode of the nadav-design skill. Starts nothing."
---
# ux-next

This is a shortcut for the `next` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `next $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `next`** section verbatim with `next $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat. Starts nothing, prints the position and the next commands.
