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

`bin/disk-now` answers "what takes the disk" in seconds on the LENOVO and the MSI together (Hebrew,
for Nadav): live `df`, the deepest folders of 5 GB or more, and what grew or shrank by 1 GB since the
map before. It reads a map that `disk-now --scan` writes (du over `/` through `heavy-slot`, folders of 100 MB or more, in
`~/.cache/disk-map/`), nightly through `systemd/user/disk-map.timer`. `bin/docker-tidy` removes Docker
images no container uses and no project pins (`supabase/.temp/*-version`) that have two newer images of the same repository, dangling images and build
cache older than 7 days, never volumes; `--apply` runs weekly through `systemd/user/docker-tidy.timer`
on dev machines (the MSI keeps its own `woodpecker-prune` for CI). Both timers: symlink the `.service`
and `.timer` into `~/.config/systemd/user/` and `systemctl --user enable --now <name>.timer`, on every
home machine except the CI agent (the MSI): `ci-policy.md` keeps other heavy jobs off it, so there
`disk-now` shows live `df` and a map only from a `--scan` run by hand. Tests: `tests/disk-now.sh`.

`bin/plugin-health` checks that every enabled Claude Code plugin still works: its install folder,
every file a hook or an MCP server runs, each dependency, and what `claude mcp list` says about
each server. Marketplaces update by themselves, and an update can ship a broken plugin without a
word (oh-my-claudecode 5.8.6 came without its MCP server file on 2026-11-14). `update.sh` runs it at
the end and then links and enables `systemd/user/plugin-health.timer`, which runs
`plugin-health --notify` daily on every machine with a systemd user session (light enough for the
MSI): a desktop notification when the broken list changes. It also reports a file listed in
`config/routed-skill-files.txt` that is gone: skill files of a turned-off plugin that a guide or a
skill of ours reads by path. Tests:
`tests/plugin-health.sh`.

`~/pyrightconfig.json` (from `config/home-pyrightconfig.json`) keeps a Python language server that starts in the home folder from loading every `.py` file under it; open files are still analysed. Tests: `tests/home-pyright.sh`.

## What is inside

| Part | Where | Delivered by |
|---|---|---|
| Bundle plugin `nadavai` | `plugins/nadavai/` | `claude plugin install nadavai@nadavai` |
| Dependencies: oh-my-claudecode (OMC), i-have-adhd, context7, typescript-lsp, pyright-lsp, playwright, supabase, chrome-devtools-mcp, skill-creator; UI/UX layer: impeccable, intent, interfaces | `plugins/nadavai/.claude-plugin/plugin.json` | installed and enabled automatically with the bundle |
| Skills: nadav-design + ux-setup / ux-plan / ux-screen / ux-audit / ux-redesign / ux-ship / ux-retro / ux-next (the UI/UX loop), qa-report, machine-checkup (machine cleanup, freeze diagnosis, inventory, and the update/driver audit), machine-provision (set up a second machine to match this one, proven by a diff; Chrome and login transfer), client-messages (house style and send process for client messages), social-campaigns (client ads, boosts and click-to-WhatsApp lead flows, and how Nadav's sites and apps are found in search and AI answers: routes to the local playbook in `~/social/playbook` and the client's `CLIENT.md`; client facts stay out of this repo; routing in `rules/social.md`), desktop-control (computer use without disturbing Nadav: agent-desktop background actions first, real mouse and keys as the last resort; routing in `rules/desktop-control.md`), act-on-behalf (sign-ups, logins and forms in Nadav's name through agent-browser and the vault plugin; rules in `rules/acting-on-behalf.md`), store-apps (web apps into the App Store and Google Play: the model choice, shells, Codemagic builds, store APIs, moving PWA users, and the deploy service's OTA step; routing in `rules/store-apps.md`), virtual-phones (an Android or iPhone app without a phone: the SDK emulator driven with agent-device, and scripted iPhone-simulator runs on Xcode Cloud; routing in `rules/virtual-phones.md`), vercel-react-best-practices, vercel-composition-patterns, vercel-react-view-transitions, hebrew-rtl-best-practices, hebrew-i18n, hebrew-tailwind-preset, israeli-accessibility-compliance, capacitor-app-development, capacitor-plugins, capacitor-android-dex-optimization, safe-area-handling, capacitor-keyboard, capacitor-accessibility, capacitor-apple-review-preflight, capacitor-deep-linking, capacitor-splash-screen, capacitor-push-notifications, capacitor-ios-resizability, debugging-capacitor, ios-android-logs, capacitor-performance, capacitor-uiscene-migration, shadcn, animate, review-animations, improve-animations, find-animation-opportunities, emil-design-eng, mobile-native, prototype, argos-cli, argos-pr-review, argos-upload; product skills write-spec, synthesize-research, competitive-brief, metrics-review; six skills copied from wondelai (jobs-to-be-done, mom-test, ux-heuristics, ios-hig-design, conversion-optimization, microinteractions); six skills taken from oh-my-claudecode (agent-doc-discipline, benchmark-checklist, blast-radius, fix-merge-conflicts, deep-interview: the Socratic interview with ambiguity scoring, ported to run without the plugin); Android: agp-9-upgrade, r8-analyzer, play-policy-insights (from Google's android/skills at bf68e2d, Apache-2.0, LICENSE.txt in each, scanned with SkillSpector; local patches: play-policy-insights Mode B `aggregate` subcommand, r8-analyzer runs its scripts with `uv run --with protobuf`, list `keywords` metadata flattened to a string for the Agent Skills spec; play-policy-insights' report step fetches the app's public Play Store page) | `plugins/nadavai/skills/` | the bundle (invoked as `/nadavai:<skill>` or by trigger) |
| Bright Data MCP (search engine, unblocked scrape, Reddit/X/YouTube data; groups social, research, advanced_scraping) | `plugins/nadavai/mcp.json` (not `.mcp.json`: the global gitignore drops that name) | the bundle; needs `BRIGHTDATA_API_TOKEN` per machine, see Secrets |
| Scrapling MCP (free stealth fetch, Cloudflare solving, browser sessions; the first stop before Bright Data, `rules/working-style.md`) | `plugins/nadavai/mcp.json` | the bundle; needs `scrapling` per machine (`system_check` prints the install line) |
| Stop guards on every reply: hebrew-guard (English reply or AskUserQuestion dialog sent back for Hebrew) and candor-guard (praise or agreement before evidence sent back, `rules/candor.md`), once per text per turn through `guard-turn.mjs`; tests in `plugins/nadavai/tests/test-stop-guards.sh` | `plugins/nadavai/scripts/` | the bundle |
| Secret paste guard (UserPromptSubmit): a prompt holding an API key, token or private key (tight patterns only, no JWTs or passwords), a Luhn-valid payment card with card context (its expiry and code next to it are scrubbed with it and never saved; public test card numbers pass), or nothing but one bare mixed-case token is blocked before it reaches the model with a Hebrew reason naming the type and last 4 characters; the key is saved to `~/.claude/secrets/pasted-<time>.env` (600) and a detached child scrubs it from `history.jsonl` (under Claude Code's lock), `paste-cache/` and Orca's hook spool (`rules/acting-on-behalf.md`); tests in `plugins/nadavai/tests/test-secret-paste-guard.sh` | `plugins/nadavai/scripts/secret-paste-guard.mjs` | the bundle |
| Close check: `bin/session-close-check [--no-fetch] [--json] [dir ...]` answers "can this session be closed?" from facts, one block per repo or worktree given (uncommitted files, an operation in progress, this branch's or recent stashes, unpushed commits on this branch and on recent branches checked out nowhere, HEAD in main or its PR merged into main, this session's own commit live; a repo with no remote is local-only) and once for the machine (nadavai pushed and installed, client-message drafts and one-shot timers from the last 24 h); other worktrees with uncommitted, unpushed or unmerged work and other sessions' stashes and merges only as NOTE; read-only, network checks within a 60 s total, ending in one `CLOSE: yes`, `CLOSE: no (<n> open)` or `CLOSE: unknown` when a check could not run (`CLOSE: yes (no git repo checked)` outside git); the UserPromptSubmit hook `close-check-hint.mjs` tells the model to run it on every directory the session changed when a short prompt asks whether everything is done; tests in `plugins/nadavai/tests/test-session-close-check.sh` and `test-close-check-hint.sh` | `bin/`, `plugins/nadavai/scripts/close-check-hint.mjs` | `update.sh` links `bin/*` into `~/.local/bin`; the hook comes with the bundle |
| Prompt store: thirty prompts that only Nadav starts, one per steering sentence he keeps retyping (`/nadavai:my-run`, `my-best`, `my-done`, `my-resume`, `my-prove`, `my-other`, `my-review`, `my-connected`, `my-status`, `my-self`, `my-show`, `my-plain`, `my-client`, `my-research`, `my-machine`, `my-fast`, `my-hold`, `my-wrong`, `my-top`, `my-ask`, `my-next`, `my-agents`, `my-save`, `my-ship`, `my-cost`, `my-never`, `my-second`, `my-missed`, `my-map`, `my-method`; `/nadavai:my` prints the menu in Hebrew). The set comes from a count of everything he typed to Claude Code, Codex and Grok on both machines between 2026-08 and 2026-11 (6,637 messages, after leaving out 96 that agents wrote: briefs to reviewers and test sessions; the table of what recurs, with the decision for each row, is in `~/.omc/plans/method-review-2026-11-13/prompt-store/corpus-2026-11-14/` on the LENOVO). On 2026-11-14 he was asked about what was still a guess, and his answers are in the prompts: `my-connected` for the one-word "מחובר" after a manual step (266 messages; his first pick was ambiguous, and he confirmed it in a second dialog), every blocked item checked again after an account switch (`my-resume`), and his meanings of "מקצה לקצה" and "תתעלם מהחסימות" in `guides/glossary.md` (he approved both as cross-project). `my-method` came the same day from a question he put to six working sessions (is the way we work right, or doubled and a waste of time); he named it as one of the important ones (as he typed it: «נגיד זה דוגמא אחת הנחושבות»). It is built from what was strong and what was weak in their six answers and from his replies to them (the answers, and one read-only run of the prompt on a copy of the open SportChat v4 coordinator session, are in `~/.omc/plans/method-review-2026-11-13/prompt-store/runs-2026-11-14/round7-method/`). A description has the form "sentence? what it gives" or "sentence: what it gives", because the menu shows the two parts in separate columns. Each is user-only (`disable-model-invocation: true`), so it adds nothing to a session until he types it and no agent can start it. Four of them (`my-prove`, `my-resume`, `my-plain`, `my-run`) once invoked an OMC skill (`verify`, `recall`, `bro`, `show-me-your-work`); since 2026-11-14 they carry those steps themselves (`plugins/nadavai/skills/VENDORED.md`); the rest point at the rule files instead of restating them. `bin/session-digest <id or transcript> [--since YYYY-MM-DD] [--out DIR]` writes what he typed in a session (also mid-turn and as the reason for rejecting a tool call), his dialog answers with the options and his typed notes, the goal conditions, the end-of-turn replies, the text before each dialog and other sessions' messages as small files, with a mark wherever the context was compacted and known secret formats redacted (`--owner-only` keeps his side only), so a review reads the transcript and not the session's memory of it; `tests/session-digest.sh`. `tests/prompt-store.sh` fails when a prompt names a menu row that does not exist or stops naming the tool it depends on, or when a file under `plugins/nadavai/`, `guides/` or `bin/` names an OMC skill or agent type that `tests/omc-names-allow.txt` does not list with its reason, and `update.sh` warns on it | `plugins/nadavai/skills/my*/`, `bin/session-digest` | the bundle; `update.sh` links `bin/*` into `~/.local/bin` |
| Prompt menu on Ctrl+P: a mod that opens a list above the prompt box with the `/nadavai:my-*` prompts in groups by the situation he is in (his pick of 2026-11-14, "לפי מצב", over one list ordered by use). He was shown three of the groups as examples ("באמצע עבודה", "בודקים", "משהו לא טוב"); the other two ("להבין ולהחליט", "להראות, לשלוח ולשמור"), which prompt sits in which group beyond the seven he was shown, and the order of the groups are the agent's, recommended and not decided. One group is on the screen at a time, the most used first between the groups and inside each, with every group named in a row above the list and the one on screen marked. The keyboard walks it as it walks Claude Code's own question dialogs (he asked on 2026-11-14 for the arrows, for "like Anthropic's own" and for the prompts by category; which keys do what is the agent's reading of that): Up and Down move the highlight, Left, Right and Tab turn the groups, Enter puts the highlighted prompt in the prompt box with the words already typed there as its arguments, his own Enter runs it, Esc or the key again closes the list, and a digit jumps to the row of that number. Each row is a number, the sentence the prompt answers and what it gives (both read from the skill's description: the sentence ends at its first `?` or `:`). One row is not a prompt: "לנעול את הסשן על היעד" writes a ready `/goal` line that names the list "מה נחשב גמור" (the heading `my-run` gives its list) and ends the way `working-style.md` (Finishing) ends a goal condition, with the words he had typed as the goal itself (his pick of 2026-11-14 over copying a line the session prints, since only he can turn goal mode on). How the keyboard gets there, since a mod cannot take it: the key runs the engine's focus action for the band; while the list is closed the band holds one Button in a box of no height, and the focus landing on it opens the list. The list is a Select, the one element whose Up and Down are its own while Left, Right and Tab move the focus off it, onto two more unseen Buttons that mean "the next group" and "the group before". Esc raises no event, so while the list is open a watch asks four times a second whether the band still holds the keyboard, and closes the list when it does not. A Select's rows are plain text, so the dim and coloured columns of the first version and the prompt's name at the end of each row are gone, and a digit moves the highlight where it used to pick at once (the price of the arrows; the agent's choice). A mouse click on a row was not checked. `/my-menu` typed by hand says how the list opens, and with nobody at the keyboard prints it. It is a band above the prompt and not a pane: Orca's right-to-left patch orders every row that holds Hebrew across the whole terminal width, which mixes a pane docked beside the transcript into the conversation (the first version was a pane and opened scrambled in Orca), while rows that span the terminal read correctly. A key press leaves nothing in the transcript. In an Orca terminal Ctrl+P is Orca's own "Go to File" (`worktree.quickOpen`, taken before the terminal sees it), so Ctrl+P opens the menu there only after that Orca action is moved to another key in `~/.orca/keybindings.json`. The install does not do that: it was done by hand on the LENOVO and on the MSI on 2026-11-14 (`Mod+Alt+P`; Orca reads the file at start or on Settings, Keyboard Shortcuts, Reload from Disk). Ctrl+Shift+P is not Orca's and is bound to the menu as well. It is its own folder and not a hooks module of the nadavai plugin, because Codex reads that plugin's `hooks/hooks.json`. The mod API is early access: if a Claude Code release breaks it, `/nadavai:my` and typing `/my` still work. `tests/my-menu.sh` covers the key merge (and the move of the key from the first version's command), the install in a made-up home, the groups against the prompts, `claude plugin validate` and the mod's own tests (`claude plugin test`). Those tests cannot stand in for the engine's focus ring or for its answer when the list asks who holds the keyboard, so `tests/my-menu-live.sh` presses the keys in a real Claude Code terminal (a private tmux server; nothing is sent to a model) and reads the screen: open, Up and Down, the groups, a digit, twelve seconds of waiting, Esc, Enter and what the prompt box holds. Run it after a change to the mod and after a Claude Code update; it is not part of `update.sh`. How it looks was checked in Orca itself on 2026-11-14 (the MSI's Orca, Claude Code 2.1.322; three pictures in `~/.omc/plans/method-review-2026-11-13/prompt-store/runs-2026-11-14/round8-orca-look/` on the LENOVO): Orca draws the rows right to left, so the group after the marked one is drawn on its left and Left moves the mark onto it; a narrow pane shows one group name with its place ("1 מתוך 5") and the short key line; Esc closes the list there. A pane that is both wide and tall was read as text only, not as a picture. In a short pane a group is cut into parts of the rows that fit (the wide picture shows that: "באמצע עבודה (חלק 1 מתוך 4)", written as "1/4" when the picture was taken), Left, Right and Tab walk the parts before they reach the next group, and the key line is left out; in a band of fewer than three rows nothing names the group on screen (left as it is: a pane that short is rare). Another mod that draws in the band with `autoFocus` could take the focus from the list; none is installed | `mods/my-menu/`, `lib/keybind.mjs` | `update.sh` and `setup.sh` (`link_my_menu`): a link at `~/.claude/skills/my-menu`; in `~/.claude/keybindings.json` (Orca copies that file into each account profile at every launch) and in each profile's copy, `ctrl+p` and `ctrl+shift+p` = `abovePrompt:focus` in the Chat context (a key that still runs the first version's `command:my-menu` is rebound) and, in the AbovePromptSelect context, `left` = `abovePrompt:next`, `right` = `abovePrompt:previous`, `ctrl+p` and `ctrl+shift+p` = `abovePrompt:leave`, keeping the keys already there. A session that was open before the install reloads the mod by itself when the new files arrive (seen on Claude Code 2.1.325: "my-menu: plugin.json changed — reloaded"; the link points into this repo, and Claude Code watches a plugin it loaded from a skills folder), and Ctrl+P opens the new list. Where it does not, `/reload-plugins` loads it; with the first version still loaded the key does nothing, because that band has nothing for the focus to land on. `update.sh` warns when `tests/my-menu.sh` fails |
| Repo-sync hooks (SessionStart status, PostToolUse edit reminder) and the SessionStart project check (re-init pending while `PROJECT-FACTS.md` exists, UI LOOP next command from the tracked setup artifacts, design layer pending while a UI project lacks `DESIGN.md` or `PRODUCT.md`) | `plugins/nadavai/hooks/`, `plugins/nadavai/scripts/` | the bundle |
| Memory index guard: Claude Code loads only the first 200 lines / 25 KB of a project's `memory/MEMORY.md`, so at SessionStart and after each edit of a memory file it reports an index near (160 lines / 20 KB) or over that limit with compaction steps, broken links, and memory files with no index line; worktrees resolve to the main checkout's memory. Tests in `plugins/nadavai/tests/test-memory-index-check.sh` | `plugins/nadavai/scripts/memory-index-check.mjs` | the bundle |
| Rules (working agreement, candor, OMC team size, nadavai, and the rest of `rules/*.md`) | `rules/` | `setup.sh` symlinks `~/.claude/rules` here |
| On-demand guides (project re-init, design-init, posthog-init): not auto-loaded; `project-check.sh` points to them only when a project needs them. `production-change.md` is the ordered procedure for a migration, a production data fix, a permission or payment-code change that runs without asking; `rules/working-style.md` (Approval gates) says to read it before the action | `guides/` | read in place |
| Templates that /ux-setup copies into a project: DoD gate (`dod/`), project UI rule (`ui-rules/`), CI gate + Lighthouse budget + PR template (`ci/`), structural house base (`design/`) | `templates/` | see `templates/README.md` |
| Settings defaults (model, allowed models, effort, Hebrew, bypass permissions, agent teams, enabled plugins, marketplaces with auto-update) | `settings/settings.base.json` | `setup.sh` deep-merges into `~/.claude/settings.json`; `update.sh` re-applies only `model` and `availableModels` |
| Global git hooks (Conventional Commits, Trivy + typecheck pre-push, Cloudflare Pages auto-deploy) and global ignore | `git/` | `setup.sh` symlinks `~/.git-hooks` and `~/.config/git/ignore` here |
| claude-seo (AgriciDaniel) installed but disabled | `setup.sh` | enable per marketing repo, see SEO below |
| OMC CLI and HUD statusline | `setup.sh` runs `omc setup` | |
| Global `~/.claude/CLAUDE.md`: a short note on how OMC sits beside the rules (the rules themselves load from `~/.claude/rules`) | `settings/CLAUDE.global.md` | `setup.sh` and `update.sh` symlink it and set `claudeMdEnabled: false` in `~/.claude/.omc-config.json` and in each Orca profile's, so OMC leaves it alone |
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

Then open Claude Code once and run `/mcp` to sign in to any server that asks for it. PostHog needs none where the vault holds `POSTHOG_PERSONAL_API_KEY` (`plugins/nadavai/scripts/posthog-mcp-headers.sh`).
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
| MCP sign-in for a server that asks for it (PostHog without a vault key, Vercel) | `/mcp` once per machine (OAuth) |
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
| capacitor-app-development, capacitor-plugins, capacitor-android-dex-optimization | capawesome-team/skills (MIT); commit and local changes in `plugins/nadavai/skills/VENDORED.md` |
| safe-area-handling, capacitor-keyboard, capacitor-accessibility, capacitor-apple-review-preflight, capacitor-deep-linking, capacitor-splash-screen, capacitor-push-notifications, capacitor-ios-resizability, debugging-capacitor, ios-android-logs, capacitor-performance, capacitor-uiscene-migration | Cap-go/capacitor-skills (MIT); commit and local changes in `plugins/nadavai/skills/VENDORED.md` |
| hebrew-rtl-best-practices, hebrew-i18n, israeli-accessibility-compliance | installed 2026-09-16 with `npx skills add`; see each SKILL.md |
| animate, review-animations, improve-animations, find-animation-opportunities, emil-design-eng, mobile-native, prototype, shadcn, argos-*, vercel-react-view-transitions, hebrew-tailwind-preset | added in the UI/UX phase, 2026-09-16; upstream noted in each SKILL.md |
| write-spec, synthesize-research, competitive-brief, metrics-review | anthropics/knowledge-work-plugins (product-management), Apache-2.0; copied so the plugin's 16 unused MCP connectors do not load |
| agent-doc-discipline, benchmark-checklist, blast-radius, fix-merge-conflicts, deep-interview | Yeachan-Heo/oh-my-claudecode 5.8.6 (MIT); commit and local changes in `plugins/nadavai/skills/VENDORED.md` |
