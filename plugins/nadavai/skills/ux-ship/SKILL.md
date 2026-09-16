---
name: ux-ship
description: "Release gate, measurement only (wiring was done by /ux-setup): pre-flight, web-quality audit (Addy), IS 5568 + accessibility statement + privacy, DoD 100, Argos baseline, device check in the TWA/Capacitor shell, copy pass against the product voice, SEO pass, /intent:measure + PostHog events, funnel and replay review. Use when Nadav types /ux-ship or asks to prepare for release. Thin shortcut: runs the `ship` mode of the nadav-design skill."
---
# ux-ship

This is a shortcut for the `ship` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `ship $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `ship`** section verbatim with `ship $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat.
