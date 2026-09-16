# Templates installed into projects by /ux-setup (nadav-design skill)

Thresholds live only in `ci/lighthouserc.json` and `dod/e2e/dod/dod-shared.ts`; nothing here repeats them.

- `dod/`: the Definition-of-Done Playwright gate (`e2e/dod/` + `playwright.dod.config.ts`). See its README.
- `ui-rules/ui.md`: the path-scoped project rule `.claude/rules/ui.md`. Placeholders: `{TOKENS}` (the token CSS file),
  `{PM}` / `{PM_DLX}` (`pnpm` / `pnpm dlx`, or the project's manager).
- `ci/ui.yml`: GitHub workflow `.github/workflows/ui.yml`: `lint:ui`, `dod` (fails below 100), Lighthouse CI, Argos when `ARGOS_TOKEN` is set. Written for pnpm 10; on npm, yarn or bun replace the setup action and every `pnpm` command (setup step 14b).
- `ci/lighthouserc.json`: Lighthouse CI budget (`@lhci/cli` is a devDependency, run with `pnpm exec lhci autorun`; product routes only, never the noindex styleguide). Placeholders: `{PORT}`, `{START_CMD}` (`pnpm start` on Next after a build, `pnpm preview --port PORT` on Vite).
- `ci/PULL_REQUEST_TEMPLATE.md`: the UI checklist for `.github/PULL_REQUEST_TEMPLATE.md`. Placeholder: `{PM}`.
- `design/base.css` + `design/DESIGN-base.md`: the structural house base every app imports. Never colors, font family or radius personality.
- `git/hooks/pre-commit` (global, via `~/.git-hooks`): runs eslint `--max-warnings=0` + impeccable detect on staged files in any repo whose package.json has `lint:ui`. Never install husky in a project: it shadows the global hooks (commit-msg, pre-push, Cloudflare deploy).
