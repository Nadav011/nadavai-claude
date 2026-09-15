#!/usr/bin/env bash
# SessionStart hook: tell Claude when the nadavai repo clone has uncommitted,
# unpushed, or not-yet-installed changes, or when origin has newer commits.
# Plain stdout from a SessionStart hook is added to Claude's context.
set -u

REPO="${NADAVAI_HOME:-$HOME/nadavai}"
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
[ -d "$REPO/.git" ] || exit 0
cd "$REPO" || exit 0

out=""

dirty="$(git status --porcelain 2>/dev/null)"
if [ -n "$dirty" ]; then
  out+="- Uncommitted changes:"$'\n'"$(printf '%s\n' "$dirty" | head -8 | sed 's/^/    /')"$'\n'
fi

ahead="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
[ "$ahead" -gt 0 ] && out+="- $ahead commit(s) not pushed to origin."$'\n'

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

[ -z "$out" ] && exit 0
printf 'nadavai repo (%s) needs attention. Mention this to Nadav once, then continue:\n%s' "$REPO" "$out"
