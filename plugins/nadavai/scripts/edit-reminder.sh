#!/usr/bin/env bash
# PostToolUse hook (Write|Edit|MultiEdit): when the edited file belongs to the
# nadavai repo, or to the installed copy of the plugin, remind Claude to
# commit, push and update. Returns additionalContext JSON; silent otherwise.
set -u
command -v node >/dev/null 2>&1 || exit 0
export NADAVAI_HOME="${NADAVAI_HOME:-$HOME/nadavai}"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
exec node "$(dirname "$0")/edit-reminder.mjs"
