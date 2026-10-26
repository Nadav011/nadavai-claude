#!/usr/bin/env bash
# test-agent-guard.sh: feeds the PreToolUse guard the JSON Claude Code sends on stdin
# and checks each case either denies (a PreToolUse deny decision on stdout) or stays
# silent (exit 0, nothing on stdout).
set -uo pipefail
GUARD="$(cd "$(dirname "$0")/.." && pwd)/scripts/agent-guard.sh"
CASES="$(cd "$(dirname "$0")" && pwd)/agent-guard-strict-cases.jsonl"
PASS=0; FAIL=0
# Strict mode follows ${XDG_CONFIG_HOME}/nadavai/guard-strict: off here, on under $STRICT_CFG.
tmp=$(mktemp -d); trap 'rm -rf -- "$tmp"' EXIT
export XDG_CONFIG_HOME=$tmp/off
STRICT_CFG=$tmp/on; mkdir -p "$STRICT_CFG/nadavai"; : >"$STRICT_CFG/nadavai/guard-strict"

check() {  # name  expect(deny|allow)  json
  local name="$1" want="$2" json="$3" out rc got
  out=$(printf '%s' "$json" | bash "$GUARD"); rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL: $name — exit $rc"; FAIL=$((FAIL+1)); return; fi
  if [ -z "$out" ]; then got=allow
  elif [ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$out")" = deny ] &&
       [ "$(jq -r '.hookSpecificOutput.hookEventName // empty' <<<"$out")" = PreToolUse ] &&
       [ -n "$(jq -r '.hookSpecificOutput.permissionDecisionReason // empty' <<<"$out")" ] &&
       [ "$(jq -r '.hookSpecificOutput | has("updatedInput")' <<<"$out")" = false ]; then got=deny
  elif [ "$(jq -r '.decision // empty' <<<"$out")" = deny ] &&
       [ -n "$(jq -r '.reason // empty' <<<"$out")" ]; then got=deny
  elif [ "$(jq -r '.decision // empty' <<<"$out")" = ask ]; then got=allow
  else got="malformed: $out"; fi
  if [ "$got" = "$want" ]; then echo "PASS: $name"; PASS=$((PASS+1))
  else echo "FAIL: $name — want $want, got $got"; FAIL=$((FAIL+1)); fi
}
agent() { jq -cn --arg t "$1" --arg d "$2" '{hook_event_name:"PreToolUse",tool_name:"Agent",tool_input:{subagent_type:$t,description:$d,prompt:"p"}}'; }
bashc() { jq -cn --arg c "$1" --argjson bg "${2:-false}" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c,run_in_background:$bg}}'; }
agy_cmd() { jq -cn --arg c "$1" --argjson d "${2:-false}" '{toolCall:{name:"run_command",args:{CommandLine:$c,IsDaemon:$d}}}'; }
agy_sub() { jq -cn --arg t "$1" --arg r "$2" '{toolCall:{name:"invoke_subagent",args:{Subagents:[{TypeName:$t,Role:$r,Prompt:"p"}]}}}'; }

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
check "agy: sleep 120"              deny  "$(agy_cmd 'sleep 120')"
check "agy: sleep 60"               allow "$(agy_cmd 'sleep 60')"
check "agy: sleep 300 daemon"       allow "$(agy_cmd 'sleep 300' true)"
check "agy: normal command"         allow "$(agy_cmd 'pnpm test')"
check "agy: fork without tag"       deny  "$(agy_sub fork 'Review')"
check "agy: fork with [fork] tag"   allow "$(agy_sub fork '[fork] Review')"
check "agy: research subagent"      allow "$(agy_sub research 'Search')"

# Strict mode. Hand-written edges first, then the table of real commands (agent transcripts,
# 19-26.10.2026): every row with strict on as marked, and every row allowed with strict off.
strict() { XDG_CONFIG_HOME=$STRICT_CFG check "strict: $1" "$2" "$3"; }
strict "until gh polling"              deny  "$(bashc 'until gh pr checks 12 | grep -qv pending; do sleep 30; done')"
strict "while true gh api, background" deny  "$(bashc 'while true; do gh api repos/o/r/commits/abc/status; sleep 60; done' true)"
strict "task output poll in bash -c"   deny  "$(bashc "timeout 590 bash -c 'until grep -q exit= /tmp/claude-1000/x/tasks/b1.output; do sleep 5; done'")"
strict "sleep 0.5 loop"                deny  "$(bashc 'while pgrep -x node >/dev/null; do sleep 0.5; done')"
strict "sleep 1 until loop"            deny  "$(bashc 'until [ -s out.txt ]; do sleep 1; done')"
strict "sleep 2 until loop"            allow "$(bashc 'until [ -s out.txt ]; do sleep 2; done')"
strict "readiness: curl localhost"     allow "$(bashc 'until curl -sf http://localhost:5173 >/dev/null; do sleep 0.5; done')"
strict "readiness: port check"         allow "$(bashc 'while ss -ltn | grep -q :3311; do sleep 0.3; done')"
strict "readiness: pg_isready"         allow "$(bashc 'until docker exec pg pg_isready -q; do sleep 1; done')"
strict "for loop with sleep 1"         allow "$(bashc 'for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done')"
strict "while read with sleep 1"       allow "$(bashc 'cut -f1 ids.txt | while read -r id; do curl -s "https://x/$id"; sleep 1; done')"
strict "while read gh pagination"      allow "$(bashc 'while read -r n; do gh pr view "$n"; sleep 1; done < prs.txt')"
strict "gh loop without sleep"         allow "$(bashc 'p=1; while [ $p -le 3 ]; do gh api "repos/o/r/pulls?page=$p"; p=$((p+1)); done')"
strict "heavy.sh internals"            allow "$(bashc 'scripts/v4/heavy.sh shared -- bash -c "while pgrep -f vitest; do sleep 1; done"')"
strict "loop text in a string"         allow "$(bashc 'echo "until gh pr checks; do sleep 1; done"')"
strict "loop in a heredoc body"        allow "$(bashc $'cat > w.sh <<\'EOF\'\nwhile true; do gh run list; sleep 1; done\nEOF')"
strict "docker run -d postgres"        deny  "$(bashc 'docker run -d --rm --name p -e POSTGRES_PASSWORD=x postgres:17-alpine -c fsync=off')"
strict "docker run -dit, \\ continued" deny "$(bashc $'docker run -dit --name p \\\n  -e POSTGRES_PASSWORD=x postgres:16')"
strict "docker run -d \$IMG resolved"  deny  "$(bashc 'IMG=public.ecr.aws/supabase/postgres:17.6.1.165; docker run -d --name p $IMG postgres -D /etc/postgresql')"
strict "cid=\$(docker run -d ...)"    deny  "$(bashc 'cid=$(docker run -d -e POSTGRES_PASSWORD=x postgres:16) && echo $cid')"
strict "docker run -d in a heredoc"    deny  "$(bashc $'cat > run.sh <<\'EOF\'\ndocker run -d -e POSTGRES_PASSWORD=x postgres:17\nEOF\nbash run.sh')"
strict "docker run -d with marker"     allow "$(bashc 'docker run -d -e POSTGRES_PASSWORD=x postgres:17 # isolated-pg: creates roles')"
strict "client with --entrypoint"      allow "$(bashc 'docker run --rm -d --entrypoint pg_dump postgres:17 -h db.example -s')"
strict "docker run without -d"         allow "$(bashc 'docker run --rm -i postgres:17 psql --version')"
strict "docker run -d other image"     allow "$(bashc 'docker run -d --name r redis:7')"
strict "docker ps"                     allow "$(bashc 'docker ps --format "{{.Names}}" | grep postgres')"
strict "agy: until gh polling"         deny  "$(agy_cmd 'until gh run view 1 --exit-status; do sleep 30; done')"
strict "agy: daemon docker postgres"   deny  "$(agy_cmd 'docker run -d -e POSTGRES_PASSWORD=x postgres:17' true)"
# M5: gh counts only when it reads a status; kill -0 waits at 2 s or more pass.
strict "M5 gh pr view loop (not a status)" allow "$(bashc 'while true; do gh pr view 12 --json title; sleep 30; done')"
strict "M5 gh run watch loop"            deny  "$(bashc 'until gh run watch 123; do sleep 10; done')"
strict "M5 gh api check-runs loop"       deny  "$(bashc 'while :; do gh api repos/o/r/commits/abc/check-runs; sleep 20; done')"
strict "M5 while kill -0, sleep 5"       allow "$(bashc 'while kill -0 "$pid" 2>/dev/null; do sleep 5; done')"
strict "M5 while kill -0, sleep 1"       deny  "$(bashc 'while kill -0 "$pid" 2>/dev/null; do sleep 1; done')"
# M5: a heredoc counts for the docker rule only when it runs.
strict "M5 heredoc to a doc, not run"    allow "$(bashc $'cat > notes.md <<\'EOF\'\nStart it with: docker run -d -e POSTGRES_PASSWORD=x postgres:17\nEOF')"
strict "M5 heredoc fed to bash"          deny  "$(bashc $'bash <<\'EOF\'\ndocker run -d -e POSTGRES_PASSWORD=x postgres:17\nEOF')"
strict "M5 heredoc file run as \$D/r.sh" deny  "$(bashc $'cat > $D/r.sh <<EOF\ndocker run -d -e POSTGRES_PASSWORD=x postgres:17\nEOF\nchmod +x $D/r.sh && $D/r.sh')"
strict "M5 heredoc via tee, ./run.sh"    deny  "$(bashc $'tee run.sh >/dev/null <<\'EOF\'\ndocker run -d postgres:16\nEOF\n./run.sh')"
strict "M5 heredoc file, other file run" allow "$(bashc $'cat > a.sh <<\'EOF\'\ndocker run -d postgres:16\nEOF\nbash b.sh')"
# L11: here-strings and shifts are not heredocs, so what follows them is still read.
strict "L11 <<< then a gh poll"          deny  "$(bashc $'grep -c x <<<"$v"\nuntil gh pr checks 1; do sleep 9; done')"
strict "L11 (( 1 << 3 )) then a gh poll" deny  "$(bashc $'n=$(( 1 << 3 ))\nuntil gh pr checks 1; do sleep 9; done')"
# L11: more postgres images and flag clusters; compose files with a postgres service.
strict "L11 bitnami/postgresql"          deny  "$(bashc 'docker run -d --name p bitnami/postgresql:16')"
strict "L11 -dp 5432:5432"               deny  "$(bashc 'docker run -dp 5432:5432 -e POSTGRES_PASSWORD=x postgres:16')"
strict "L11 -itd pgvector"               deny  "$(bashc 'docker run -itd --name v pgvector/pgvector:pg16')"
strict "L11 postgrest is not postgres"   allow "$(bashc 'docker run -d --name api public.ecr.aws/supabase/postgrest:v14.14')"
strict "L11 -it without -d"              allow "$(bashc 'docker run -it --rm postgres:16 psql --version')"
mkdir -p "$tmp/pgproj" "$tmp/redisproj"
printf 'services:\n  db:\n    image: postgres:16-alpine\n' >"$tmp/pgproj/compose.yaml"
printf 'services:\n  cache:\n    image: redis:7\n' >"$tmp/redisproj/docker-compose.yml"
bashcwd() { jq -cn --arg c "$1" --arg d "$2" '{hook_event_name:"PreToolUse",tool_name:"Bash",cwd:$d,tool_input:{command:$c}}'; }
strict "L11 compose up -d, postgres"     deny  "$(bashcwd 'docker compose up -d' "$tmp/pgproj")"
strict "L11 compose -f file --detach"    deny  "$(bashcwd "docker compose -f $tmp/pgproj/compose.yaml up --detach db" "$tmp")"
strict "L11 docker-compose up -d, redis" allow "$(bashcwd 'docker-compose up -d' "$tmp/redisproj")"
strict "L11 compose up, foreground"      allow "$(bashcwd 'docker compose up' "$tmp/pgproj")"
# (6) supabase stacks, podman, and images left as a PG-named variable.
strict "(6) supabase start"              deny  "$(bashc 'cd ~/proj && supabase start')"
strict "(6) npx supabase start"          deny  "$(bashc 'npx supabase start -x studio,imgproxy')"
strict "(6) npx supabase@latest start"   deny  "$(bashc 'npx supabase@latest start')"
strict "(6) supabase db start"           deny  "$(bashc 'supabase --workdir /tmp/w db start')"
strict "(6) pnpm exec supabase start"    deny  "$(bashc 'pnpm exec supabase start')"
strict "(6) supabase start, marker"      allow "$(bashc 'supabase start # isolated-pg: testing the stack itself')"
strict "(6) supabase stop"               allow "$(bashc 'supabase stop --no-backup')"
strict "(6) supabase db reset"           allow "$(bashc 'supabase db reset --local')"
strict "(6) supabase start in a string"  allow "$(bashc 'echo "run supabase start first"')"
strict "(6) podman run -d postgres"      deny  "$(bashc 'podman run -d --name p -e POSTGRES_PASSWORD=x docker.io/library/postgres:16')"
strict "(6) podman run -d redis"         allow "$(bashc 'podman run -d --name r redis:7')"
strict "(6) docker run -d \"\$PG_IMAGE\""  deny  "$(bashc 'docker run -d --name p "$PG_IMAGE"')"
strict "(6) docker run -d \${POSTGRES_IMG}" deny "$(bashc 'docker run -d --name p ${POSTGRES_IMG}')"
strict "(6) docker run -d \$REDIS_IMAGE" allow "$(bashc 'docker run -d --name r "$REDIS_IMAGE"')"
strict "(6) \$PG_IMAGE with marker"      allow "$(bashc 'docker run -d "$PG_IMAGE" # isolated-pg: roles')"
# #4 wrappers before supabase; #5 help and exporters pass.
strict "#4 timeout 600 supabase start"   deny  "$(bashc 'timeout 600 supabase start')"
strict "#4 timeout -k 5 -s INT 600 ..."  deny  "$(bashc 'timeout -k 5 -s INT 600 supabase db start')"
strict "#4 nohup env -i A=1 supabase"    deny  "$(bashc 'nohup env -i A=1 supabase start &')"
strict "#4 nice -n 10 stdbuf -oL ..."    deny  "$(bashc 'nice -n 10 stdbuf -oL supabase start')"
strict "#4 sudo -u me supabase start"    deny  "$(bashc 'sudo -u me supabase start')"
strict "#4 time supabase start"          deny  "$(bashc 'time supabase start')"
strict "#4 npx -y supabase start"        deny  "$(bashc 'npx -y supabase start')"
strict "#4 npx --yes -p supabase supabase@2.40.7 start" deny "$(bashc 'npx --yes -p supabase supabase@2.40.7 start')"
strict "#4 pnpm dlx supabase start"      deny  "$(bashc 'pnpm dlx supabase start')"
strict "#4 bunx supabase@latest db start" deny "$(bashc 'bunx supabase@latest db start')"
strict "#4 A=1 supabase start"           deny  "$(bashc 'SUPABASE_X=1 supabase start')"
strict "#5 supabase start --help"        allow "$(bashc 'supabase start --help')"
strict "#5 npx supabase db start -h"     allow "$(bashc 'npx supabase db start -h')"
strict "#5 timeout 5 supabase --help"    allow "$(bashc 'timeout 5 supabase --help')"
strict "#4 grep supabase start (arg)"    allow "$(bashc 'grep -rn "supabase start" docs/ | head')"
strict "#4 echo supabase start"          allow "$(bashc 'echo supabase start')"
strict "#5 postgres-exporter"            allow "$(bashc 'docker run -d --name pe quay.io/prometheuscommunity/postgres-exporter')"
strict "#5 wrouesnel postgres_exporter"  allow "$(bashc 'docker run -d wrouesnel/postgres_exporter:latest')"
check "strict off: supabase start"     allow "$(bashc 'supabase start')"
check "strict off: until gh polling"   allow "$(bashc 'until gh pr checks 12 | grep -qv pending; do sleep 30; done')"
check "strict off: docker postgres"    allow "$(bashc 'docker run -d -e POSTGRES_PASSWORD=x postgres:17')"

if [ -f "$CASES" ]; then
  allow_n=0 deny_n=0
  while IFS= read -r row; do
    want=$(jq -r .want <<<"$row"); id=$(jq -r .id <<<"$row")
    json=$(jq -c '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:.command,run_in_background:.bg}}' <<<"$row")
    strict "real $id" "$want" "$json"
    check "strict off: real $id" allow "$json"
    [ "$want" = allow ] && allow_n=$((allow_n+1)) || deny_n=$((deny_n+1))
  done <"$CASES"
  echo "real commands: $allow_n allowed, $deny_n denied with strict on"
else
  echo "FAIL: $CASES is missing"; FAIL=$((FAIL+1))
fi

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
