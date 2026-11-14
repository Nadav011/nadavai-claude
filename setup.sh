#!/usr/bin/env bash
# Install Nadav's Claude Code environment on this machine from this repo.
# Idempotent: safe to re-run. Writes no secrets. See README.md for what it does.
#
#   ./setup.sh            marketplace from GitHub (Nadav011/nadavai-claude)
#   ./setup.sh --local    marketplace from this clone (offline / before the first push)
#   ./setup.sh --npm      also install the global npm packages in npm-globals.txt
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$REPO/lib/common.sh"

MARKETPLACE_SOURCE="Nadav011/nadavai-claude"
WITH_NPM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --local) MARKETPLACE_SOURCE="$REPO" ;;
    --npm) WITH_NPM=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

step "Prerequisites"
need claude "Install Claude Code first: https://code.claude.com/docs/en/setup"
need git "Install git."
need node "Install Node.js 20+ (the hooks, the omc CLI and the status line need it)."
need npm "Install Node.js 20+ (npm ships with it)."
log "claude $(claude --version 2>/dev/null | head -1), node $(node --version), config dir $CFG"

step "Marketplaces"
add_marketplace claude-plugins-official anthropics/claude-plugins-official
# The oh-my-claudecode plugin is retired and not installed, and nothing in this repo reads its
# marketplace any more. The marketplace stays registered for one reason: Codex (its
# [marketplaces.omc] source) and Grok read the clone in ~/.claude/plugins/marketplaces/omc, and
# Nadav said on 2026-11-14 that OMC comes off Codex too, but not now. Remove this line, and
# extraKnownMarketplaces.omc in settings.base.json, when Codex and Grok no longer read that clone.
add_marketplace omc https://github.com/Yeachan-Heo/oh-my-claudecode.git
add_marketplace i-have-adhd ayghri/i-have-adhd
add_marketplace agricidaniel-claude-seo AgriciDaniel/claude-seo
add_marketplace impeccable pbakaus/impeccable
add_marketplace intent ghaida/intent
add_marketplace posthog PostHog/ai-plugin
add_marketplace interfaces jakubkrehel/skills
add_marketplace nadavai "$MARKETPLACE_SOURCE"

step "Plugins"
# nadavai declares the plugins every machine runs as dependencies, so this one install pulls them in, enabled.
claude plugin install nadavai@nadavai --scope user
# On a machine that already has nadavai the install above changes nothing, and the Settings step
# below may turn off a plugin that an old copy still lists as a dependency, which would leave
# every session without nadavai. So refresh the marketplace and every installed copy first.
claude plugin marketplace update nadavai
update_nadavai_copies
# Belt and braces: the CLI has been seen to skip dependencies whose marketplace was added in the
# same run, so install any dependency that is still missing, one by one.
while read -r dep; do
  if plugin_installed "$dep"; then log "$dep already installed"
  else claude plugin install "$dep" --scope user; fi
done < <(dependency_ids)
# claude-seo is installed but disabled: enable it per marketing repo (see README, "SEO").
if plugin_installed claude-seo@agricidaniel-claude-seo; then log "claude-seo already installed"
else claude plugin install claude-seo@agricidaniel-claude-seo --scope user; fi
claude plugin disable claude-seo@agricidaniel-claude-seo --scope user >/dev/null 2>&1 || true
log "claude-seo disabled globally"

step "Codex plugin"
CODEX_REFRESH_FAILED=0
refresh_codex_plugin || CODEX_REFRESH_FAILED=1

step "Rules (symlink $CFG/rules -> repo)"
link_rules

step "Skills (remove user-level copies that would shadow the plugin)"
retire_duplicate_skills
link_my_menu
mirror_rules_to_codex
mirror_to_antigravity
mirror_guard_to_grok

step "Settings"
merge_settings
apply_machine_env

step "i-have-adhd always-on"
enable_adhd_always

step "Git hooks and global ignore"
link_git

step "Shell environment (~/.bashrc sources shell/nadavai.sh)"
link_shell
link_home_pyright

step "omc CLI (omc ask), the status line and CLAUDE.md"
ensure_omc
link_global_claude_md
retire_omc_files

step "continues CLI and the cs shortcut"
ensure_continues
link_shortcuts

step "agent-browser and its vault plugin"
ensure_agent_browser

if [ "$WITH_NPM" = 1 ]; then
  step "Global npm packages"
  ensure_npm_globals
fi

step "System tools (informational)"
system_check
report_npm_globals

if [ "$CODEX_REFRESH_FAILED" = 1 ]; then
  die "Other installer steps completed, but Codex nadavai plugin refresh failed; resolve the error above and rerun."
fi

step "Done"
cat <<MSG
  Open a new Claude Code session, then:
    /mcp                     sign in to a server that asks for it (OAuth, once per machine)
    claude doctor            confirm plugins and hooks load
  Backups of anything replaced: ${BACKUP} (only if something was moved)
MSG
