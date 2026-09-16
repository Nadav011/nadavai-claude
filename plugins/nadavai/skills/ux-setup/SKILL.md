---
name: ux-setup
description: "One-time UI/UX setup of a project (Next or Vite): clean slate of any old design system, RTL infra (shadcn rtl + eslint-plugin-tailwind-rtl), one Hebrew font, tokens + dark + reduced-motion, multi-brand check, PRODUCT.md with voice, DESIGN.md, rules layer (.claude/rules/ui.md), shadcn MCP, mobile shell (TWA/Capacitor/PWA), foundations (error/empty/loading states, toaster, Intl format, zod he), styleguide route, DoD gate, release wiring (PostHog, Argos, accessibility + privacy pages, lint:ui), enforcement (pre-commit, CI, PR template). Use when Nadav types /ux-setup or asks to set up the design environment on a project. Thin shortcut: runs the `setup` mode of the nadav-design skill."
---
# ux-setup

This is a shortcut for the `setup` mode of the **nadavai:nadav-design** skill. Same plugin, same version, always.

1. Invoke the Skill tool with skill `nadavai:nadav-design` and args `setup $ARGUMENTS` (the mode word first, then whatever Nadav typed). If the Skill tool cannot load it, read `${CLAUDE_PLUGIN_ROOT}/skills/nadav-design/SKILL.md` and follow its **Hard rules** and its **Mode `setup`** section verbatim with `setup $ARGUMENTS` as `$ARGUMENTS`. Never look for the master anywhere else.
2. Start at the first step of that section (step 0 where it exists), one step at a time, evidence after every step, stop on failure, Hebrew chat.
