---
name: ux-retro
description: Retrospective on the last /ux-setup, /ux-plan, /ux-screen, /ux-audit or /ux-ship run: which steps were skipped, batched, done without evidence or failed, which thresholds were lowered, which tools misfired, then approved edits to the nadav-design skill, its templates and rules in ~/nadavai. Use when Nadav types /ux-retro or asks "what did the skill miss", "how to improve the skill", "update the skill from this run". Thin shortcut: runs the `retro` mode of the nadav-design skill. Never touches the project.
---
# ux-retro

This is a shortcut. Do exactly what the `retro` mode of the **nadav-design** skill says, with `$ARGUMENTS` as its argument.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules** section and its **Mode `retro`** section. Follow them verbatim: one step at a time, evidence after every step, stop for approval before applying anything, Hebrew chat.
3. Print the mode's step checklist first, then start step 0.
