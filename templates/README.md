# Templates installed into projects by /ux-setup (nadav-design skill)

Thresholds live only in `ci/lighthouserc.json` and `dod/e2e/dod/dod-shared.ts`; nothing here repeats them.

- `dod/`: the Definition-of-Done Playwright gate (`e2e/dod/` + `playwright.dod.config.ts`). See its README.
- `ui-rules/ui.md`: the path-scoped project rule `.claude/rules/ui.md`. Placeholders: `{UI_GLOB}`
  (`app/**` and `components/**` on Next, `src/**` on Vite), `{TOKENS}` (the token CSS file),
  `{PM}` / `{PM_DLX}` (`pnpm` / `pnpm dlx`, or the project's manager).
- `ci/ui.yml`: GitHub workflow `.github/workflows/ui.yml`: `lint:ui`, `dod` (fails below 100), Lighthouse CI, Argos when `ARGOS_TOKEN` is set.
- `ci/lighthouserc.json`: Lighthouse CI budget. Placeholders: `{PORT}`, `{START_CMD}` (`pnpm start` on Next after a build, `pnpm preview --port PORT` on Vite).
- `ci/PULL_REQUEST_TEMPLATE.md`: the UI checklist for `.github/PULL_REQUEST_TEMPLATE.md`.
- `design/base.css` + `design/DESIGN-base.md`: the structural house base every app imports. Never colors, font family or radius personality.
