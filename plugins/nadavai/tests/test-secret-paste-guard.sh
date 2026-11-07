#!/usr/bin/env bash
# test-secret-paste-guard.sh: feeds the UserPromptSubmit hook secret-paste-guard.mjs the JSON
# Claude Code sends on stdin and checks each prompt is blocked (decision "block") or passes (no
# output), that matched keys are saved with mode 600, that the reason never holds a full key,
# and that the detached child scrubs history.jsonl (under Claude Code's lock), paste-cache and
# Orca's hook spool. Every fake key is built
# from parts at runtime, so no key-shaped literal sits in this file for the pre-push scan.
set -uo pipefail
GUARD="$(cd "$(dirname "$0")/.." && pwd)/scripts/secret-paste-guard.mjs"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
export HOME="$tmp/home" CLAUDE_CONFIG_DIR="$tmp/cfg" TMPDIR="$tmp/tmp" ORCA_AGENT_HOOK_ENDPOINT="$tmp/orca/endpoint.env"
SPOOL="$HOME/.config/orca/agent-hooks/spool"
mkdir -p "$HOME/.claude/paste-cache" "$CLAUDE_CONFIG_DIR/paste-cache" "$TMPDIR" "$SPOOL" "$tmp/orca/spool"

rep() { local s="" i; for ((i = 0; i < $2; i++)); do s+="$1"; done; printf '%s' "$s"; }
D="-----"
ANT="sk-ant-$(rep x 30)"
OAI="sk-proj-$(rep Ab1 15)"
OAI_OLD="sk-$(rep aB3 16)"
GHP="ghp_$(rep a 36)"
GHO="gho_$(rep b 36)"
GHS="ghs_$(rep B 36)"
GPAT="github_pat_$(rep c 62)"
AWS="AKIA$(rep Z 16)"
XOX="xoxb-$(rep 1 24)"
PK="${D}BEGIN RSA PRIV""ATE KEY${D}"$'\n'"$(rep Mm9 20)"$'\n'"$(rep Qq7 10)"$'\n'"${D}END RSA PRIV""ATE KEY${D}"
GL="glpat-$(rep d 22)"
SKL="sk_""live_$(rep e 24)"
RKL="rk_""live_$(rep E 24)"
SB="sb_""secret_$(rep f 24)"
AIZA="AIza$(rep g 35)"

run() {  # prompt -> block|allow|bad (stdout of the hook in $tmp/out)
  local json; json=$(jq -n --arg p "$1" '{hook_event_name:"UserPromptSubmit",session_id:"s1",transcript_path:"/nonexistent",prompt:$p}')
  raw "$json"
}
raw() {  # stdin -> block|allow|bad
  local OUT; OUT=$(printf '%s' "$1" | node "$GUARD"); [ $? -eq 0 ] || { echo "exit-fail"; return; }
  printf '%s' "$OUT" >"$tmp/out"
  if [ -z "$OUT" ]; then echo allow
  elif [ "$(jq -r '.decision // empty' <<<"$OUT")" = block ]; then echo block
  else echo "bad output"; fi
}
expect() {  # name want got
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want $2, got $3"; FAIL=$((FAIL+1)); fi
}
check() { expect "$1" "$2" "$(run "$3")"; }

# --- scrub fixtures, planted before the block (history.jsonl is a symlink, as in Orca profiles) ---
jq -nc --arg d "please use $ANT for the api" '{display:$d,project:"/x"}' >"$HOME/.claude/history.jsonl"
jq -nc --arg d "the key: $PK" '{display:$d,project:"/x"}' >>"$HOME/.claude/history.jsonl"
jq -nc '{display:"unrelated line",project:"/x"}' >>"$HOME/.claude/history.jsonl"
chmod 600 "$HOME/.claude/history.jsonl"
ln -s "$HOME/.claude/history.jsonl" "$CLAUDE_CONFIG_DIR/history.jsonl"
printf 'pasted text with %s inside\n' "$ANT" >"$HOME/.claude/paste-cache/aaaa.txt"
printf 'other paste %s\n' "$ANT" >"$CLAUDE_CONFIG_DIR/paste-cache/bbbb.txt"
printf 'no secrets here\n' >"$CLAUDE_CONFIG_DIR/paste-cache/cccc.txt"
chmod 600 "$HOME/.claude/paste-cache/aaaa.txt"; chmod 640 "$CLAUDE_CONFIG_DIR/paste-cache/bbbb.txt"
# Orca's hook spools the hook payload (the prompt JSON-escaped) while Orca is unreachable.
spool_line() { jq -nc --arg p "$1" '{paneKey:"p",payload:{hook_event_name:"UserPromptSubmit",prompt:$p}}'; }
spool_line "use $ANT" >"$SPOOL/pane-aaaa.jsonl"; chmod 600 "$SPOOL/pane-aaaa.jsonl"
spool_line "the key: $PK" >"$tmp/orca/spool/pane-bbbb.jsonl"; chmod 600 "$tmp/orca/spool/pane-bbbb.jsonl"
printf 'not a pane file %s\n' "$ANT" >"$SPOOL/other.txt"

# A second and third home: history.jsonl under a held lock, and under a stale one.
for h in h2 h3; do mkdir -p "$tmp/$h/.claude"; done
K2="glpat-$(rep h 22)"; K3="glpat-$(rep i 22)"
printf '{"display":"%s"}\n' "$K2" >"$tmp/h2/.claude/history.jsonl"
printf '{"display":"%s"}\n' "$K3" >"$tmp/h3/.claude/history.jsonl"
mkdir "$tmp/h2/.claude/history.jsonl.lock"
mkdir "$tmp/h3/.claude/history.jsonl.lock"; touch -d '-60 seconds' "$tmp/h3/.claude/history.jsonl.lock"
in_home() { (export HOME="$tmp/$1" CLAUDE_CONFIG_DIR="$tmp/$1/.claude"; run "$2"); }
expect "held lock: blocks"  block "$(in_home h2 "key $K2")"
expect "stale lock: blocks" block "$(in_home h3 "key $K3")"

# --- every pattern blocks ---
t0=$(date +%s%N)
check "anthropic"          block "use this key $ANT thanks"
ms=$(( ($(date +%s%N) - t0) / 1000000 ))
if [ "$ms" -lt 1000 ]; then expect "block under 1 s (${ms} ms)" ok ok; else expect "block under 1 s" ok "${ms} ms"; fi
REASON_ANT=$(jq -r '.reason' "$tmp/out"); SUPPRESS=$(jq -r '.hookSpecificOutput.suppressOriginalPrompt' "$tmp/out")
check "openai proj"        block "OPENAI_API_KEY=$OAI"
check "openai legacy"      block "key: $OAI_OLD"
check "github ghp"         block "token $GHP"
check "github gho"         block "token $GHO"
check "github ghs"         block "token $GHS"
check "github pat"         block "token $GPAT"
check "aws"                block "aws_access_key_id = $AWS"
check "slack"              block "slack $XOX"
check "private key"        block "the key: $PK"
REASON_PK=$(jq -r '.reason' "$tmp/out")
check "gitlab"             block "gitlab $GL"
check "stripe live"        block "stripe $SKL"
check "stripe restricted"  block "stripe $RKL"
check "supabase secret"    block "SUPABASE_SECRET=$SB"
check "google server key"  block "server key: $AIZA"
check "in code fence"      block $'```\n'"$ANT"$'\n```'
check "in pasted_content"  block $'<pasted_content id="1">\nexport X='"$GL"$'\n</pasted_content id="1">'
check "pem without END"    block "${D}BEGIN PRIV""ATE KEY${D}"$'\n'"$(rep Ab12Cd34 8)"$'\n'"$(rep Ef56Gh78 8)"$'\n'"$(rep Ij90Kl12 8)"$'\n'"$(rep Mn34 4)"
check "sk-proj with dashes" block "OPENAI_API_KEY=sk-proj-$(rep Ab1De2Gh3J- 12)"

# --- these pass ---
check "firebase web key"   allow "firebase apiKey: \"$AIZA\""
check "jwt"                allow "token eyJ$(rep hbGciOiJIUzI1NiJ9 2).eyJ$(rep zdWIiOiIxMjM0 3).$(rep SflKxwRJ 4)"
check "uuid"               allow "session 0f8fad5b-d9cb-469f-a165-70867728950e"
check "git sha"            allow "commit 3f786850e387550fdab836ed7e6dc881de23001b"
check "task slug"          allow "task-$(rep abc 20) and risk-$(rep def 20) and disk-$(rep Ab1 20)"
check "kebab sk- slug"     allow "branch sk-add-the-new-feature-for-payments-and-billing-flow"
check "sk- prefix mention" allow "the sk- prefix marks OpenAI keys"
check "hebrew"             allow "תבדוק מה קורה עם הסקריפט, הרצתי אותו ונכשל"
check "plain password"     allow "the password is Hunter2!Hunter2"
check "pem header in code" allow "if (pem.startsWith(\"${D}BEGIN PRIV""ATE KEY${D}\")) parse(pem)"$'\n'"then we read the rest of the file and check every line of it carefully before we go on"
check "pem header + prose" allow "${D}BEGIN PRIV""ATE KEY${D}"$'\n'"this is where the key goes when you paste it into the file and then you save it"
check "pem short body"     allow "${D}BEGIN PRIV""ATE KEY${D}"$'\n'"$(rep Ab12Cd34 6)"
check "sk- mixed branch"   allow "branch sk-Add-OAuth2-Support-For-Payments-Module-Refactor"
check "aws docs example"   allow "aws_access_key_id = AKIA""IOSFODNN7""EXAMPLE"

# --- a 1 MB paste stays fast and still blocks (at most 50 kept, 5 listed) ---
awk 'BEGIN { for (i = 0; i < 50000; i++) printf "AKIA%016d\n", i }' >"$tmp/big.txt"
big() { jq -n --rawfile p "$1" '{hook_event_name:"UserPromptSubmit",prompt:$p}' >"$tmp/big.json"; }
big "$tmp/big.txt"
t0=$(date +%s%N); got=$(raw "$(cat "$tmp/big.json")"); ms=$(( ($(date +%s%N) - t0) / 1000000 ))
expect "1 MB distinct keys block" block "$got"
if [ "$ms" -lt 1000 ]; then expect "1 MB distinct under 1 s (${ms} ms)" ok ok; else expect "1 MB distinct under 1 s" ok "${ms} ms"; fi
REASON_BIG=$(jq -r '.reason' "$tmp/out")
expect "reason lists 5 + more" 5 "$(grep -c '^- AWS access key' <<<"$REASON_BIG")"
case "$REASON_BIG" in *"ועוד לפחות 45 מפתחות"*) expect "reason +N more" ok ok ;; *) expect "reason +N more" ok bad ;; esac
awk 'BEGIN { for (i = 0; i < 50000; i++) printf "AKIA%016d\n", 7 }' >"$tmp/big.txt"
big "$tmp/big.txt"
t0=$(date +%s%N); got=$(raw "$(cat "$tmp/big.json")"); ms=$(( ($(date +%s%N) - t0) / 1000000 ))
expect "1 MB same key blocks" block "$got"
if [ "$ms" -lt 1000 ]; then expect "1 MB same key under 1 s (${ms} ms)" ok ok; else expect "1 MB same key under 1 s" ok "${ms} ms"; fi
expect "same key listed once" 1 "$(jq -r '.reason' "$tmp/out" | grep -c '^- AWS access key')"

# --- malformed input passes ---
expect "empty stdin"       allow "$(raw '')"
expect "bad json"          allow "$(raw '{nope')"
expect "no prompt"         allow "$(raw '{"hook_event_name":"UserPromptSubmit"}')"
expect "prompt not string" allow "$(raw '{"hook_event_name":"UserPromptSubmit","prompt":42}')"

# --- reason: Hebrew, type and last 4 only, original prompt suppressed ---
leak=no
for v in "$ANT" "$OAI" "$OAI_OLD" "$GHP" "$GPAT" "$AWS" "$XOX" "$GL" "$SKL" "$SB" "$AIZA" "$(rep Mm9 20)"; do
  case "$REASON_ANT$REASON_PK" in *"$v"*) leak=yes ;; esac
done
expect "reason holds no full key" no "$leak"
case "$REASON_ANT" in *"נעצרה"*"${ANT: -4}"*"pasted-"*"vault-login-add"*) expect "reason hebrew + last 4 + path" ok ok ;;
  *) expect "reason hebrew + last 4 + path" ok bad ;; esac
case "$REASON_PK" in *"private key"*"7Qq7"*) expect "private key reason tail" ok ok ;; *) expect "private key reason tail" ok bad ;; esac
expect "suppressOriginalPrompt" true "$SUPPRESS"

# --- saved files ---
S="$HOME/.claude/secrets"
expect "secrets dir 700" 700 "$(stat -c %a "$S")"
bad_mode=$(find "$S" -name 'pasted-*.env' ! -perm 600 | wc -l)
expect "saved files 600" 0 "$bad_mode"
grep -rqF -- "PASTED_1='$ANT'" "$S" && expect "saved anthropic value" ok ok || expect "saved anthropic value" ok missing
grep -rqF -- "# Anthropic API key" "$S" && expect "saved type comment" ok ok || expect "saved type comment" ok missing
grep -rqF -- "$(rep Qq7 10)" "$S" && expect "saved private key" ok ok || expect "saved private key" ok missing
pkfile=$(grep -rlF -- "$(rep Qq7 10)" "$S" | head -1)
expect "saved file sources cleanly" "$PK" "$(bash -c 'set -a; . "$1" && printf %s "$PASTED_1"' _ "$pkfile" 2>&1)"

# --- scrub: the child scrubs ~3 s after the hook returns ---
sleep 4
H="$HOME/.claude/history.jsonl"
expect "history symlink kept" yes "$([ -L "$CLAUDE_CONFIG_DIR/history.jsonl" ] && echo yes || echo no)"
expect "history has no anthropic" 0 "$(grep -cF -- "$ANT" "$H")"
expect "history has no private key" 0 "$(grep -cF -- "$(rep Mm9 20)" "$H")"
expect "history redacted twice" 2 "$(grep -cF '[REDACTED-SECRET]' "$H")"
expect "history lines kept" 3 "$(wc -l <"$H")"
expect "history still json" 3 "$(jq -c . "$H" 2>/dev/null | wc -l)"
expect "history mode kept" 600 "$(stat -c %a "$H")"
expect "home paste scrubbed" "pasted text with [REDACTED-SECRET] inside" "$(cat "$HOME/.claude/paste-cache/aaaa.txt")"
expect "cfg paste scrubbed" "other paste [REDACTED-SECRET]" "$(cat "$CLAUDE_CONFIG_DIR/paste-cache/bbbb.txt")"
expect "paste mode kept" 640 "$(stat -c %a "$CLAUDE_CONFIG_DIR/paste-cache/bbbb.txt")"
expect "clean paste untouched" "no secrets here" "$(cat "$CLAUDE_CONFIG_DIR/paste-cache/cccc.txt")"
grep -rqF -- "PASTED_1='$ANT'" "$S" && expect "secrets not scrubbed" ok ok || expect "secrets not scrubbed" ok scrubbed
expect "no scrub temp left" 0 "$(find "$tmp" -name '*.scrub-*' | wc -l)"
expect "nothing left in TMPDIR" 0 "$(find "$TMPDIR" -type f | wc -l)"
expect "history lock released" no "$([ -e "$H.lock" ] && echo yes || echo no)"
expect "spool scrubbed" 0 "$(grep -cF -- "$ANT" "$SPOOL/pane-aaaa.jsonl")"
expect "spool still json" 1 "$(jq -c . "$SPOOL/pane-aaaa.jsonl" 2>/dev/null | wc -l)"
expect "spool mode kept" 600 "$(stat -c %a "$SPOOL/pane-aaaa.jsonl")"
expect "endpoint spool: escaped key scrubbed" 0 "$(grep -cF -- "$(rep Mm9 20)" "$tmp/orca/spool/pane-bbbb.jsonl")"
expect "endpoint spool redacted" 1 "$(grep -cF '[REDACTED-SECRET]' "$tmp/orca/spool/pane-bbbb.jsonl")"
expect "non-pane spool file untouched" 1 "$(grep -cF -- "$ANT" "$SPOOL/other.txt")"
expect "held lock: history untouched" 1 "$(grep -cF -- "$K2" "$tmp/h2/.claude/history.jsonl")"
expect "held lock: lock kept" yes "$([ -d "$tmp/h2/.claude/history.jsonl.lock" ] && echo yes || echo no)"
expect "stale lock: history scrubbed" 0 "$(grep -cF -- "$K3" "$tmp/h3/.claude/history.jsonl")"
expect "stale lock: lock removed" no "$([ -e "$tmp/h3/.claude/history.jsonl.lock" ] && echo yes || echo no)"

echo "secret-paste-guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
