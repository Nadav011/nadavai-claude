#!/usr/bin/env bash
# PostToolUse hook (Write|Edit|MultiEdit): when the edited file belongs to the
# nadavai repo, or to the installed copy of the plugin, remind Claude to
# commit, push and update. Returns additionalContext JSON; silent otherwise.
set -u
command -v node >/dev/null 2>&1 || exit 0
export NADAVAI_HOME="${NADAVAI_HOME:-$HOME/nadavai}"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
input=$(cat)

# Fast path: almost every edit is outside both trees, and node costs ~200 ms per call.
# Exit early only when the path is outside them both with and without symlinks
# resolved; anything else, or no jq, goes to the node script, which decides.
if command -v jq >/dev/null 2>&1 && file=$(jq -r '.tool_input.file_path // empty' <<<"$input" 2>/dev/null); then
  [ -n "$file" ] || exit 0
  inside=0
  for f in "$(realpath -m -- "$file")" "$(realpath -ms -- "$file")"; do
    for dir in "$NADAVAI_HOME" "$CLAUDE_CONFIG_DIR/plugins/cache/nadavai"; do
      for d in "$(realpath -m -- "$dir")" "$(realpath -ms -- "$dir")"; do
        case "$f" in "$d"|"$d"/*) inside=1 ;; esac
      done
    done
  done
  [ "$inside" = 1 ] || exit 0
fi
exec node "$(dirname "$0")/edit-reminder.mjs" <<<"$input"
