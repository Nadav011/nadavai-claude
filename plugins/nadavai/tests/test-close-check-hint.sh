#!/usr/bin/env bash
# test-close-check-hint.sh: feeds the UserPromptSubmit hook close-check-hint.mjs the JSON Claude Code
# sends on stdin and checks each prompt either gets the session-close-check context (hint) or nothing
# (none). The hook never blocks: a hint is hookSpecificOutput.additionalContext with no decision.
#
# The matcher: at most 300 characters after trimming, and either
#   - a request to close the session itself (לסגור את הסשן, לסגור פה / כאן at the end, סגור על זה?!,
#     "can I close this session"), or
#   - a finish word (סיימנו, גמרנו, לא נשאר כלום, עברנו על הכל, הכל מוכן; not "סיימנו עם X") together with
#     a question mark or a marker (זהו, בטוח*, נשאר, מקצה לקצה), and no next step in the same prompt
#     (אם כן, עכשיו ת..., ואז ת...).
# Known false positives (hint where none was meant; the cost is one extra read-only check):
#   - "סיימנו את הדף הראשון?" (a progress question about one part) triggers.
#   - "לא נשאר כלום בקאש?" (a technical question with "לא נשאר כלום") triggers.
# Known false negatives (no hint; the model still answers, without the forced check):
#   - a close question over 300 characters, or one with no finish/close word ("מה המצב? אפשר ללכת?").
#   - typos that break the words themselves ("סימתנו", "לסגו").
#   - English phrasings other than "can/should I close this session" and "are we done ...?".
set -uo pipefail
HOOK="$(cd "$(dirname "$0")/.." && pwd)/scripts/close-check-hint.mjs"
PASS=0; FAIL=0

run() {  # stdin json -> hint|none|bad
  local out; if ! out=$(printf '%s' "$1" | node "$HOOK"); then echo "exit-fail"; return; fi
  if [ -z "$out" ]; then echo none
  elif [ "$(jq -r '.hookSpecificOutput.hookEventName + "|" + (.hookSpecificOutput.additionalContext | test("session-close-check") | tostring) + "|" + (has("decision") | tostring)' <<<"$out")" = "UserPromptSubmit|true|false" ]; then echo hint
  else echo "bad output: $out"; fi
}
expect() {  # name want got
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want $2, got $3"; FAIL=$((FAIL+1)); fi
}
check() {  # want prompt
  expect "$2" "$1" "$(run "$(jq -n --arg p "$2" '{hook_event_name:"UserPromptSubmit",session_id:"s1",prompt:$p}')")"
}

# --- Nadav's real phrasings: hint ---
check hint 'אז זהו סיימנו את הכל ?? לא נשאר כלום ?'
check hint 'מה אומר לסגור את הסשן זהו סיימנו את הכל פה ? הכל ב MAIN ובדמיין ?'
check hint 'זהו בטוחי לסגור פה'
check hint 'מה אומר סיימנו את הכל מקצה לקצה ממש לא נשאר כלום ?'
check hint 'ואתה בטוח שעברנו על הכל מקצה לקצה ? ולא נשאר לנו כלום'
check hint 'סגור על זה ?!?!?!?'
check hint 'זהו סיימנו או שהסוכנים נפלו ?'
# --- close variants: hint ---
check hint '  אפשר לסגור?  '
check hint 'אפשר לסגור את השיחה'
check hint 'גמרנו? אפשר ללכת'
check hint 'הכל מוכן ?'
check hint 'can I close this session?'
check hint 'Are we all done here?'

# --- instructions that only contain the words: none ---
check none 'תסגור את הטאב בדפדפן'
check none 'סיימנו עם העיצוב, עכשיו תבנה את הדף'
check none 'לסגור את ה-PR הזה'
check none 'לסגור את ה-PR הזה?'
check none 'תסגור את האישיו בגיטהאב'
check none 'סיימנו את המיגרציה? אם כן תריץ את הטסטים'
check none 'תבדוק אם סיימנו את המיגרציה ותריץ טסטים'
check none 'Fix the build: the close() call in session.ts leaks, and we are done when tests pass.'
check none 'Did the done callback fire? check the logs'
check none 'מה נשאר לעשות בפיצר הזה'
# A pasted brief of 2,000 characters that contains "סיימנו" and a question mark.
long="סיימנו? $(printf 'שורה ארוכה של בריף שהודבק לשיחה, עם הוראות מפורטות לסוכן. %.0s' $(seq 1 40))"
expect "long paste (${#long} chars)" none "$(run "$(jq -n --arg p "$long" '{hook_event_name:"UserPromptSubmit",prompt:$p}')")"

# --- malformed input: exit 0, no output ---
expect "empty stdin"   none "$(run '')"
expect "bad json"      none "$(run '{nope')"
expect "no prompt"     none "$(run '{"hook_event_name":"UserPromptSubmit"}')"
expect "prompt number" none "$(run '{"hook_event_name":"UserPromptSubmit","prompt":5}')"
expect "other event"   none "$(run '{"hook_event_name":"Stop","prompt":"סגור על זה ?!"}')"

# --- speed: well under 100 ms of hook work (node startup included, so the bound is loose) ---
start=$(date +%s%N)
for _ in 1 2 3 4 5; do run '{"hook_event_name":"UserPromptSubmit","prompt":"זהו סיימנו?"}' >/dev/null; done
ms=$(( ($(date +%s%N) - start) / 5000000 ))
if [ "$ms" -lt 300 ]; then PASS=$((PASS+1)); else echo "FAIL: speed — ${ms} ms per run"; FAIL=$((FAIL+1)); fi

echo "close-check-hint: $PASS passed, $FAIL failed (${ms} ms per run incl. node and jq)"
[ "$FAIL" -eq 0 ]
