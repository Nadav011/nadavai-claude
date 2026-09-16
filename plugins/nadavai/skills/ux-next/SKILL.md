---
name: ux-next
description: Where this project stands in the UI/UX loop (setup → retro → audit → screen → ship) and the next one to three commands to run, read from .omc/design-runs, the setup files and docs/ui-audit/PLAN.md. Use when Nadav types /ux-next, asks "what now", "what is next", "where were we", "what did I forget", or forgets the order. Thin shortcut: runs the `next` mode of the nadav-design skill. Starts nothing.
---
# ux-next

This is a shortcut. Do exactly what the `next` mode of the **nadav-design** skill says.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules**, **Mode `retro`** step 4b and **Which mode when**. Run the gap scan, then print in Hebrew: the position in the loop, the last recorded run, and the next commands with one reason each. Do not start any mode.
