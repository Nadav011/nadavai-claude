# nadavai

Nadav Cohen's Claude Code environment as one installable bundle. One `claude plugin install`
brings every plugin, skill and hook; `setup.sh` adds the parts a plugin cannot deliver (rules,
settings defaults, git hooks). Push here, and every machine picks the change up.

The GitHub repo is `Nadav011/nadavai-claude` (`Nadav011/nadavai` is the portfolio site); the marketplace and the plugin are both named `nadavai`, so the plugin id is `nadavai@nadavai`.

No secrets live in this repo. OAuth logins, API keys and tokens stay per machine.

## What is inside

| Part | Where | Delivered by |
|---|---|---|
| Bundle plugin `nadavai` | `plugins/nadavai/` | `claude plugin install nadavai@nadavai` |
| Dependencies: oh-my-claudecode (OMC), i-have-adhd, context7, typescript-lsp, pyright-lsp, playwright, supabase, chrome-devtools-mcp, cloudflare, skill-creator; UI/UX and product layer: impeccable, intent, interfaces, ux-design, product-innovation, posthog | `plugins/nadavai/.claude-plugin/plugin.json` | installed and enabled automatically with the bundle |
| Skills: nadav-design + ux-setup / ux-plan / ux-screen / ux-audit / ux-ship / ux-retro / ux-next (the UI/UX loop), qa-report, vercel-react-best-practices, vercel-composition-patterns, vercel-react-view-transitions, hebrew-rtl-best-practices, hebrew-i18n, hebrew-tailwind-preset, israeli-accessibility-compliance, capacitor-app-development, capacitor-plugins, shadcn, animate, review-animations, improve-animations, find-animation-opportunities, emil-design-eng, mobile-native, prototype, argos-cli, argos-pr-review, argos-upload; product skills write-spec, roadmap-update, sprint-planning, stakeholder-update, synthesize-research, competitive-brief, metrics-review, product-brainstorming | `plugins/nadavai/skills/` | the bundle (invoked as `/nadavai:<skill>` or by trigger) |
| Bright Data MCP (search engine, unblocked scrape, Reddit/X/YouTube data; groups social, research, advanced_scraping) | `plugins/nadavai/mcp.json` (not `.mcp.json`: the global gitignore drops that name) | the bundle; needs `BRIGHTDATA_API_TOKEN` per machine, see Secrets |
| Repo-sync hooks (SessionStart status, PostToolUse edit reminder) and the SessionStart project check (re-init pending while `PROJECT-FACTS.md` exists, UI LOOP next command from the tracked setup artifacts, design layer pending while a UI project lacks `DESIGN.md` or `PRODUCT.md`) | `plugins/nadavai/hooks/`, `plugins/nadavai/scripts/` | the bundle |
| Rules (working agreement, OMC team size, nadavai, project re-init, design-init with impeccable) | `rules/` | `setup.sh` symlinks `~/.claude/rules` here |
| Templates that /ux-setup copies into a project: DoD gate (`dod/`), project UI rule (`ui-rules/`), CI gate + Lighthouse budget + PR template (`ci/`), structural house base (`design/`) | `templates/` | see `templates/README.md` |
| Settings defaults (model, effort, Hebrew, auto permissions, agent teams, enabled plugins, marketplaces with auto-update) | `settings/settings.base.json` | `setup.sh` deep-merges into `~/.claude/settings.json` |
| Global git hooks (Conventional Commits, Trivy + typecheck pre-push, Cloudflare Pages auto-deploy) and global ignore | `git/` | `setup.sh` symlinks `~/.git-hooks` and `~/.config/git/ignore` here |
| claude-seo (AgriciDaniel) installed but disabled | `setup.sh` | enable per marketing repo, see SEO below |
| OMC CLI, `~/.claude/CLAUDE.md` (OMC block), HUD statusline | `setup.sh` runs `omc setup` | |
| i-have-adhd always-on flag | `setup.sh` touches `~/.claude/.i-have-adhd-always` | |

Not included, by design: OAuth sessions (`/mcp` once per machine), Claude in Chrome (built in),
system tools (pnpm, gh, trivy, delta, Playwright browsers, Android SDK, Maestro, tmux; `setup.sh`
lists what is missing), per-project files (`.mcp.json`, `.omc/`, project CLAUDE.md), and
machine-specific hooks already in `~/.claude/settings.json` (they survive the merge).

## Install on a new machine

```bash
# prerequisites: Claude Code, git, Node 20+, gh (logged in)
mv ~/.claude ~/.claude.old-$(date +%Y%m%d)   # only on a machine with an old setup; never claude-sync
git clone https://github.com/Nadav011/nadavai-claude ~/nadavai
~/nadavai/setup.sh
```

Then open Claude Code once and run `/mcp` to sign in to Supabase, Cloudflare and PostHog.
`claude doctor` and `omc doctor conflicts` should both come back clean.

`setup.sh` is idempotent. Anything it replaces (an existing `rules/` dir, user-level skill copies,
`settings.json`) is moved to `~/.claude/nadavai-backup-<timestamp>/`.

The clone must be at `~/nadavai`, or set `NADAVAI_HOME` for the hooks and scripts.

## Secrets (per machine, never in the repo)

The Bright Data server reads its token from the `BRIGHTDATA_API_TOKEN` environment variable. Put it in
`~/.claude/settings.json` so every launcher (terminal, IDE, desktop app) sees it:

```json
{ "env": { "BRIGHTDATA_API_TOKEN": "your-token" } }
```

`setup.sh` keeps local keys like this one when it merges `settings.base.json`. Free tier: 5,000 credits a month,
no card; leave auto-recharge off. Structured `web_data_*` calls cost one credit per record returned. Verified 2026-09-16: `web_data_reddit_posts` returns the post with its comments, `web_data_youtube_videos` returns transcript, chapters and comments (1 to 3 minutes per call); `scrape_as_markdown` on reddit.com is refused without KYC, so use the data tools for Reddit.

## Daily cycle: change something

1. Edit in `~/nadavai` (rules are symlinked there, so editing `~/.claude/rules/x.md` is the same).
2. Commit with a Conventional Commit message and push.
3. Run `~/nadavai/update.sh` on this machine to install the pushed version now.

Every other machine has `autoUpdate: true` for this marketplace, so it picks the change up on its
next Claude Code start; `update.sh` there forces it immediately and refreshes the symlinks.

Two reminders keep this honest:

- **SessionStart**: if the clone has uncommitted or unpushed changes, if origin is ahead, or if the
  installed plugin is behind the clone, Claude says so once at the start of the session.
- **PostToolUse**: when Claude edits a file inside the clone (or inside the installed plugin copy,
  which would be lost on update), it is told to commit, push and run `update.sh`.

Never edit `~/.claude/plugins/cache/nadavai/...` or `~/.claude/skills/<plugin skill>`: the first is
overwritten on update, the second shadows the plugin copy (`omc doctor conflicts` reports it).

`update.sh --all` also refreshes every other marketplace and dependency plugin.

## Pin or move a dependency

Dependencies track their marketplace's latest version. To hold one, add a semver range in
`plugins/nadavai/.claude-plugin/plugin.json`, for example
`{ "name": "oh-my-claudecode", "marketplace": "omc", "version": "~5.4.0" }` (the upstream must tag
releases as `<plugin>--v<version>`; OMC does). To add a plugin for every machine: add it to
`dependencies`, add its marketplace to `allowCrossMarketplaceDependenciesOn` in
`.claude-plugin/marketplace.json` and to `add_marketplace` in `setup.sh`, push, `update.sh`.

## SEO

claude-seo is installed everywhere but disabled globally. In a marketing repo, enable it for that
project only: `.claude/settings.local.json` with `{ "enabledPlugins": { "claude-seo@agricidaniel-claude-seo": true } }`,
then `/seo setup` and `/seo google setup`. Day-to-day development keeps it off.

## Sources and licenses

Own content (rules, scripts, qa-report) is MIT. Bundled skills keep their upstream licenses:

| Skill | Upstream |
|---|---|
| qa-report | own; health rubric adapted from gstack `qa-only` (MIT, Garry Tan) |
| vercel-react-best-practices, vercel-composition-patterns | vercel-labs/agent-skills |
| capacitor-app-development, capacitor-plugins | capawesome-team/skills |
| hebrew-rtl-best-practices, hebrew-i18n, israeli-accessibility-compliance | installed 2026-09-16 with `npx skills add`; see each SKILL.md |
| animate, review-animations, improve-animations, find-animation-opportunities, emil-design-eng, mobile-native, prototype, shadcn, argos-*, vercel-react-view-transitions, hebrew-tailwind-preset | added in the UI/UX phase, 2026-09-16; upstream noted in each SKILL.md |
| write-spec, roadmap-update, sprint-planning, stakeholder-update, synthesize-research, competitive-brief, metrics-review, product-brainstorming | anthropics/knowledge-work-plugins (product-management), Apache-2.0; copied so the plugin's 16 unused MCP connectors do not load |
