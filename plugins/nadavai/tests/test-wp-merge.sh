#!/usr/bin/env bash
# Cases for agent-guard's wp_merge_check (CI v2): a fake gh answers, the guard allows or denies.
D=$(dirname "$(readlink -f "$0")")/fixtures/wp-gh
G=$(dirname "$(readlink -f "$0")")/../scripts/agent-guard.sh
W=$(mktemp -d); trap 'rm -rf -- "$W"' EXIT; mkdir -p "$W/lib"; echo Snooker-Smart >"$W/lib/woodpecker-repos.txt"; export NADAVAI_HOME=$W
fail=0
run() { # expect state ahead mainfiles [command] [extra env assignments...]
  local exp=$1 st=$2 ah=$3 mf=$4 cmd=${5:-"gh pr merge 141 -R Nadav011/snooker-smart --squash --match-head-commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"} out got
  shift 5 2>/dev/null || shift $#
  out=$(jq -cn --arg c "$cmd" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}}' \
    | env PATH="$D:$PATH" FAKE_STATE="$st" FAKE_AHEAD="$ah" FAKE_MAIN_FILES="$mf" "$@" bash "$G" 2>/dev/null)
  got=allow; grep -q '"deny"' <<<"$out" && got=deny
  [ "$got" = "$exp" ] || fail=1
  printf '%-4s expected %-5s state=%-7s ahead=%-3s main=[%s] %s %s\n' "$([ "$got" = "$exp" ] && echo PASS || echo FAIL)" "$exp" "$st" "$ah" "$mf" "${cmd:0:40}" "$*"
}
D_CMD="gh pr merge 141 -R Nadav011/snooker-smart --squash --match-head-commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
run allow success 0 ""
run deny  failure 0 ""
run deny  none    0 ""
run allow success 3 "src/c.ts docs/x.md"
run deny  success 3 "src/a.ts"
run deny  success 2 "pnpm-lock.yaml"
run deny  success 1 "apps/web/vite.config.ts"
run deny  success 1 "supabase/migrations/2026.sql"
run allow success 1 "README.md"
run deny  success 0 "" "$D_CMD" FAKE_SECOND=failure
run allow success 0 "" "$D_CMD" FAKE_SECOND=success
run deny  success 3 "" "$D_CMD" FAKE_NMAIN=300
run deny  success 251 "src/c.ts"
run deny  success 0 "" 'gh pr merge "$PR" -R Nadav011/snooker-smart --squash'
run allow failure 0 "" "gh pr merge 141 -R Nadav011/snooker-smart --squash # land-urgent: test"
# nadavai-security (secscan on nadavai-svc): red, error or still running blocks; none passes only in the grace.
run deny  success 0 "" "$D_CMD" FAKE_SEC=failure
run deny  success 0 "" "$D_CMD" FAKE_SEC=error
run deny  success 0 "" "$D_CMD" FAKE_SEC=pending
run allow success 0 "" "$D_CMD" FAKE_SEC=none FAKE_AGE=3
run deny  success 0 "" "$D_CMD" FAKE_SEC=none FAKE_AGE=30
run deny  success 3 "src/c.ts" "$D_CMD" FAKE_SEC=failure
run allow success 0 "" "gh pr merge 141 -R Nadav011/snooker-smart --squash # land-urgent: test" FAKE_SEC=failure
run allow success 0 "" "$D_CMD" FAKE_STATUS_FAIL=1
# --match-head-commit is required and must name the head the guard sees.
run deny  success 0 "" "gh pr merge 141 -R Nadav011/snooker-smart --squash"
run deny  success 0 "" "gh pr merge 141 -R Nadav011/snooker-smart --squash --match-head-commit bbbbbbbbbbbb"
run allow success 0 "" "gh pr merge 141 -R Nadav011/snooker-smart --squash --match-head-commit=aaaaaaaa"
exit $fail
