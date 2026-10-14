#!/usr/bin/env bash
# test-agent-guard.sh: feeds the PreToolUse guard the JSON Claude Code sends on stdin
# and checks each case either denies (a PreToolUse deny decision on stdout) or stays
# silent (exit 0, nothing on stdout).
set -uo pipefail
GUARD="$(cd "$(dirname "$0")/.." && pwd)/scripts/agent-guard.sh"
PASS=0; FAIL=0

check() {  # name  expect(deny|allow)  json
  local name="$1" want="$2" json="$3" out rc got
  out=$(printf '%s' "$json" | bash "$GUARD"); rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL: $name — exit $rc"; FAIL=$((FAIL+1)); return; fi
  if [ -z "$out" ]; then got=allow
  elif [ "$(jq -r '.hookSpecificOutput.permissionDecision' <<<"$out")" = deny ] &&
       [ "$(jq -r '.hookSpecificOutput.hookEventName' <<<"$out")" = PreToolUse ] &&
       [ -n "$(jq -r '.hookSpecificOutput.permissionDecisionReason' <<<"$out")" ] &&
       [ "$(jq -r '.hookSpecificOutput | has("updatedInput")' <<<"$out")" = false ]; then got=deny
  else got="malformed: $out"; fi
  if [ "$got" = "$want" ]; then echo "PASS: $name"; PASS=$((PASS+1))
  else echo "FAIL: $name — want $want, got $got"; FAIL=$((FAIL+1)); fi
}
agent() { jq -cn --arg t "$1" --arg d "$2" '{hook_event_name:"PreToolUse",tool_name:"Agent",tool_input:{subagent_type:$t,description:$d,prompt:"p"}}'; }
bashc() { jq -cn --arg c "$1" --argjson bg "${2:-false}" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c,run_in_background:$bg}}'; }

check "fork without tag"            deny  "$(agent fork 'Review the plan')"
check "fork with [fork] tag"        allow "$(agent fork '[fork] Review the plan')"
check "named subagent"              allow "$(agent oh-my-claudecode:executor 'Implement C1')"
check "named subagent, fork in prompt text" allow "$(jq -cn '{tool_name:"Agent",tool_input:{subagent_type:"Explore",description:"d",prompt:"do not \"fork\" this"}}')"
check "no subagent_type"            allow "$(jq -cn '{tool_name:"Agent",tool_input:{description:"d",prompt:"p"}}')"
check "sleep 120"                   deny  "$(bashc 'sleep 120')"
check "sleep 119"                   allow "$(bashc 'sleep 119')"
check "sleep 595 then grep"         deny  "$(bashc 'cd /x && sleep 595; grep -c PASS log')"
check "sleep 2m"                    deny  "$(bashc 'sleep 2m')"
check "sleep 1m"                    allow "$(bashc 'sleep 1m')"
check "sleep 300 on line 2"         deny  "$(bashc $'echo start\nsleep 300')"
check "sleep 300 in a loop body"    deny  "$(bashc 'while pgrep x; do sleep 300; done')"
check "sleep 15 in a poll loop"     allow "$(bashc 'while pgrep x; do sleep 15; done')"
check "sleep 600 in background"     allow "$(bashc 'sleep 600 && echo done' true)"
check "sleep inside a string"       allow "$(bashc 'echo "remember: sleep 300 is bad"')"
check "sleep 0.5h"                  deny  "$(bashc 'sleep 0.5h')"
check "sleep 1m 60s (summed)"       deny  "$(bashc 'sleep 1m 60s')"
check "sleep 08m (no octal)"        deny  "$(bashc 'sleep 08m')"
check "sleep 1.5 (fraction)"        allow "$(bashc 'sleep 1.5')"
check "sleep in a quoted list"      allow "$(bashc 'echo "first; sleep 300; last"')"
check "sleep in single quotes"      allow "$(bashc "echo 'a; sleep 300'")"
check "sleep in a heredoc body"     allow "$(bashc $'cat <<\'EOF\' > run.sh\nsleep 300\nEOF\nbash -n run.sh')"
check "sleep after a heredoc"       deny  "$(bashc $'cat <<EOF > x\nhi\nEOF\nsleep 300')"
check "no sleep at all"             allow "$(bashc 'pnpm test')"
check "sleepy word"                 allow "$(bashc 'cat sleep_300.log')"
check "other tool"                  allow "$(jq -cn '{tool_name:"Read",tool_input:{file_path:"/tmp/sleep 300"}}')"
check "not JSON"                    allow "sleep fork"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
