---
name: ux-plan
description: "Plan one feature before code: PRD via /write-spec, JTBD, Intent flows + IA + localize, ux-heuristics with RTL, optional Claude Design mockup, ends with the screen list. Use when Nadav types /ux-plan <feature> or asks to plan a feature the right way. Thin shortcut: runs the `plan` mode of the nadav-design skill."
argument-hint: "<feature>"
---
# ux-plan

This is a shortcut. Do exactly what the `plan` mode of the **nadav-design** skill says, with `$ARGUMENTS` as its argument.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules** section and its **Mode `plan`** section. Follow them verbatim: one step at a time, evidence after every step, stop on failure, Hebrew chat, logical CSS only, never craft/bolder/overdrive/delight.
3. Print the mode's step checklist first, then start step 1.
