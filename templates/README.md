# Templates installed into projects by /ux-setup (nadav-design skill) and rules/design-init.md

- `dod/`: the Definition-of-Done Playwright gate (`e2e/dod/` + `playwright.dod.config.ts`). See its README.
- `ui-rules/ui.md`: the path-scoped project rule `.claude/rules/ui.md`. Placeholders: `{UI_GLOB}`
  (`app/**` and `components/**` for Next, `src/**` for Vite), `{TOKENS}` (the token CSS file),
  `{PM}` / `{PM_DLX}` (`pnpm` / `pnpm dlx`, or the project's manager).
- `ci/ui.yml`: GitHub workflow `.github/workflows/ui.yml` running `lint:ui` and `dod`, uploading
  `reports/dod`, sending screenshots to Argos when `ARGOS_TOKEN` is set.
- `ci/PULL_REQUEST_TEMPLATE.md`: the UI checklist for `.github/PULL_REQUEST_TEMPLATE.md`.
