---
name: ux-screen
description: "Build or redesign ONE screen through the full loop: brief, shadcn on DESIGN.md tokens, /impeccable critique + harden, /review-animations, interfaces review if critical, detect + eslint, DoD, screenshots, commit. Use when Nadav types /ux-screen <name> or asks to build/redesign screen X the right way. Thin shortcut: runs the `screen` mode of the nadav-design skill."
argument-hint: "<screen name>"
---
# ux-screen

This is a shortcut. Do exactly what the `screen` mode of the **nadav-design** skill says, with `$ARGUMENTS` as its argument.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules** section and its **Mode `screen`** section. Follow them verbatim: one step at a time, evidence after every step, stop on failure, Hebrew chat, logical CSS only, never craft/bolder/overdrive/delight.
3. Print the mode's step checklist first, then start step 1.
