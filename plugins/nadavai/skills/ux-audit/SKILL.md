---
name: ux-audit
description: "Deep preparation of an existing project before any renovation: inventory of every route and component, critique + screenshots per screen, interfaces on critical screens, detector/eslint/animation audit codebase-wide, web-quality + DoD on all routes, token drift, and a renovation plan in docs/ui-audit/PLAN.md. No fixes. Use when Nadav types /ux-audit or asks for a full UI audit / map before renovations. Thin shortcut: runs the `audit` mode of the nadav-design skill."
---
# ux-audit

This is a shortcut for the `audit` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `audit $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `audit`** section verbatim with `audit $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat.
