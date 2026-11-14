#!/usr/bin/env bash
# tests/nadavai-copies.sh: update_nadavai_copies (lib/common.sh) with a made-up `claude`, and the
# place setup.sh and update.sh call it from. Claude Code does not load a plugin while a dependency
# its installed copy lists is turned off, so every installed copy of nadavai (user scope and each
# project scope) has to be brought up to date before a script writes settings that turn a former
# dependency off. On 2026-11-14 a review showed setup.sh did not: `claude plugin install` on an
# installed plugin changes nothing, and the Settings step then turned oh-my-claudecode off.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

bin="$t/bin"; mkdir -p "$bin" "$t/.claude/plugins" "$t/proj-a" "$t/proj b"
# One project-scope copy in a folder with a space in its name, one whose folder is gone, and a
# user-scope entry that is not a project.
cat >"$t/.claude/plugins/installed_plugins.json" <<JSON
{"plugins":{"nadavai@nadavai":[
  {"scope":"user"},
  {"scope":"project","projectPath":"$t/proj-a"},
  {"scope":"project","projectPath":"$t/proj b"},
  {"scope":"project","projectPath":"$t/gone"}
],"other@x":[{"scope":"project","projectPath":"$t/proj-a"}]}}
JSON
# The made-up claude records where it ran and with what; FAIL_USER / FAIL_PROJECT make that call fail.
cat >"$bin/claude" <<'STUB'
#!/bin/sh
echo "$PWD|$*" >>"$CALLS"
case "$*" in
  *"--scope project"*) [ -z "${FAIL_PROJECT:-}" ] || exit 1 ;;
  *) [ -z "${FAIL_USER:-}" ] || exit 1 ;;
esac
STUB
chmod +x "$bin/claude"
run() { : >"$t/calls"; (cd "$t" && CALLS="$t/calls" PATH="$bin:$PATH" REPO="$here" HOME="$t" \
  bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; update_nadavai_copies; echo reached-the-end' 2>&1); }

out=$(run); rc=$?
ok "it ends cleanly when every update works"            '[ "$rc" = 0 ] && grep -q "reached-the-end" <<<"$out"'
ok "the user-scope copy is updated first"               '[ "$(head -n 1 "$t/calls")" = "$t|plugin update nadavai@nadavai" ]'
ok "a project-scope copy is updated from its folder"    'grep -qxF "$t/proj-a|plugin update nadavai@nadavai --scope project" "$t/calls"'
ok "a project folder with a space in its name too"      'grep -qxF "$t/proj b|plugin update nadavai@nadavai --scope project" "$t/calls"'
ok "a project whose folder is gone is skipped, and nothing else is called" '[ "$(wc -l <"$t/calls")" = 3 ]'

out=$(FAIL_USER=1 run); rc=$?
ok "a failed user-scope update stops the script"        '[ "$rc" != 0 ] && ! grep -q "reached-the-end" <<<"$out"'
ok "and no later step runs after it"                    '[ "$(wc -l <"$t/calls")" = 1 ]'

# A caller that swallows the function's failure must still not go on (review round 2, N-a).
: >"$t/calls"
out=$(cd "$t" && FAIL_USER=1 CALLS="$t/calls" PATH="$bin:$PATH" REPO="$here" HOME="$t" \
  bash -c 'source "$REPO/lib/common.sh"; update_nadavai_copies || true; echo reached-the-end' 2>&1); rc=$?
ok "it stops by itself even when the caller ignores its failure and has no set -e" \
  '[ "$rc" != 0 ] && ! grep -q "reached-the-end" <<<"$out" && grep -q "settings were not written" <<<"$out"'

out=$(FAIL_PROJECT=1 run); rc=$?
ok "a failed project-scope update is a warning that names the folder" '[ "$rc" = 0 ] && grep -q "could not update nadavai for $t/proj-a" <<<"$out"'

echo "{ not json" >"$t/.claude/plugins/installed_plugins.json"
out=$(run); rc=$?
ok "an unreadable installed_plugins.json is a warning, not silence" '[ "$rc" = 0 ] && grep -q "could not read the installed nadavai copies" <<<"$out"'

rm -f -- "$t/.claude/plugins/installed_plugins.json"
out=$(run); rc=$?
ok "a machine with no installed_plugins.json still updates the user scope, with no warning" '[ "$rc" = 0 ] && [ "$(wc -l <"$t/calls")" = 1 ] && ! grep -q "could not read" <<<"$out"'

# Where the two scripts call it: after the marketplace is refreshed, before settings are written.
line() { grep -n -m 1 -E "$2" "$here/$1" | cut -d: -f1; }
s_install=$(line setup.sh '^claude plugin install nadavai@nadavai'); s_mkt=$(line setup.sh '^claude plugin marketplace update nadavai')
s_copies=$(line setup.sh '^update_nadavai_copies$'); s_settings=$(line setup.sh '^merge_settings')
ok "setup.sh refreshes the marketplace and the copies after the install and before it merges settings" \
  '[ -n "$s_install" ] && [ -n "$s_mkt" ] && [ -n "$s_copies" ] && [ -n "$s_settings" ] && [ "$s_install" -lt "$s_mkt" ] && [ "$s_mkt" -lt "$s_copies" ] && [ "$s_copies" -lt "$s_settings" ]'
u_mkt=$(line update.sh 'claude plugin marketplace update nadavai'); u_copies=$(line update.sh '^update_nadavai_copies$'); u_policy=$(line update.sh '^apply_model_policy')
ok "update.sh updates the copies after the marketplace and before it applies the settings policy" \
  '[ -n "$u_mkt" ] && [ -n "$u_copies" ] && [ -n "$u_policy" ] && [ "$u_mkt" -lt "$u_copies" ] && [ "$u_copies" -lt "$u_policy" ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
