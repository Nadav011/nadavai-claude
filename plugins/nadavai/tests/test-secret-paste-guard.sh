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
# Card numbers: public test numbers (Stripe's Visa and Amex, which the guard lets through), and
# numbers made Luhn-valid at run time from a non-test prefix, so no full card number sits in
# this file.
luhn() { node -e 'const b = process.argv[1]; for (let d = 0; d < 10; d++) { const s = b + d; let t = 0;
  for (let i = 0; i < s.length; i++) { let x = +s[s.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } t += x; }
  if (t % 10 === 0) { process.stdout.write(s); break; } }' "$1"; }
grp4() { local s="${2- }"; printf '%s' "${1:0:4}$s${1:4:4}$s${1:8:4}$s${1:12:4}"; }
TEST16G="$(rep '4242 ' 3)4242"
TESTAMEX="3782""82246310005"
C16=$(luhn "453201511283036"); C16G=$(grp4 "$C16")
CAMEX=$(luhn "37144963539849"); CAMEX_D="${CAMEX:0:4}-${CAMEX:4:6}-${CAMEX:10}"
ORD=$(luhn "532610238495002"); ID16=$(luhn "455812093847561")
NB=$(printf '\302\240'); NNB=$(printf '\342\200\257'); THIN=$(printf '\342\200\211')
# A generated 43-character mixed-case token (base64url of a fixed hash), not a real one.
TOK=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update("paste-guard-test").digest("base64url"))')

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
check "bare token alone"   block "$TOK"
check "token in pasted_content" block $'<pasted_content id="1">\n'"$TOK"$'\n</pasted_content id="1">'
check "token after 25 spaces" block "$(rep ' ' 25)$TOK"

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
check "israeli phone"      allow "0541234567"
check "9-digit id"         allow "ת.ז. 123456782"
check "order no context"   allow "הזמנה מספר $C16"
check "card fails luhn"    allow "${C16:0:15}$(( (${C16:15:1} + 1) % 10 )) 12/29"
check "ms timestamp"       allow "created 1762780000000 card"
check "card id in url"     allow "see https://shop.example/card/$C16 for the order"
check "card id in path"    allow "card file at /var/data/$C16.json"
check "test card 4242"     allow "the checkout fails when I pay with $TEST16G 12/29 123 in test mode"
check "test card amex"     allow "תכניס גם ותבדוק שעובד $TESTAMEX / 08.32 / 1234"
check "order + price 12.30" allow "ההזמנה מספר $ORD בסך 12.30 ש\"ח"
check "order + glued price" allow "הזמנה $ORD 12.30 ₪"
check "id took 12.35ms"    allow "request id=$ID16 took 12.35ms"
check "firebase key alone" allow "AIza""Sy${TOK:0:33}"
check "pk_live alone"      allow "pk_""live_${TOK:0:34}"
check "sb_publishable alone" allow "sb_""publishable_${TOK:0:32}"
check "posthog phc alone"  allow "phc_${TOK:0:40}"
check "vercel prj alone"   allow "prj_${TOK:0:28}"
check "vercel dpl alone"   allow "dpl_${TOK:0:28}"
check "drive id alone"     allow "1${TOK:0:32}"
check "sheet id alone"     allow "1${TOK}"
check "sri hash alone"     allow "sha384-${TOK}${TOK:0:21}"
check "png base64 alone"   allow "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kg"
check "branch w/ acronyms" allow "feat/Add-OAuth2-API-Key-Rotation-For-Users-v3"
check "uuid alone"         allow "0f8fad5b-d9cb-469f-a165-70867728950e"
check "git sha alone"      allow "3f786850e387550fdab836ed7e6dc881de23001b"
check "jwt alone"          allow "eyJ$(rep hbGciOiJIUzI1NiJ9 2).eyJ$(rep zdWIiOiIxMjM0 3).$(rep SflKxwRJ 4)"
check "url alone"          allow "https://example.com/a/$TOK"
check "token in sentence"  allow "the run id is $TOK, can you check it?"
check "path alone"         allow "/home/someone/Projects/SomeRepo2/src/components/HeaderNav"
check "camel id alone"     allow "useSecretPasteGuardHookForClaudeCode2Agents"
check "kebab slug alone"   allow "fix-Secret-guard-cards-and-bare-tokens-2026-round2"

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

# --- blocked cards, each in its own HOME: last 4 only, no value on stdout/stderr, nothing saved;
# the paste-cache copy of the prompt is checked after the scrub (the scrub range covers expiry and code) ---
S="$HOME/.claude/secrets"
CN=(); CH=(); CR=()
card_block() {  # name prompt prompt-after-scrub last4 value...
  local name=$1 prompt=$2 red=$3 last=$4 h="$tmp/card${#CN[@]}" v leak=no; shift 4
  mkdir -p "$h/.claude/paste-cache"; printf '%s\n' "$prompt" >"$h/.claude/paste-cache/p.txt"
  (export HOME="$h" CLAUDE_CONFIG_DIR="$h/.claude"
   jq -n --arg p "$prompt" '{hook_event_name:"UserPromptSubmit",prompt:$p}' | node "$GUARD" >"$h/out" 2>"$h/err")
  expect "$name: blocks" block "$(jq -r '.decision // "allow"' "$h/out" 2>/dev/null)"
  case "$(jq -r '.reason' "$h/out" 2>/dev/null)" in *"- כרטיס אשראי שמסתיים ב-$last"*) expect "$name: last 4" ok ok ;;
    *) expect "$name: last 4" ok bad ;; esac
  for v in "$@"; do case "$(cat "$h/out" "$h/err")" in *"$v"*) leak=yes ;; esac; done
  expect "$name: no value on stdout/stderr" no "$leak"
  CN+=("$name"); CH+=("$h"); CR+=("$red")
}
R="[REDACTED-SECRET]"
card_block "visa + labels"   "pay with $C16G exp 12/29 cvv 123" "pay with $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "amex hebrew"     "תכניס גם ותבדוק שעובד $CAMEX / 08.32 / 1234" "תכניס גם ותבדוק שעובד $R" "${CAMEX: -4}" "$CAMEX" 08.32 1234
card_block "amex dashes"     "תכניס גם ותבדוק שעובד $CAMEX_D / 08.32 / 1234" "תכניס גם ותבדוק שעובד $R" "${CAMEX: -4}" "$CAMEX_D" "$CAMEX" 08.32 1234
card_block "card word only"  "המספר של הכרטיס $C16" "המספר של הכרטיס $R" "${C16: -4}" "$C16"
card_block "nbsp groups"     "$(grp4 "$C16" "$NB") 12/29 123" "$R" "${C16: -4}" "$(grp4 "$C16" "$NB")" "$C16" 12/29 123
card_block "nnbsp + word"    "card $(grp4 "$C16" "$NNB")" "card $R" "${C16: -4}" "$(grp4 "$C16" "$NNB")" "$C16"
card_block "thin space"      "$(grp4 "$C16" "$THIN") 12/29 123" "$R" "${C16: -4}" "$(grp4 "$C16" "$THIN")" "$C16" 12/29 123
card_block "double spaces"   "card $(grp4 "$C16" '  ') 12/29" "card $R" "${C16: -4}" "$(grp4 "$C16" '  ')" "$C16" 12/29
card_block "mixed separators" "card ${C16:0:4}-${C16:4:4} ${C16:8:4}-${C16:12:4} 12/29" "card $R" "${C16: -4}" "$C16" 12/29
card_block "dots"            "card $(grp4 "$C16" .) 12/29" "card $R" "${C16: -4}" "$(grp4 "$C16" .)" "$C16" 12/29
card_block "expiry 12 / 29"  "$C16G 12 / 29 123" "$R" "${C16: -4}" "$C16G" "$C16" "12 / 29" 123
card_block "# before"        "card #$C16 12/29" "card #$R" "${C16: -4}" "$C16" 12/29
card_block "Expiration/CVV:" "card $C16G Expiration: 12/29 CVV: 123" "card $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "exp date/sec code" "card $C16G exp date 12/29 security code 123" "card $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "CVV code"        "card $C16G 12/29 CVV code 123" "card $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "בתוקף עד"        "כרטיס $C16G בתוקף עד 12/29 קוד 123" "כרטיס $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "3 ספרות בגב"     "כרטיס $C16G תוקף 12/29 3 ספרות בגב 123" "כרטיס $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "code before"     "cvv 123 card $C16G 12/29" "$R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "expiry before"   "12/29 $C16G 123" "$R" "${C16: -4}" "$C16G" "$C16" 12/29 123
card_block "json object"     "{\"number\":\"$C16\",\"exp\":\"12/29\",\"cvc\":\"123\"}" "{\"number\":\"$R\"}" "${C16: -4}" "$C16" 12/29 123
card_block "labels on lines" "Card number: $C16G"$'\n'"Expiry: 12/29"$'\n'"CVV: 123" "Card number: $R" "${C16: -4}" "$C16G" "$C16" 12/29 123
read -r -d '' WANT <<EOF
ההודעה נעצרה ולא הגיעה למודל: היא מכילה פרטי כרטיס אשראי.
- כרטיס אשראי שמסתיים ב-${C16: -4}
פרטי הכרטיס לא נשמרו בשום קובץ, והם נמחקים מההיסטוריה המקומית תוך כמה שניות.
הפרטים לא נשלחו למודל, ולכן אין צורך לבטל את הכרטיס בגלל ההודעה הזאת. אם הדבקת אותם גם במקום אחר, שקול לבטל אותו.
אל תדביק פרטי כרטיס בצ'אט: כשתשלום שאישרת צריך כרטיס, הסוכן פותח את דף התשלום ואתה מקליד את הפרטים שם בעצמך.
אפשר לשלוח את ההודעה שוב בלי פרטי הכרטיס.
EOF
expect "card-only message, exact" "$WANT" "$(jq -r '.reason' "${CH[0]}/out")"
# A key and a card together: only the key is saved, the card lines follow the key lines.
KC="$tmp/keycard"; mkdir -p "$KC"
(export HOME="$KC" CLAUDE_CONFIG_DIR="$KC/.claude"
 jq -n --arg p "card $C16G 12/29 and key $ANT" '{hook_event_name:"UserPromptSubmit",prompt:$p}' | node "$GUARD" >"$KC/out")
KCR=$(jq -r '.reason' "$KC/out")
case "$KCR" in "ההודעה נעצרה ולא הגיעה למודל: היא מכילה מפתח סודי ופרטי כרטיס אשראי."*"המפתח נשמר בקובץ"*"(rotate)"*"פרטי הכרטיס לא נשמרו"*"בלי המפתח ופרטי הכרטיס.") expect "key+card message" ok ok ;;
  *) expect "key+card message" ok bad ;; esac
grep -rqF -- "PASTED_1='$ANT'" "$KC/.claude/secrets" && expect "key+card: key saved" ok ok || expect "key+card: key saved" ok missing
expect "key+card: one value saved" 1 "$(grep -rc '^PASTED_' "$KC/.claude/secrets" | awk -F: '{ s += $2 } END { print s }')"
grep -rqF -- "# טוקן ללא קידומת" "$S" && grep -rqF -- "'$TOK'" "$S" && expect "saved bare token" ok ok || expect "saved bare token" ok missing

# --- saved files ---
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
for i in "${!CN[@]}"; do
  expect "${CN[$i]}: scrubbed incl. expiry + code" "${CR[$i]}" "$(cat "${CH[$i]}/.claude/paste-cache/p.txt")"
  expect "${CN[$i]}: no file in secrets dir" 0 "$(find "${CH[$i]}/.claude/secrets" -type f 2>/dev/null | wc -l)"
done
# The scrub child's values file is gone by now; only the key's file is left.
expect "key+card: card not on disk" 0 "$(grep -rlF -e "$C16G" -e "$C16" -e 12/29 "$KC/.claude/secrets" | wc -l)"
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
