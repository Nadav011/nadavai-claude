---
name: ux-setup
description: "One-time UI/UX setup of a project (Next or Vite): clean slate of any old design system, RTL infra (shadcn rtl + eslint-plugin-tailwind-rtl), one Hebrew font, tokens + dark + reduced-motion, multi-brand check, PRODUCT.md with voice, DESIGN.md, rules layer (.claude/rules/ui.md), shadcn MCP, mobile shell (TWA/Capacitor/PWA), foundations (error/empty/loading states, toaster, Intl format, zod he), styleguide route, DoD gate, release wiring (PostHog, Argos, accessibility + privacy pages, lint:ui), enforcement (pre-commit, CI, PR template). Use when Nadav types /ux-setup or asks to set up the design environment on a project. Thin shortcut: runs the `setup` mode of the nadav-design skill."
---
# ux-setup

This is a shortcut. Do exactly what the `setup` mode of the **nadav-design** skill says, with `$ARGUMENTS` as its argument.

1. Locate the master skill file, in this order: `~/nadavai/plugins/nadavai/skills/nadav-design/SKILL.md`; otherwise the newest `skills/nadav-design/SKILL.md` under `~/.claude/plugins/cache/nadavai/`; otherwise `~/.claude/skills/nadav-design/SKILL.md`. If none exists, tell Nadav in one line and stop.
2. Read its **Hard rules** section and its **Mode `setup`** section. Follow them verbatim: one step at a time, evidence after every step, stop on failure, Hebrew chat, logical CSS only, never craft/bolder/overdrive/delight.
3. Print the mode's step checklist first, then start step 1.
