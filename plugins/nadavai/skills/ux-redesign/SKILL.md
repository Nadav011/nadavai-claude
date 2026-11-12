---
name: ux-redesign
description: "Redesign a whole existing app: the direction as a demo of the main journey, one review round, numbered decisions and a checked build plan whose first unit is the app's own preview, with no app code (the `redesign` mode of nadav-design). Use when Nadav types /ux-redesign or asks to redesign or renovate the whole app."
---
# ux-redesign

This is a shortcut for the `redesign` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `redesign $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules**, then `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/modes/redesign.md` verbatim with `redesign $ARGUMENTS` as `$ARGUMENTS`, and `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/redesign/README.md` for the full procedure. Never look for the master anywhere else.
2. Start at the first step of that file (step 0 where it exists), one step at a time, evidence after every step, stop on failure (tempo: `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/shared/rules.md`), Hebrew chat.
