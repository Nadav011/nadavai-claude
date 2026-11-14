# nadav-design · mode `audit`

## Mode `audit` (deep, every screen, no fixes)

Part of the nadav-design skill. Before this file read the Hard rules of `SKILL.md`, then `shared/rules.md`
and `shared/platform.md`. Every path here is relative to the skill folder, one level above this file.


This is the full preparation Nadav wants on an existing project before any renovation starts. Cover every screen, not only the main one.

1. Declare the tempo and the track. Confirm every **Setup artifact** (Hard rules) exists. If not, say "run `/ux-setup` first" with the missing list and stop.
1b. **Measurement first.** In an app that has a preview on invented data, read `shared/built-once.md` in full before starting, opening or screenshotting it. `node e2e/dod/routes.mjs` (so every route is included). Scores from the nightly when it covers main's tree; screenshots from its `dod-report` artifact unzipped into `reports/dod/` when it holds them, otherwise `heavy-slot -- PM dod`; Lighthouse likewise (`shared/rules.md`, «Where checks run»). Every later step reads these screenshots (`reports/dod/screens/<slug>__{375,1440}__{light,dark}.png`) and scores instead of taking them again. Evidence: `reports/dod/dod.json`, `.lighthouseci/`.
2. **Inventory.** List every route (Next: `find app -name page.tsx`; Vite: the router file), every shared layout, and every component under components/ with its usage count. Mark screens as critical (auth, signup, onboarding, checkout, payment, account) or normal. Save to `docs/ui-audit/INVENTORY.md`. Evidence: the file.
3. **Per screen, in inventory order** (one screen per step, evidence after each): `/impeccable critique` (the skill names it, per the carve-out in guides/ui-routing.md); look at the four DoD screenshots of the route from step 1b; note visible issues. For critical screens also `/interfaces:better-interface` (the owner for an existing screen; `interface-review` needs a diff and there is none here). Append findings to `docs/ui-audit/<route-slug>.md`.
4. **Codebase-wide.** Detect with the plugin's launcher, which is newer than the pinned npm package (`"$(ls -d ~/.claude/plugins/cache/impeccable/impeccable/*/skills/impeccable/scripts/impeccable | sort -V | tail -1)" detect UI_DIRS`); `npx eslint . ` (tailwind-rtl rule count); `grep` for stray hex colors, physical direction classes, `transition: all`, fonts loaded; `/improve-animations` (Emil, read-only) if any motion exists. Evidence: counts and the report paths.
5. **Detailed measurement.** `chrome-devtools lighthouse_audit` (the DevTools CLI; the MCP server is off) on the three main screens for the accessibility, best-practices and SEO detail (it leaves performance out; performance numbers come from `lhci`, and the numbers per route from step 1b). Evidence: the three reports.
6. **Tokens vs reality.** Compare DESIGN.md tokens with what screens actually use; list drift (colors, radii, fonts, spacing outside the scale). Evidence: the list.
7. **Renovation plan.** Every finding from steps 3-6 ends in this file as a `- [ ]` item with a priority, or is marked fixed, or is recorded in DESIGN.md as a knowing exception: nothing stays a sentence in the report. Write `docs/ui-audit/PLAN.md`: per screen a P0-P3 list as `- [ ]` checkboxes with file:line (the `screen` mode ticks them, and `next` reads them), the recommended order of `/nadav-design screen <name>` runs (critical + most P0 first), what is shared (fix once in components/ before screens), and an estimate per screen. Show it to Nadav and stop. Nothing is fixed in this mode.
