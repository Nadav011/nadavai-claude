---
name: ux-screen
description: "Build or redesign ONE screen through the full loop: brief, shadcn on DESIGN.md tokens, /impeccable critique + harden, /review-animations, interfaces review if critical, detect + eslint, DoD, screenshots, commit. Use when Nadav types /ux-screen NAME or asks to build/redesign screen X the right way. Thin shortcut: runs the `screen` mode of the nadav-design skill."
---
# ux-screen

This is a shortcut for the `screen` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `screen $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `screen`** section verbatim with `screen $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat.
