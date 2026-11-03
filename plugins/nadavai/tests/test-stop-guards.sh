#!/usr/bin/env bash
# test-candor-guard.sh: feeds the Stop hook candor-guard.mjs the JSON Claude Code sends on
# stdin and checks each reply is either blocked (decision "block") or passes (no output).
set -uo pipefail
GUARD="$(cd "$(dirname "$0")/.." && pwd)/scripts/candor-guard.mjs"
PASS=0; FAIL=0

check() {  # name  expect(block|allow)  reply  [transcript]  [stop_hook_active]
  local name="$1" want="$2" json out got
  json=$(jq -n --arg m "$3" --arg t "${4:-/nonexistent}" --argjson a "${5:-false}" \
    '{hook_event_name:"Stop", last_assistant_message:$m, transcript_path:$t, stop_hook_active:$a}')
  out=$(printf '%s' "$json" | node "$GUARD")
  if [ -z "$out" ]; then got=allow
  elif [ "$(jq -r '.decision // empty' <<<"$out")" = block ]; then got=block
  else got="bad output: $out"; fi
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); else echo "FAIL: $name — want $want, got $got"; FAIL=$((FAIL+1)); fi
}

# Blocked: praise at a paragraph start, blanket agreement anywhere.
check "en absolutely right"   block "You're absolutely right, I'll fix it."
check "en great idea"         block "Great idea! Let me build it."
check "en praise 2nd para"    block $'Done.\n\nGreat question — the cache is per user.'
check "en perfect!"           block "Perfect! Now the tests."
check "he totally right"      block "ההערה שלך נכונה, אתה צודק לגמרי."
check "he great idea"         block "רעיון מצוין! אני מתחיל."
check "he great question f"   block "שאלה מצוינת. התשובה היא כן."
check "he you are right"      block "אתה צודק, תיקנתי."
check "he right bang"         block "צודק! מתקן."
check "he bold opening"       block "**רעיון מעולה** — הנה התוכנית."
check "he list item"          block $'סיכום:\n- רעיון חכם לשמור קאש'

# Allowed: plain answers, quoted or coded phrases, words used about results.
check "plain he"              allow "בדקתי את הקוד: הפונקציה מחזירה null כשהרשימה ריקה."
check "plain en"              allow "The test fails on the old code and passes on the new one."
check "quoted he"             allow 'אין לכתוב "צודק לגמרי" בתשובה.'
check "quoted en"             allow 'The hook blocks "You are absolutely right" and similar phrases.'
check "code"                  allow $'```\nconst msg = "Great idea!";\n```'
check "inline code"           allow 'The regex `Perfect!` is listed in the guard.'
check "blockquote"            allow $'> אתה צודק, תיקנתי.\nזה היה ציטוט.'
check "right mid-sentence"    allow "בדקתי, ואתה צודק שהקובץ חסר: אין אותו ב-git."
check "results excellent"     allow "התוצאה מצוינת: 0 כשלים מתוך 42."
check "loop guard"            allow "You're absolutely right." /nonexistent true
check "את not אתה"            allow "את הקובץ הזה צריך למחוק."

# A transcript: praise in an earlier text block of this turn, before tool calls.
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
jq -nc '{type:"user", message:{content:"old prompt"}}' >"$tmp/t.jsonl"
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"רעיון מצוין, ישן."}]}}' >>"$tmp/t.jsonl"
jq -nc '{type:"user", message:{content:"new prompt"}}' >>"$tmp/t.jsonl"
jq -nc '{type:"assistant", message:{content:[{type:"text", text:"Great call! Checking."}]}}' >>"$tmp/t.jsonl"
jq -nc '{type:"user", message:{content:[{type:"tool_result", content:"ok"}]}}' >>"$tmp/t.jsonl"
check "earlier block in turn" block "בדקתי והכל תקין." "$tmp/t.jsonl"
jq -nc '{type:"user", message:{content:"newest prompt"}}' >>"$tmp/t.jsonl"
check "previous turn ignored" allow "בדקתי והכל תקין." "$tmp/t.jsonl"

echo "candor-guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
