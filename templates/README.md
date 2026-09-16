# Templates installed into projects by /ux-setup (nadav-design skill) and rules/design-init.md

- `dod/`: the Definition-of-Done Playwright gate (`e2e/dod/` + `playwright.dod.config.ts`). See its README.
- `ui-rules/ui.md`: the path-scoped project rule `.claude/rules/ui.md`. Placeholders: `{UI_GLOB}`
  (`app/**` and `components/**` for Next, `src/**` for Vite), `{TOKENS}` (the token CSS file),
  `{PM}` / `{PM_DLX}` (`pnpm` / `pnpm dlx`, or the project's manager).
- `ci/ui.yml`: GitHub workflow `.github/workflows/ui.yml` running `lint:ui` and `dod`, uploading
  `reports/dod`, sending screenshots to Argos when `ARGOS_TOKEN` is set.
- `ci/lighthouserc.json`: Lighthouse CI budget (mobile preset, he locale; performance >= 0.95, accessibility, best-practices and seo = 1, LCP <= 2.0s, CLS <= 0.05, TBT <= 150ms, TTI <= 3s; never lowered to pass). Placeholders: `{PORT}`, `{START_CMD}` (`pnpm start`, or `pnpm preview --port` for Vite). The `lighthouse` job in `ui.yml` runs it.
- `ci/PULL_REQUEST_TEMPLATE.md`: the UI checklist for `.github/PULL_REQUEST_TEMPLATE.md`.
- `design/base.css` + `design/DESIGN-base.md`: the structural house base every app imports (type scale, spacing, motion, layers, touch, safe-area, focus, reduced-motion). Never colors, font family or radius personality: those stay per app, so apps do not look alike.
