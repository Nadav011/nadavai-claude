#!/usr/bin/env bash
# PostToolUse hook (Write|Edit|MultiEdit): when the edited file belongs to the
# nadavai repo, or to the installed copy of the plugin, remind Claude to
# commit, push and update. Returns additionalContext JSON; silent otherwise.
set -u
STATE_FILE="/tmp/.nadavai-edit-reminder-$(id -u).txt"

if [ "${1:-}" = "--post-invocation" ]; then
  cat >/dev/null 2>&1 || true
  if [ -f "$STATE_FILE" ] && command -v jq >/dev/null 2>&1; then
    msg="$(cat "$STATE_FILE" 2>/dev/null || true)"
    rm -f "$STATE_FILE"
    if [ -n "$msg" ]; then
      jq -cn --arg m "$msg" '{injectSteps:[{ephemeralMessage:$m}]}'
      exit 0
    fi
  fi
  printf '{}\n'
  exit 0
fi

input=$(cat)
is_agy=0
case "$input" in *'"toolCall"'*) is_agy=1 ;; esac

empty_out() {
  [ "$is_agy" = 1 ] && printf '{}\n'
  exit 0
}

command -v node >/dev/null 2>&1 || empty_out
export NADAVAI_HOME="${NADAVAI_HOME:-$HOME/nadavai}"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
export NADAVAI_EDIT_STATE_FILE="$STATE_FILE"

# Fast path: almost every edit is outside both trees, and node costs ~200 ms per call.
# Exit early only when the path is outside them both with and without symlinks
# resolved; anything else, or no jq, goes to the node script, which decides.
if command -v jq >/dev/null 2>&1 && file=$(jq -r '.tool_input.file_path // .toolCall.args.TargetFile // empty' <<<"$input" 2>/dev/null); then
  [ -n "$file" ] || empty_out
  inside=0
  # Physical, lexical, and lexical then physical (node's realpathSync resolves `..`
  # before it follows symlinks).
  lex=$(realpath -ms -- "$file")
  for f in "$(realpath -m -- "$file")" "$lex" "$(realpath -m -- "$lex")"; do
    for dir in "$NADAVAI_HOME" "$CLAUDE_CONFIG_DIR/plugins/cache/nadavai" "${GEMINI_CONFIG_DIR:-$HOME/.gemini/config}/plugins/nadavai"; do
      for d in "$(realpath -m -- "$dir")" "$(realpath -ms -- "$dir")"; do
        case "$f" in "$d"|"$d"/*) inside=1 ;; esac
      done
    done
  done
  [ "$inside" = 1 ] || empty_out
fi
exec node "$(dirname "$0")/edit-reminder.mjs" <<<"$input"
