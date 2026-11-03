#!/usr/bin/env bash
# test-memory-index-check.sh: feeds memory-index-check.mjs the SessionStart and PostToolUse JSON
# Claude Code sends, against a fake CLAUDE_CONFIG_DIR, and checks when it speaks and when it stays quiet.
set -uo pipefail
S="$(cd "$(dirname "$0")/.." && pwd)/scripts/memory-index-check.mjs"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
export CLAUDE_CONFIG_DIR="$tmp/cfg"
proj="$tmp/my.proj"; mkdir -p "$proj"; git -C "$proj" init -q
slug=$(printf '%s' "$(cd "$proj" && pwd -P)" | sed 's/[^a-zA-Z0-9]/-/g')
mem="$CLAUDE_CONFIG_DIR/projects/$slug/memory"; mkdir -p "$mem"

expect() {  # name  pattern|EMPTY  output
  if [ "$2" = EMPTY ]; then [ -z "$3" ] && ok=1 || ok=0; else grep -q -- "$2" <<<"$3" && ok=1 || ok=0; fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want ${2}, got: ${3:0:300}"; FAIL=$((FAIL+1)); fi
}
start() { jq -cn --arg c "$proj" '{hook_event_name:"SessionStart",cwd:$c}' | node "$S"; }
post()  { jq -cn --arg f "$1" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$f}}' | node "$S"; }

# small, complete index: quiet
echo "x" > "$mem/a.md"
printf -- '- [A](a.md) — hook\n' > "$mem/MEMORY.md"
expect "small index quiet"            EMPTY "$(start)"
expect "edit small index quiet"       EMPTY "$(post "$mem/MEMORY.md")"
expect "indexed memory file quiet"    EMPTY "$(post "$mem/a.md")"

# unindexed memory file
echo "y" > "$mem/b.md"
expect "session: file not in index"   "MEMORY FILES NOT IN INDEX" "$(start)"
expect "post: file not in index"      "MEMORY FILE NOT IN INDEX" "$(post "$mem/b.md")"
printf -- '- [B](b.md) — hook\n' >> "$mem/MEMORY.md"

# broken link
printf -- '- [Gone](gone.md) — hook\n' >> "$mem/MEMORY.md"
expect "broken link"                  "BROKEN LINKS.*gone.md" "$(start)"
printf -- '- [A](a.md) — hook\n- [B](b.md) — hook\n' > "$mem/MEMORY.md"

# near limit by lines
for i in $(seq 1 170); do echo "- line $i"; done >> "$mem/MEMORY.md"
expect "near limit (lines)"           "NEAR LIMIT" "$(start)"
expect "near limit on edit, JSON"     '"hookEventName":"PostToolUse"' "$(post "$mem/MEMORY.md")"

# over limit by bytes, few lines
printf -- '- [A](a.md) — hook\n- [B](b.md) — hook\n' > "$mem/MEMORY.md"
for i in $(seq 1 120); do printf -- '- %0250d\n' 0; done >> "$mem/MEMORY.md"
out=$(start)
expect "over limit (bytes)"           "OVER LIMIT" "$out"
expect "long lines counted"           "120 lines are longer" "$out"

# not a memory path, garbage input, missing index: quiet and exit 0
expect "other file quiet"             EMPTY "$(post "$proj/src/x.md")"
expect "garbage stdin quiet"          EMPTY "$(printf 'not json' | node "$S")"
rm -f "$mem/MEMORY.md"
expect "no index quiet"               EMPTY "$(jq -cn --arg c "$tmp" '{hook_event_name:"SessionStart",cwd:$c}' | node "$S")"

# a worktree resolves to the main checkout's memory
git -C "$proj" -c core.hooksPath=/dev/null -c user.email=t@t -c user.name=t commit -q --allow-empty -m "test: initial commit"
git -C "$proj" worktree add -q "$tmp/wt" || echo "FAIL: worktree add"
printf -- '- [A](a.md) — hook\n' > "$mem/MEMORY.md"
expect "worktree uses main memory"    "b.md" "$(jq -cn --arg c "$tmp/wt" '{hook_event_name:"SessionStart",cwd:$c}' | node "$S")"

echo "memory-index-check: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
