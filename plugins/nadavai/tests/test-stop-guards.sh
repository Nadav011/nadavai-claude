#!/usr/bin/env bash
# test-stop-guards.sh: feeds the Stop hooks candor-guard.mjs and hebrew-guard.mjs the JSON
# Claude Code sends on stdin and checks each reply is either blocked (decision "block") or
# passes (no output), including the once-per-turn marker that replaces stop_hook_active.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/scripts"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
export XDG_RUNTIME_DIR="$tmp/run"

run() {  # guard  json  -> block|allow|bad
  local out; out=$(printf '%s' "$2" | node "$DIR/$1"); [ $? -eq 0 ] || { echo "exit-fail"; return; }
  if [ -z "$out" ]; then echo allow
  elif [ "$(jq -r '.decision // empty' <<<"$out")" = block ]; then echo block
  else echo "bad output: $out"; fi
}
expect() {  # name want got
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want $2, got $3"; FAIL=$((FAIL+1)); fi
}
check() {  # name  expect  reply  [transcript]  [stop_hook_active]  [session]  [guard]
  local json
  json=$(jq -n --arg m "$3" --arg t "${4:-/nonexistent}" --argjson a "${5:-false}" --arg s "${6:-}" \
    '{hook_event_name:"Stop", last_assistant_message:$m, transcript_path:$t, stop_hook_active:$a}
     + (if $s == "" then {} else {session_id:$s} end)')
  expect "$1" "$2" "$(run "${7:-candor-guard.mjs}" "$json")"
}

# --- a reply written by an in-process teammate is not for Nadav: both guards pass it. (A plain
# subagent ends with SubagentStop, which these guards are not registered on.) ---
agent_json() {  # reply -> Stop input as it arrives inside a subagent or in-process teammate
  jq -n --arg m "$1" '{hook_event_name:"Stop", last_assistant_message:$m, transcript_path:"/nonexistent",
    stop_hook_active:false, agent_id:"agent-abc123", agent_type:"oh-my-claudecode:executor"}'
}
EN_REPORT="The change is committed on the branch and both test files pass. I did not push or merge, as the brief asked. Two deviations are listed below with their reasons."
expect "hebrew: english report from a teammate passes" allow "$(run hebrew-guard.mjs "$(agent_json "$EN_REPORT")")"
expect "candor: praise inside a subagent passes" allow "$(run candor-guard.mjs "$(agent_json "You're absolutely right, fixing it.")")"
check "hebrew: the same english report in a main session is blocked" block "$EN_REPORT" /nonexistent false "" hebrew-guard.mjs
# A main session started with `claude --agent` carries agent_type but no agent_id: still checked.
expect "hebrew: --agent main session (agent_type, no agent_id) is blocked" block "$(run hebrew-guard.mjs "$(jq -n --arg m "$EN_REPORT" '{hook_event_name:"Stop", last_assistant_message:$m, transcript_path:"/nonexistent", stop_hook_active:false, agent_type:"nadavai:executor"}')")"

# --- candor: blocked ---
check "en absolutely right"   block "You're absolutely right, I'll fix it."
check "en great idea"         block "Great idea! Let me build it."
check "en that's a great idea" block "That's a great idea — building it."
check "en praise 2nd para"    block $'Done.\n\nGreat question — the cache is per user.'
check "en praise next line"   block $'Done.\nGreat idea!'
check "en perfect!"           block "Perfect! Now the tests."
check "en you are right"      block "You are right, fixing."
check "en exactly"            block "Exactly! That is the bug."
check "he totally right"      block "ההערה שלך נכונה, אתה צודק לגמרי."
check "he and you're right"   block "בדקתי, ואתה צודק לגמרי."
check "he plural right"       block "אתם צודקים לחלוטין."
check "he great idea"         block "רעיון מצוין! אני מתחיל."
check "he great question f"   block "שאלה מצוינת. התשובה היא כן."
check "he good question"      block "שאלה טובה. התשובה היא כן."
check "he this is great q"    block "זו שאלה מצוינת, הנה התשובה."
check "he really great"       block "רעיון ממש מעולה, נבנה אותו."
check "he you are right"      block "אתה צודק, תיקנתי."
check "he really right"       block "אתה ממש צודק."
check "he right bang"         block "צודק! מתקן."
check "he bold opening"       block "**רעיון מעולה** — הנה התוכנית."
check "he list item"          block $'סיכום:\n- רעיון חכם לשמור קאש'

# --- candor: allowed ---
check "plain he"              allow "בדקתי את הקוד: הפונקציה מחזירה null כשהרשימה ריקה."
check "plain en"              allow "The test fails on the old code and passes on the new one."
check "quoted he"             allow 'אין לכתוב "צודק לגמרי" בתשובה.'
check "quoted en"             allow 'The hook blocks "You are absolutely right" and similar phrases.'
check "single-quoted en"      allow "The hook blocks 'you're absolutely right' and similar."
check "code"                  allow $'```\nconst msg = "Great idea!";\n```'
check "inline code"           allow 'The regex `Perfect!` is listed in the guard.'
check "blockquote"            allow $'> אתה צודק, תיקנתי.\nזה היה ציטוט.'
check "right mid-sentence"    allow "בדקתי, ואתה צודק שהקובץ חסר: אין אותו ב-git."
check "results excellent"     allow "התוצאה מצוינת: 0 כשלים מתוך 42."
check "loop guard fallback"   allow "You're absolutely right." /nonexistent true
check "את not אתה"            allow "את הקובץ הזה צריך למחוק."
check "he negated"            allow "אתה לא צודק לגמרי: בדקתי והקובץ קיים ב-git."
check "he hedged"             allow "אני לא בטוח שאתה צודק לגמרי, כי הבדיקה נכשלת."
check "en hedged"             allow "I'm not sure you're absolutely right: the test fails on main."
check "en conditional"        allow "If you're totally right about the cache, the bug is elsewhere."
check "he third party"        allow "Codex צודק לגמרי בנקודה הזו: הקובץ חסר."
check "en third party"        allow "Good catch by the reviewer: line 42 is wrong."
check "he third party list"   allow $'- נקודה חכמה של Codex: הקובץ חסר.'
check "he never (מעולם)"      allow "רעיון מעולם לא נבדק כאן."
check "gershayim"             allow 'המחיר 50 ש"ח, והמשלוח 40 ש"ח.'
check "gershayim hides none"  block 'מחיר 50 ש"ח, ואתה צודק לגמרי, 40 ש"ח'

# --- transcript: the current turn only, earlier text blocks included ---
T="$tmp/t.jsonl"
jq -nc '{type:"user", uuid:"p1", message:{content:"old prompt"}}' >"$T"
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"רעיון מצוין, ישן."}]}}' >>"$T"
jq -nc '{type:"user", uuid:"p2", message:{content:"new prompt"}}' >>"$T"
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"Great call! Checking."}]}}' >>"$T"
jq -nc '{type:"user", message:{content:[{type:"tool_result", content:"ok"}]}}' >>"$T"
check "earlier block in turn" block "בדקתי והכל תקין." "$T" false s1
# Once per phrase per turn, whatever stop_hook_active says (another Stop hook may have set it).
check "same phrase again"     allow "בדקתי והכל תקין." "$T" true s1
check "new phrase, flag set"  block "אתה צודק לגמרי." "$T" true s1
check "other session"         block "בדקתי והכל תקין." "$T" false s2
jq -nc '{type:"user", uuid:"p3", message:{content:"newest prompt"}}' >>"$T"
check "previous turn ignored" allow "בדקתי והכל תקין." "$T" false s1
# An image-only prompt opens a new turn too.
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"Great idea!"}]}}' >>"$T"
jq -nc '{type:"user", uuid:"p4", message:{content:[{type:"image", source:{}}]}}' >>"$T"
check "image prompt = new turn" allow "בדקתי." "$T" false s1

# --- malformed input never blocks or fails ---
expect "empty stdin"     allow "$(run candor-guard.mjs '')"
expect "bad json"        allow "$(run candor-guard.mjs '{nope')"
expect "other event"     allow "$(run candor-guard.mjs '{"hook_event_name":"SubagentStop","last_assistant_message":"Great idea!"}')"

# --- hebrew-guard on the shared turn reader ---
EN="This reply is written entirely in English prose, long enough to count as English for the guard."
H="$tmp/h.jsonl"
jq -nc '{type:"user", uuid:"q1", message:{content:"שאלה"}}' >"$H"
jq -nc --arg t "$EN" '{type:"assistant", message:{content:[{type:"text", text:$t}]}}' >>"$H"
jq -nc '{type:"user", message:{content:[{type:"tool_result", content:"ok"}]}}' >>"$H"
check "hebrew: english block"     block "תשובה בעברית." "$H" false h1 hebrew-guard.mjs
check "hebrew: rewrite passes"    allow "תשובה בעברית." "$H" true h1 hebrew-guard.mjs
check "hebrew: new english block" block "$EN Another one, different text." "$H" true h1 hebrew-guard.mjs
check "hebrew: hebrew only"       allow "תשובה בעברית." /nonexistent false h2 hebrew-guard.mjs
# Several English notes in one turn: one block for all of them, not one per note.
N="$tmp/n.jsonl"
jq -nc '{type:"user", uuid:"r1", message:{content:"שאלה"}}' >"$N"
for i in 1 2 3; do
  jq -nc --arg t "$EN Note number $i about the next step." '{type:"assistant", message:{content:[{type:"text", text:$t}]}}' >>"$N"
  jq -nc '{type:"user", message:{content:[{type:"tool_result", content:"ok"}]}}' >>"$N"
done
check "hebrew: 3 notes, one block"  block "סיכום בעברית." "$N" false n1 hebrew-guard.mjs
check "hebrew: then passes"         allow "שורה קצרה בעברית." "$N" true n1 hebrew-guard.mjs
reason_of() { printf '%s' "$1" | node "$DIR/hebrew-guard.mjs" | jq -r '.reason // empty'; }
json=$(jq -n --arg t "$N" '{hook_event_name:"Stop",last_assistant_message:"סיכום בעברית.",transcript_path:$t,session_id:"n2"}')
case "$(reason_of "$json")" in *"do not rewrite the whole reply"*) expect "hebrew: notes ask short line" ok ok ;; *) expect "hebrew: notes ask short line" ok bad ;; esac
json=$(jq -n --arg m "$EN Final." --arg t "$N" '{hook_event_name:"Stop",last_assistant_message:$m,transcript_path:$t,session_id:"n3"}')
case "$(reason_of "$json")" in *"in full, in Hebrew"*) expect "hebrew: english final asks full" ok ok ;; *) expect "hebrew: english final asks full" ok bad ;; esac
# candor: two phrases in one turn block once.
C="$tmp/c.jsonl"
jq -nc '{type:"user", uuid:"c1", message:{content:"x"}}' >"$C"
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"Great idea! Checking."}]}}' >>"$C"
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"You are right, fixing."}]}}' >>"$C"
check "candor: 2 phrases, one block" block "בדקתי." "$C" false c1
check "candor: then passes"          allow "בדקתי." "$C" true c1

json=$(jq -n --arg m "$EN" '{hook_event_name:"Stop",reason:"shutdown",last_assistant_message:$m,transcript_path:"/nonexistent",stop_hook_active:false}')
expect "hebrew: shutdown ignored" allow "$(run hebrew-guard.mjs "$json")"
json=$(jq -n --arg m "You're absolutely right, I'll fix it." '{hook_event_name:"Stop",reason:"channel_closed",last_assistant_message:$m,transcript_path:"/nonexistent",stop_hook_active:false}')
expect "candor: channel_closed ignored" allow "$(run candor-guard.mjs "$json")"

dialog() {  # name want json
  local out got
  out=$(printf '%s' "$3" | node "$DIR/hebrew-guard.mjs")
  if [ -z "$out" ]; then got=allow
  elif [ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$out")" = deny ]; then got=deny
  else got="bad: $out"; fi
  expect "$1" "$2" "$got"
}
dialog "hebrew dialog: grok english" deny "$(jq -n '{hook_event_name:"PreToolUse",toolName:"ask_user_question",toolInput:{questions:[{question:"Should I deploy this service now?",options:[{label:"Yes",description:"Ship the change"}]}]}}')"
dialog "hebrew dialog: grok hebrew" allow "$(jq -n '{hook_event_name:"PreToolUse",toolName:"ask_user_question",toolInput:{questions:[{question:"לפרוס את השירות עכשיו?",options:[{label:"כן",description:"להעלות את השינוי"}]}]}}')"
dialog "hebrew dialog: claude still" deny "$(jq -n '{hook_event_name:"PreToolUse",tool_name:"AskUserQuestion",tool_input:{questions:[{question:"Should I deploy this service now?",header:"Deploy",options:[{label:"Yes",description:"Ship the change"}]}]}}')"

echo "stop guards: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
