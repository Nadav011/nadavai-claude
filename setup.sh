#!/usr/bin/env bash
# Install Nadav's Claude Code environment on this machine from this repo.
# Idempotent: safe to re-run. Writes no secrets. See README.md for what it does.
#
#   ./setup.sh            marketplace from GitHub (Nadav011/nadavai-claude)
#   ./setup.sh --local    marketplace from this clone (offline / before the first push)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$REPO/lib/common.sh"

MARKETPLACE_SOURCE="Nadav011/nadavai-claude"
while [ $# -gt 0 ]; do
  case "$1" in
    --local) MARKETPLACE_SOURCE="$REPO" ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

step "Prerequisites"
need claude "Install Claude Code first: https://code.claude.com/docs/en/setup"
need git "Install git."
need node "Install Node.js 20+ (OMC and the hooks need it)."
need npm "Install Node.js 20+ (npm ships with it)."
log "claude $(claude --version 2>/dev/null | head -1), node $(node --version), config dir $CFG"

step "Marketplaces"
add_marketplace claude-plugins-official anthropics/claude-plugins-official
add_marketplace omc https://github.com/Yeachan-Heo/oh-my-claudecode.git
add_marketplace i-have-adhd ayghri/i-have-adhd
add_marketplace agricidaniel-claude-seo AgriciDaniel/claude-seo
add_marketplace impeccable pbakaus/impeccable
add_marketplace wondelai-skills wondelai/skills
add_marketplace intent ghaida/intent
add_marketplace posthog PostHog/ai-plugin
add_marketplace interfaces jakubkrehel/skills
add_marketplace nadavai "$MARKETPLACE_SOURCE"

step "Plugins"
# nadavai declares every other plugin as a dependency, so this one install pulls them all in, enabled.
claude plugin install nadavai@nadavai --scope user
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

step "Rules (symlink $CFG/rules -> repo)"
link_rules

step "Skills (remove user-level copies that would shadow the plugin)"
retire_duplicate_skills

step "Settings"
merge_settings

step "i-have-adhd always-on"
touch "$CFG/.i-have-adhd-always"
log "$CFG/.i-have-adhd-always"

step "Git hooks and global ignore"
link_git

step "OMC CLI, CLAUDE.md and HUD"
ensure_omc

step "System tools (informational)"
system_check

step "Done"
cat <<MSG
  Open a new Claude Code session, then:
    /mcp                     sign in to Supabase, Cloudflare and PostHog (OAuth, once per machine)
    claude doctor            confirm plugins and hooks load
    omc doctor conflicts     confirm nothing shadows a plugin skill
  Backups of anything replaced: ${BACKUP} (only if something was moved)
MSG
