# nadavai

Nadav Cohen's Claude Code environment as one installable bundle. One `claude plugin install`
brings every plugin, skill and hook; `setup.sh` adds the parts a plugin cannot deliver (rules,
settings defaults, git hooks). Push here, and every machine picks the change up.

The GitHub repo is `Nadav011/nadavai-claude` (`Nadav011/nadavai` is the portfolio site); the marketplace and the plugin are both named `nadavai`, so the plugin id is `nadavai@nadavai`.

No secrets live in this repo. OAuth logins, API keys and tokens stay per machine.

WhatsApp access uses the local upstream `wacli` CLI through
[`plugins/nadavai/skills/wacli/SKILL.md`](plugins/nadavai/skills/wacli/SKILL.md),
with routing in `rules/whatsapp.md`. Continuous capture is opt-in per machine:
the skill documents local installation and a symlink to
[`systemd/user/wacli-sync.service`](systemd/user/wacli-sync.service) and its
`wacli-auth-check.py` helper (requires Python 3, Bash, and jq). Pair on
each approved host; session keys and the private `~/.local/state/wacli` archive
stay there. Updates do not enable this service on other machines, and capture
does not automatically reply or require a browser.

`bin/orca-rtl-apply` makes Hebrew read right-to-left in Orca's terminal panes (and in its
native chat and the paired phone's terminal). It patches Orca's bundled xterm DOM renderer
with `unicode-bidi: plaintext` per row (engine in `lib/orca-rtl/patch.mjs`, idempotent,
originals kept in `~/.local/share/orca-rtl/backup-<version>/`; `bin/orca-rtl-remove` restores
them). It needs Orca's Settings → Terminal → GPU acceleration set to Off, because under WebGL
the patch is inert. To re-apply after every Orca update, opt in per machine: symlink
`systemd/user/orca-rtl-reapply.{path,service}` into `~/.config/systemd/user/` and run
`systemctl --user enable --now orca-rtl-reapply.path`.

`bin/worktree-clean` finds git worktrees nobody needs any more (clean and idle, or idle a week with
unsaved work). By default it only reports: it writes `~/Archive/worktree-clean/<date>/REPORT.md` with every
candidate, what removing it would do, and every kept worktree with its reason, and it changes nothing in
any repo. The weekly timer runs exactly that report and never removes anything (Nadav, 2026-11-03).
Removal happens only with `--apply`, run by a person or the owner session; it first saves unsaved work
under `refs/worktree-clean/` and `~/Archive/worktree-clean/`. `--dry-run` prints the report and writes
nothing. It never touches what an owner listed in [`config/worktree-clean.json`](config/worktree-clean.json)
(`~/.config/nadavai/worktree-clean.json` can add more), a worktree whose Claude, Codex or Grok transcript
changed in the last 3 days, one Orca shows a live terminal or agent in, one mid-rebase or mid-merge, or one
with another worktree or repo inside it. It never prunes stale `git worktree` entries itself; Orca's own
removal during `--apply` may prune them, so right before it the tool pins every stale HEAD no ref reaches
and locks every stale entry an owner rule protects, and Orca may prune the unprotected rest.
The weekly report is opt-in per machine, on the machine where agents create worktrees: symlink
[`systemd/user/worktree-clean.service`](systemd/user/worktree-clean.service) and `.timer` into
`~/.config/systemd/user/` and `systemctl --user enable --now worktree-clean.timer`. Tests:
`tests/worktree-clean.sh`.

## What is inside

| Part | Where | Delivered by |
|---|---|---|
| Bundle plugin `nadavai` | `plugins/nadavai/` | `claude plugin install nadavai@nadavai` |
| Dependencies: oh-my-claudecode (OMC), i-have-adhd, context7, typescript-lsp, pyright-lsp, playwright, supabase, chrome-devtools-mcp, cloudflare, skill-creator; UI/UX and product layer: impeccable, intent, interfaces, ux-design, product-innovation, posthog | `plugins/nadavai/.claude-plugin/plugin.json` | installed and enabled automatically with the bundle |
| Skills: nadav-design + ux-setup / ux-plan / ux-screen / ux-audit / ux-redesign / ux-ship / ux-retro / ux-next (the UI/UX loop), qa-report, machine-checkup (machine cleanup, freeze diagnosis, inventory, and the update/driver audit), machine-provision (set up a second machine to match this one, proven by a diff; Chrome and login transfer), client-messages (house style and send process for client messages), desktop-control (computer use without disturbing Nadav: agent-desktop background actions first, real mouse and keys as the last resort; routing in `rules/desktop-control.md`), act-on-behalf (sign-ups, logins and forms in Nadav's name through agent-browser and the vault plugin; rules in `rules/acting-on-behalf.md`), store-apps (web apps into the App Store and Google Play: the model choice, shells, Codemagic builds, store APIs, moving PWA users, and the deploy service's OTA step; routing in `rules/store-apps.md`), vercel-react-best-practices, vercel-composition-patterns, vercel-react-view-transitions, hebrew-rtl-best-practices, hebrew-i18n, hebrew-tailwind-preset, israeli-accessibility-compliance, capacitor-app-development, capacitor-plugins, shadcn, animate, review-animations, improve-animations, find-animation-opportunities, emil-design-eng, mobile-native, prototype, argos-cli, argos-pr-review, argos-upload; product skills write-spec, roadmap-update, sprint-planning, stakeholder-update, synthesize-research, competitive-brief, metrics-review, product-brainstorming; Android: edge-to-edge, agp-9-upgrade, r8-analyzer, play-policy-insights (from Google's android/skills at bf68e2d, Apache-2.0, LICENSE.txt in each, scanned with SkillSpector; local patches: play-policy-insights Mode B `aggregate` subcommand, r8-analyzer runs its scripts with `uv run --with protobuf`, list `keywords` metadata flattened to a string for the Agent Skills spec; play-policy-insights' report step fetches the app's public Play Store page) | `plugins/nadavai/skills/` | the bundle (invoked as `/nadavai:<skill>` or by trigger) |
| Bright Data MCP (search engine, unblocked scrape, Reddit/X/YouTube data; groups social, research, advanced_scraping) | `plugins/nadavai/mcp.json` (not `.mcp.json`: the global gitignore drops that name) | the bundle; needs `BRIGHTDATA_API_TOKEN` per machine, see Secrets |
| Scrapling MCP (free stealth fetch, Cloudflare solving, browser sessions; the first stop before Bright Data, `rules/working-style.md`) | `plugins/nadavai/mcp.json` | the bundle; needs `scrapling` per machine (`system_check` prints the install line) |
| Stop guards on every reply: hebrew-guard (English reply or AskUserQuestion dialog sent back for Hebrew) and candor-guard (praise or agreement before evidence sent back, `rules/candor.md`), once per text per turn through `guard-turn.mjs`; tests in `plugins/nadavai/tests/test-stop-guards.sh` | `plugins/nadavai/scripts/` | the bundle |
| Repo-sync hooks (SessionStart status, PostToolUse edit reminder) and the SessionStart project check (re-init pending while `PROJECT-FACTS.md` exists, UI LOOP next command from the tracked setup artifacts, design layer pending while a UI project lacks `DESIGN.md` or `PRODUCT.md`) | `plugins/nadavai/hooks/`, `plugins/nadavai/scripts/` | the bundle |
| Memory index guard: Claude Code loads only the first 200 lines / 25 KB of a project's `memory/MEMORY.md`, so at SessionStart and after each edit of a memory file it reports an index near (160 lines / 20 KB) or over that limit with compaction steps, broken links, and memory files with no index line; worktrees resolve to the main checkout's memory. Tests in `plugins/nadavai/tests/test-memory-index-check.sh` | `plugins/nadavai/scripts/memory-index-check.mjs` | the bundle |
| Rules (working agreement, candor, OMC team size, nadavai, and the rest of `rules/*.md`) | `rules/` | `setup.sh` symlinks `~/.claude/rules` here |
| On-demand guides (project re-init, design-init, posthog-init): not auto-loaded; `project-check.sh` points to them only when a project needs them | `guides/` | read in place |
| Templates that /ux-setup copies into a project: DoD gate (`dod/`), project UI rule (`ui-rules/`), CI gate + Lighthouse budget + PR template (`ci/`), structural house base (`design/`) | `templates/` | see `templates/README.md` |
| Settings defaults (model, allowed models, effort, Hebrew, bypass permissions, agent teams, enabled plugins, marketplaces with auto-update) | `settings/settings.base.json` | `setup.sh` deep-merges into `~/.claude/settings.json`; `update.sh` re-applies only `model` and `availableModels` |
| Global git hooks (Conventional Commits, Trivy + typecheck pre-push, Cloudflare Pages auto-deploy) and global ignore | `git/` | `setup.sh` symlinks `~/.git-hooks` and `~/.config/git/ignore` here |
| claude-seo (AgriciDaniel) installed but disabled | `setup.sh` | enable per marketing repo, see SEO below |
| OMC CLI, `~/.claude/CLAUDE.md` (OMC block), HUD statusline | `setup.sh` runs `omc setup` | |
| Antigravity bundle (`nadavai` plugin, hooks, MCP servers, marketplace skills/subagents, and mirrored global rules with tool/model adapter) | `plugins/nadavai/.antigravity-plugin/plugin.json`, `plugins/nadavai/hooks.json`, `plugins/nadavai/mcp_config.json`, `~/.gemini/config/` | `setup.sh` and `update.sh` run `mirror_to_antigravity` |
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

## Second machine

`setup.sh` reproduces everything the repo can hold: marketplaces, plugins and their MCP servers,
rules, skills, git hooks, `settings.base.json`, the `bin/` scripts, the omc CLI and the HUD.
Three things it cannot, because they are secret, personal or huge:

| What | How it gets there |
| --- | --- |
| `~/.claude/secrets/` (API keys, Android upload keystores) | `carry.sh` |
| `~/.claude/projects/*/memory/` (what Claude remembers per project) | `carry.sh` |
| `BRIGHTDATA_API_TOKEN` in `settings.json` | `carry.sh` |
| Session history, `~/.claude/projects` in full | `carry.sh --with-history` (GBs, rarely worth it) |
| MCP sign-in for Supabase, Cloudflare, PostHog, Vercel | `/mcp` once per machine (OAuth) |
| Orca skills (`computer-use`, `orca-cli`, `orchestration`) | installing Orca; they live in `~/.agents` |
| Official synced skills (docs, docx, pdf, pptx, xlsx) | Claude downloads them from the account by itself |

```bash
# on the machine that has the state
./carry.sh send msi          # or: ./carry.sh pack, then move the file yourself
# on the new machine, after setup.sh
~/nadavai/carry.sh restore ~/nadavai-carry-<stamp>.tar.gz.gpg
```

The archive is always AES256 with a passphrase; nothing unencrypted is ever written to disk.
Losing the Android upload keystores means the Play Store apps can never be updated again, so they
are the one thing worth a second copy in a password manager as well.

The build concurrency caps in `settings.base.json` (`MAKEFLAGS=-j6`, `VITEST_MAX_THREADS=6`,
`CARGO_BUILD_JOBS=6`) exist because unbounded test and build runners are what actually bring a
machine to its knees, not the number of projects. Raise them per machine if it has the cores to spare.

## Shell and global npm

`setup.sh` appends one line to `~/.bashrc` that sources `shell/nadavai.sh`. The repo owns the shared
part of the shell (Claude env vars, build concurrency, the CLI and git aliases); `~/.bashrc` keeps
everything machine-specific such as SDK paths and PATH order. Every alias is guarded on its tool
existing, so a machine without `eza` or `batcat` gets the plain command rather than a broken one.

The concurrency caps derive from `nproc` (about 40% of threads) instead of a fixed number, because a
value tuned for one machine is wrong on the next. Override with `NADAVAI_JOBS=n` before the source line.

`npm-globals.txt` lists the global packages this environment expects. They are **not** installed
automatically; run `./setup.sh --npm` (or `./update.sh --npm`) when the machine should have them.
`setup.sh` reports how many are missing on every run.

fnm keeps global packages per Node version, so install them under the version `fnm default` points at.
Check with `fnm list`; globals installed under a different version are invisible to a new shell.

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
