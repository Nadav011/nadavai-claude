#!/usr/bin/env bash
# test-rm-prompt-answer.sh: feeds the PermissionRequest hook the JSON Claude Code sends on stdin and
# checks that it answers "deny" with a message only for a shell command in bypassPermissions mode,
# and stays silent (exit 0, nothing on stdout) everywhere else. No command is run: the cases are
# only text handed to the hook.
set -uo pipefail
HOOK="$(cd "$(dirname "$0")/.." && pwd)/scripts/rm-prompt-answer.sh"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "$tmp"' EXIT
export XDG_CACHE_HOME=$tmp/cache

req() {  # mode tool command
  jq -cn --arg m "$1" --arg t "$2" --arg c "$3" \
    '{session_id:"s1", hook_event_name:"PermissionRequest", permission_mode:$m, tool_name:$t, tool_input:{command:$c}}'
}
check() {  # name expect(deny|silent) json [word the message must hold]
  local name="$1" want="$2" json="$3" word="${4:-}" out rc got
  out=$(printf '%s' "$json" | bash "$HOOK"); rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL: $name: exit $rc"; FAIL=$((FAIL+1)); return; fi
  if [ -z "$out" ]; then got=silent
  elif [ "$(jq -r '.hookSpecificOutput.hookEventName // empty' <<<"$out")" = PermissionRequest ] &&
       [ "$(jq -r '.hookSpecificOutput.decision.behavior // empty' <<<"$out")" = deny ] &&
       [ -n "$(jq -r '.hookSpecificOutput.decision.message // empty' <<<"$out")" ]; then got=deny
  else got="malformed: $out"; fi
  if [ "$got" = "$want" ] && { [ -z "$word" ] || grep -q -- "$word" <<<"$out"; }; then
    echo "PASS: $name"; PASS=$((PASS+1))
  else echo "FAIL: $name: want $want${word:+ with '$word'}, got $got"; FAIL=$((FAIL+1)); fi
}

RMV='rm -rf "$HOME/${rel:?}"/*'
check "bypass, removal with a variable"   deny   "$(req bypassPermissions Bash "$RMV")" "literal absolute path"
check "bypass, rmdir"                     deny   "$(req bypassPermissions Bash 'rmdir "$d"')" "literal absolute path"
check "bypass, Monitor command"           deny   "$(req bypassPermissions Monitor 'cd x && rm -rf "$t"')" "literal absolute path"
check "bypass, no removal word"           deny   "$(req bypassPermissions Bash 'bash -c "$script"')" "Write tool"
check "bypass, word that only contains rm" deny  "$(req bypassPermissions Bash 'npm run format')" "Write tool"
check "never an allow"                    deny   "$(req bypassPermissions Bash 'rm -rf /tmp/x')"
check "default mode: the person answers"  silent "$(req default Bash "$RMV")"
check "acceptEdits mode"                  silent "$(req acceptEdits Bash "$RMV")"
check "auto mode"                         silent "$(req auto Bash "$RMV")"
check "plan mode"                         silent "$(req plan Bash "$RMV")"
check "no mode in the input"              silent "$(jq -cn '{tool_name:"Bash",tool_input:{command:"rm -rf x"}}')"
check "another tool in bypass"            silent "$(req bypassPermissions Write 'x')"
check "MCP tool in bypass"                silent "$(req bypassPermissions mcp__x__y 'x')"
check "not JSON"                          silent "rm -rf /"
check "empty input"                       silent ""

out=$(printf '%s' "$(req bypassPermissions Bash "$RMV")" | bash "$HOOK")
if [ "$(jq -r '.hookSpecificOutput.decision | has("updatedInput") or has("updatedPermissions")' <<<"$out")" = false ]; then
  echo "PASS: deny carries no input or permission change"; PASS=$((PASS+1))
else echo "FAIL: deny carries an input or permission change"; FAIL=$((FAIL+1)); fi
n=$(wc -l <"$XDG_CACHE_HOME/nadavai/rm-prompt-answer.log" 2>/dev/null || echo 0)
if [ "$n" -ge 6 ]; then echo "PASS: answers are logged ($n lines)"; PASS=$((PASS+1))
else echo "FAIL: answers are not logged ($n lines)"; FAIL=$((FAIL+1)); fi

echo "----"
echo "rm prompt answer: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
