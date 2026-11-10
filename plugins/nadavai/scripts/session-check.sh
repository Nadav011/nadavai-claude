#!/usr/bin/env bash
# SessionStart hook: tell Claude when the nadavai repo clone has uncommitted,
# unpushed, or not-yet-installed changes, or when origin has newer commits.
# Plain stdout from a SessionStart hook is added to Claude's context.
set -u

AGY=0
[ "${1:-}" = "--antigravity" ] && { AGY=1; cat >/dev/null 2>&1 || true; }

emit() {
  if [ "$AGY" = 1 ]; then
    if [ -z "${1:-}" ]; then printf '{}\n'
    elif command -v jq >/dev/null 2>&1; then jq -cn --arg m "$1" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
    else printf '{}\n'; fi
  else
    [ -n "${1:-}" ] && printf '%s' "$1"
  fi
  exit 0
}

REPO="${NADAVAI_HOME:-$HOME/nadavai}"
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
# Grok loads this hook from the plugin and from ~/.grok/hooks. One report per session.
if [ -n "${GROK_SESSION_ID:-}" ]; then
  stamp="${XDG_RUNTIME_DIR:-/tmp}/nadavai-session-check-${GROK_SESSION_ID}"
  mkdir -p "$(dirname "$stamp")" 2>/dev/null || true
  if [ -e "$stamp" ]; then emit ""; fi
  : >"$stamp" 2>/dev/null || true
fi
[ -d "$REPO/.git" ] || emit ""
START_DIR="$PWD"
cd "$REPO" || emit ""

out=""   # needs update.sh: worth one line to Nadav
wip=""   # another session's work in progress: not Nadav's business

dirty="$(git status --porcelain 2>/dev/null)"
if [ -n "$dirty" ]; then
  wip+="- Uncommitted changes:"$'\n'"$(printf '%s\n' "$dirty" | head -8 | sed 's/^/    /')"$'\n'
fi

ahead="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
[ "$ahead" -gt 0 ] && wip+="- $ahead commit(s) not pushed to origin."$'\n'

# Fetch at most once every 12 hours so session start stays fast and works offline.
fetch_head=".git/FETCH_HEAD"
if [ ! -f "$fetch_head" ] || [ -n "$(find "$fetch_head" -mmin +720 2>/dev/null)" ]; then
  if command -v timeout >/dev/null 2>&1; then timeout 5 git fetch -q origin 2>/dev/null || true
  else git fetch -q origin 2>/dev/null || true; fi
fi
behind="$(git rev-list --count 'HEAD..@{u}' 2>/dev/null || echo 0)"
[ "$behind" -gt 0 ] && out+="- origin has $behind newer commit(s): run $REPO/update.sh."$'\n'

head_sha="$(git rev-parse HEAD 2>/dev/null)"
installed="$(git -C "$CFG/plugins/marketplaces/nadavai" rev-parse HEAD 2>/dev/null || true)"
if [ -n "$installed" ] && [ -n "$head_sha" ] && [ "$installed" != "$head_sha" ] && [ "$ahead" -eq 0 ] && [ "$behind" -eq 0 ]; then
  out+="- Installed plugin is at ${installed:0:7}, repo is at ${head_sha:0:7}: run $REPO/update.sh."$'\n'
fi

[ -z "$out$wip" ] && emit ""
msg=""
[ -n "$out" ] && msg+="$(printf 'nadavai (%s) is not up to date on this machine. Mention this to Nadav once, then continue:\n%s' "$REPO" "$out")"$'\n'
# 66 sessions a week opened by telling Nadav about another session's half-done work in nadavai,
# so work in progress is shown only to a session that starts inside the repo or one of its worktrees.
case "$START_DIR/" in
  "$REPO"/*|"$REPO-worktrees"/*) [ -n "$wip" ] && msg+="$(printf 'nadavai (%s) has work in progress (not a note for Nadav):\n%s' "$REPO" "$wip")"$'\n' ;;
esac
emit "$msg"
