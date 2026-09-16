# Design layer setup with impeccable (after the 2026-09 clean install)

Applies when the project root has a `package.json` that lists a UI framework (react, next,
vite, vue, svelte) and is missing `DESIGN.md` or `PRODUCT.md`. Those two files are the only
state: once both exist this rule is inert. Every old design-system and token document was
removed from all repos on 2026-09-16 (backups under
`~/Desktop/claude-backup-20260915/projects/<repo>/design/`) so that the new files are derived
from the code alone; never merge the old documents back in.

If Nadav runs `/ux-setup` (the nadav-design skill), it covers these six steps and more (rules layer,
mobile shell, foundations, styleguide route, release wiring, enforcement): follow it instead and do
not run the six steps twice. This rule is the minimum path when he does not.

If `PROJECT-FACTS.md` also exists, finish `project-reinit.md` first (through its commit), then
start here. Tell Nadav in one short Hebrew message that the design layer is pending and that the
six steps below run in this session, in order, one at a time. Nadav types the slash commands;
you run the terminal commands and the edits. Use the repo's package manager (read the lockfile)
and commit after every step that changes files, because each step is a checkpoint Nadav may
want to revert alone. Skip a sub-step that is already in place and say so.

1. RTL infrastructure.
   - With shadcn (`components.json` exists): set `"rtl": true` in `components.json`, then run
     `pnpm dlx shadcn@latest migrate rtl`. Without shadcn: `pnpm dlx shadcn@latest init --rtl`.
   - `pnpm add -D eslint-plugin-tailwind-rtl`, register `tailwindRtl.configs["recommended-tailwind"]`
     in the flat `eslint.config.*`, then `npx eslint --fix .`. It rewrites `ml/mr/pl/pr/left/right`
     to logical classes; review the diff, because anything inside a `dir="ltr"` element must stay
     physical. Commit `chore(rtl): shadcn rtl mode and tailwind-rtl lint`.
2. `PRODUCT.md`: Nadav runs `/impeccable init` (allow the launcher with "always allow" the first
   time). It interviews through AskUserQuestion; answer from `CLAUDE.md`, `STATUS.md` and the
   README where they already hold the fact, and ask Nadav only what they do not. Make sure the
   constraints say "Hebrew RTL-first, logical properties only". Commit.
3. `DESIGN.md` from the existing code: Nadav runs `/impeccable document` (scan mode). It extracts
   the colours, fonts and spacing that already live in the project's token file (`globals.css`,
   `index.css` or `tokens.css`) and writes frontmatter tokens plus prose. This is the moment to
   clean: remove duplicate colours, keep one Hebrew font and one accent. Then
   `npx @google/design.md lint DESIGN.md` must pass. Commit.
4. State map, no fixes yet: Nadav runs `/impeccable critique` on the main screen; you run the
   detector on the UI source directory with the plugin's own launcher, which is the current
   version of `npx impeccable detect`:
   `"$(ls -d ~/.claude/plugins/cache/impeccable/impeccable/*/skills/impeccable/scripts/impeccable | tail -1)" detect <src-dir>`.
   Record the ranked findings in `STATUS.md` or `BACKLOG.md` (referenced by path).
5. Fix in order: `/impeccable polish` (within the existing design language), then
   `/impeccable harden` (edge cases, RTL, long text, empty and error states). One screen at a
   time, one commit per screen, with browser evidence as the global working-style rule requires.
6. Gate: copy `~/nadavai/templates/dod/` into the project as described in its README
   (`e2e/dod/` plus `playwright.dod.config.ts`, so it never collides with the project's own
   Playwright suite), fill `e2e/dod/routes.json` with the real routes, set the dev command and
   port in the config, add `"dod": "playwright test -c playwright.dod.config.ts"` to
   `package.json`, install `@playwright/test` and `@axe-core/playwright` when missing, and ignore
   `reports/` and `test-results/`. Run `pnpm dod`: it never fails on findings, it writes
   `reports/dod/dod.json` with a score (100 minus overflow, axe, console errors, fonts over two,
   touch targets, reduced-motion violations). Add this line to `CLAUDE.md`, naming the real
   token file: "Before any UI work read DESIGN.md and PRODUCT.md. Use only tokens from
   globals.css." Commit.

Also run, only when relevant: `/nadavai:review-animations` if the project has animations,
`/interfaces:better-interface` on one critical screen, and before a release the go-live pass from
working-style.md (claude-seo `/seo audit` plus `lighthouse_audit` through the Chrome DevTools MCP).

Never run `/impeccable craft`, `bolder` or `overdrive` on an existing app: they replace the
incumbent look and produce the generic "Impeccable look" instead of polishing the product's own.
