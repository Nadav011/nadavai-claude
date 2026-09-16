---
name: ux-next
description: "Where the project stands in the UI/UX loop and what to run next (the read-only `next` mode of nadav-design). Use when Nadav types /ux-next or asks what now, what is next, or what he forgot."
---
# ux-next

This is a shortcut for the `next` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `next $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `next`** section verbatim with `next $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat. Starts nothing, prints the position and the next commands.
