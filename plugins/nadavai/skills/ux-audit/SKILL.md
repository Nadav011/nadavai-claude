---
name: ux-audit
description: Deep preparation of an existing project before any renovation: inventory of every route and component, critique + screenshots per screen, interfaces on critical screens, detector/eslint/animation audit codebase-wide, web-quality + DoD on all routes, token drift, and a renovation plan in docs/ui-audit/PLAN.md. No fixes. Use when Nadav types /ux-audit or asks for a full UI audit / map before renovations. Thin shortcut: runs the `audit` mode of the nadav-design skill.
---
# ux-audit

This is a shortcut. Do exactly what the `audit` mode of the **nadav-design** skill says, with `$ARGUMENTS` as its argument.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules** section and its **Mode `audit`** section. Follow them verbatim: one step at a time, evidence after every step, stop on failure, Hebrew chat, logical CSS only, never craft/bolder/overdrive/delight.
3. Print the mode's step checklist first, then start step 1.
