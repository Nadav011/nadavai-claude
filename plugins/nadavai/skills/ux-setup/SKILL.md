---
name: ux-setup
description: "One-time UI/UX setup of a project, every step verified (the `setup` mode of nadav-design). Use when Nadav types /ux-setup or asks to set up the design environment on a project."
---
# ux-setup

This is a shortcut for the `setup` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `setup $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules**, then `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/modes/setup.md` verbatim with `setup $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that file (step 0 where it exists), one step at a time, evidence after every step, stop on failure (tempo: `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/shared/rules.md`), Hebrew chat.
