# nadavai

Nadav Cohen's Claude Code environment as one installable bundle. One `claude plugin install`
brings every plugin, skill and hook; `setup.sh` adds the parts a plugin cannot deliver (rules,
settings defaults, git hooks). Push here, and every machine picks the change up.

No secrets live in this repo. OAuth logins, API keys and tokens stay per machine.

## What is inside

| Part | Where | Delivered by |
|---|---|---|
| Bundle plugin `nadavai` | `plugins/nadavai/` | `claude plugin install nadavai@nadavai` |
| Dependencies: oh-my-claudecode (OMC), i-have-adhd, context7, typescript-lsp, pyright-lsp, playwright, supabase, chrome-devtools-mcp, cloudflare, sentry, skill-creator | `plugins/nadavai/.claude-plugin/plugin.json` | installed and enabled automatically with the bundle |
| Skills: qa-report, vercel-react-best-practices, vercel-composition-patterns, hebrew-rtl-best-practices, hebrew-i18n, israeli-accessibility-compliance, capacitor-app-development, capacitor-plugins | `plugins/nadavai/skills/` | the bundle (invoked as `/nadavai:<skill>` or by trigger) |
| Repo-sync hooks (SessionStart status, PostToolUse edit reminder) | `plugins/nadavai/hooks/`, `plugins/nadavai/scripts/` | the bundle |
| Rules (working agreement, OMC team size, nadavai, project re-init) | `rules/` | `setup.sh` symlinks `~/.claude/rules` here |
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

Then open Claude Code once and run `/mcp` to sign in to Supabase, Cloudflare and Sentry.
`claude doctor` and `omc doctor conflicts` should both come back clean.

`setup.sh` is idempotent. Anything it replaces (an existing `rules/` dir, user-level skill copies,
`settings.json`) is moved to `~/.claude/nadavai-backup-<timestamp>/`.

The clone must be at `~/nadavai`, or set `NADAVAI_HOME` for the hooks and scripts.

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
