---
name: ux-retro
description: "Retrospective on the last /ux-setup, /ux-plan, /ux-screen, /ux-audit or /ux-ship run: which steps were skipped, batched, done without evidence or failed, which thresholds were lowered, which tools misfired, what Nadav himself has not run yet in the project (gap scan across setup/plan/screen/audit/ship, proposed as the next commands), tool freshness, then approved edits to the nadav-design skill, its templates and rules in ~/nadavai. Use when Nadav types /ux-retro or asks \"what did the skill miss\", \"how to improve the skill\", \"update the skill from this run\". Thin shortcut: runs the `retro` mode of the nadav-design skill. Never touches the project."
---
# ux-retro

This is a shortcut for the `retro` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `retro $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `retro`** section verbatim with `retro $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat. Stop for approval before applying anything.
