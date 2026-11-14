#!/usr/bin/env bash
# Pull the latest repo state and refresh the installed nadavai plugin and links.
#
#   ./update.sh          nadavai only (marketplace + plugin + model policy + symlinks)
#   ./update.sh --all    also refresh every other marketplace and dependency plugin
#   ./update.sh --npm    also install any missing global npm package and update the listed ones
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$REPO/lib/common.sh"

ALL=0; NPM=0
for a in "$@"; do
  case "$a" in
    --all) ALL=1 ;;
    --npm) NPM=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
  esac
done

step "Repo"
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  warn "uncommitted changes in $REPO; skipping git pull"
else
  before="$(git -C "$REPO" rev-parse HEAD)"
  git -C "$REPO" pull --ff-only
  # lib/common.sh was sourced before the pull, so a pull that brought new code reruns this
  # script once on it. Why: on 2026-11-07 the MSI and omarchy applied the new policy keys only
  # on a second run.
  if [ "$(git -C "$REPO" rev-parse HEAD)" != "$before" ] && [ -z "${NADAVAI_UPDATE_REEXEC:-}" ]; then
    NADAVAI_UPDATE_REEXEC=1 exec "$REPO/update.sh" "$@"
  fi
fi

step "Marketplace"
if [ "$ALL" = 1 ]; then claude plugin marketplace update; else claude plugin marketplace update nadavai; fi

step "Plugin"
claude plugin update nadavai@nadavai
# A project-scope install (the home folder has one) is not touched by the user-scope update
# above: on 2026-10-27 /home/nadavcohen still ran 3d8e4df while the user scope had cbea8d4.
while IFS= read -r proj; do
  (cd "$proj" && claude plugin update nadavai@nadavai --scope project) || warn "could not update nadavai for $proj"
done < <(python3 -I -c '
import json, os
d = json.load(open(os.path.expanduser("~/.claude/plugins/installed_plugins.json")))
for e in d.get("plugins", {}).get("nadavai@nadavai", []):
    if e.get("scope") == "project" and os.path.isdir(e.get("projectPath", "")):
        print(e["projectPath"])' 2>/dev/null)
if [ "$ALL" = 1 ]; then
  while read -r dep; do
    claude plugin update "$dep" || warn "could not update $dep"
  done < <(dependency_ids)
fi

step "Running sessions"
refresh_running_guards

step "Codex plugin"
CODEX_REFRESH_FAILED=0
refresh_codex_plugin || CODEX_REFRESH_FAILED=1

step "continues CLI"
ensure_continues

step "TypeScript language server"
ensure_ts_lsp

step "agent-browser"
ensure_agent_browser

step "Research and skill-check tools"
ensure_research_tools

step "npm install-script approvals"
ensure_npm_script_approvals

if [ "$NPM" = 1 ]; then
  step "Global npm packages"
  ensure_npm_globals
  update_npm_globals
fi

step "Model policy"
apply_model_policy
apply_machine_env

step "Links"
link_rules
link_global_claude_md
link_git
link_shell
link_home_pyright
link_shortcuts
retire_duplicate_skills
link_my_menu
# The /my-* prompts lean on menu rows and bin/ tools, and no file of ours may name an
# oh-my-claudecode skill or agent type that tests/omc-names-allow.txt does not list (the plugin is retired).
bash "$REPO/tests/prompt-store.sh" >/dev/null 2>&1 \
  || warn "prompt store: a /my-* prompt names a missing menu row or tool, or a file names an OMC skill or agent type; run tests/prompt-store.sh"
# The menu is a mod on an early-access API: a Claude Code release can stop it loading.
bash "$REPO/tests/my-menu.sh" >/dev/null 2>&1 \
  || warn "prompt menu: the Ctrl+P menu or its key did not pass; run tests/my-menu.sh (/nadavai:my still works)"
# The list leans on parts of Claude Code that are early access (the focus of the band above the
# prompt). tests/my-menu-live.sh checks them in a real terminal and notes the Claude Code version it
# passed on, so a version that came since is named here until the check is run on it.
if command -v claude >/dev/null 2>&1; then
  menu_now=$(claude --version 2>/dev/null | head -1)
  menu_seen=$(cat "$HOME/.cache/nadavai/my-menu-live.passed" 2>/dev/null || true)
  if [ -n "$menu_now" ] && [ "$menu_seen" != "$menu_now" ]; then
    warn "prompt menu: not checked in a real terminal on Claude Code ${menu_now%% *} (last pass: ${menu_seen:-never}); run tests/my-menu-live.sh"
  fi
fi
mirror_rules_to_codex
mirror_to_antigravity
mirror_guard_to_grok

# Marketplaces update by themselves, and an update can ship a plugin whose hook or MCP server
# file is gone (oh-my-claudecode 5.8.6 on 2026-11-14). The daily plugin-health.timer runs the
# same check and notifies.
step "Plugin health"
"$REPO/bin/plugin-health" || warn "a plugin or an MCP server is not working: the BROKEN lines above say which"
enable_plugin_health_timer
enable_omc_news_timer

if [ "$CODEX_REFRESH_FAILED" = 1 ]; then
  die "Other installer steps completed, but Codex nadavai plugin refresh failed; resolve the error above and rerun."
fi

step "Done"
log "Restart open Claude Code sessions, or run /reload-plugins, to load the new version."
