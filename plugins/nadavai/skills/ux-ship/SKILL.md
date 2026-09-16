---
name: ux-ship
description: "Release gate, measurement only (wiring was done by /ux-setup): pre-flight, web-quality audit (Addy), IS 5568 + accessibility statement + privacy, DoD 100, Argos baseline, device check in the TWA/Capacitor shell, copy pass against the product voice, SEO pass, /intent:measure + PostHog events, funnel and replay review. Use when Nadav types /ux-ship or asks to prepare for release. Thin shortcut: runs the `ship` mode of the nadav-design skill."
---
# ux-ship

This is a shortcut. Do exactly what the `ship` mode of the **nadav-design** skill says, with `$ARGUMENTS` as its argument.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules** section and its **Mode `ship`** section. Follow them verbatim: one step at a time, evidence after every step, stop on failure, Hebrew chat, logical CSS only, never craft/bolder/overdrive/delight.
3. Print the mode's step checklist first, then start step 1.
