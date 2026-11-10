#!/usr/bin/env bash
# test-close-check-hint.sh: feeds the UserPromptSubmit hook close-check-hint.mjs the JSON Claude Code
# sends on stdin and checks each prompt either gets the session-close-check context (hint) or nothing
# (none). The hook never blocks: a hint is hookSpecificOutput.additionalContext with no decision.
#
# The matcher: at most 300 characters after trimming, and either
#   - a request to close the session itself (לסגור / לסגר את הסשן with only הזה / הזאת / פה / כאן after the noun,
#     אני סוגר את הסשן, אפשר לסגור / לסגר (פה / כאן) at the end, "אני סוגר" at the end, סגור על זה?!, a bare
#     "זהו?" at the end, "can we close?", "can I close this session"), or
#   - a finish word (סיימנו, גמרנו, סגרנו, סגרתם, נגמר at the end, לא נשאר כלום, נשאר עוד משהו, מה נשאר? at the
#     end, משהו פתוח, עברנו על הכל, הכל מוכן, הכל במיין/בפרודקשן, הכל עלה לפרודקשן, "(are) we done ...?",
#     "anything left?" at the end; not "סיימנו עם X") together with a question mark or a marker (זהו, בטוח*,
#     נשאר, מקצה לקצה), and no next step in the same prompt (אם כן, עכשיו ת..., ואז ת..., an imperative after a
#     question or joined with ו (ותסגור), other than תגיד/תאשר/תודה, English "then").
# Known false positives (hint where none was meant; the cost is one extra read-only check and a forced opener):
#   - "סיימנו את הדף הראשון?" (a progress question about one part) triggers.
#   - "לא נשאר כלום בקאש?" (a technical question with "לא נשאר כלום") triggers.
#   - "סגרנו את הדיל עם הלקוח?" (סגרנו about a deal) triggers.
# Known false negatives (no hint; the model still answers, without the forced check):
#   - a close question over 300 characters, or one with no finish/close word ("מה המצב? אפשר ללכת?").
#   - typos that break the words themselves ("סימתנו", "לסגו").
#   - "אפשר לסגור את השיחה" / "...את הצ'אט": שיחה and צ'אט were dropped as session nouns, because
#     "תסגור את השיחה עם הלקוח" is an instruction about a client chat.
#   - "סיימנו? תבדוק" (an imperative after the question reads as a next step).
#   - "אפשר לסגור את הסשן בבקשה?" (a word after the session noun other than הזה / הזאת / פה / כאן).
#   - English phrasings other than "can/should we close", "can I close this session" and "are we done ...?".
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
check hint 'גמרנו? אפשר ללכת'
check hint 'הכל מוכן ?'
check hint 'can I close this session?'
check hint 'Are we all done here?'
check hint 'סיימנו? תודה'
# --- M4: more of his phrasings: hint ---
check hint 'נשאר עוד משהו?'
check hint 'הכל במיין?'
check hint 'סגרנו הכל?'
check hint 'סגרנו?'
check hint 'זהו נגמר?'
check hint 'אז מה, זהו?'
check hint 'יש עוד משהו פתוח?'
check hint 'מה נשאר?'
check hint 'אני סוגר את הסשן'
check hint 'can we close?'
# --- N8: phrasings the second review found missed: hint ---
check hint 'אפשר לסגר?'
check hint 'אפשר לסגר את הסשן?'
check hint 'אפשר לסגור את הסשן הזה?'
check hint 'סגרתם הכל?'
check hint 'הכל עלה לפרודקשן?'
check hint 'זהו, אני סוגר'
check hint 'we done?'
check hint 'anything left?'

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
check none 'מה נשאר לעשות בפיצר הזה?'
check none 'can we close the PR?'
check none 'נגמר הזיכרון בשרת, תבדוק'
# --- M5: instructions the first version gave a hint: none ---
check none 'תסגור את השיחה עם הלקוח בוואטסאפ'
check none 'אפשר לסגור את השיחה'
check none 'סיימנו את המיגרציה? תריץ טסטים'
check none 'are we done with the migration? then deploy it'
check none 'is everything done? then open the PR'
# --- N8: instructions the second version gave a hint: none ---
check none 'תסגור את הסשן של המשתמש בדאטאבייס'
check none 'איך סוגרים session ב-supabase?'
check none 'תבדוק אם נשאר משהו פתוח ב-PR ותסגור אותו'
check none 'anything left in the cache?'
# A pasted brief of 2,000 characters that contains "סיימנו" and a question mark.
long="סיימנו? $(printf 'שורה ארוכה של בריף שהודבק לשיחה, עם הוראות מפורטות לסוכן. %.0s' $(seq 1 40))"
expect "long paste (${#long} chars)" none "$(run "$(jq -n --arg p "$long" '{hook_event_name:"UserPromptSubmit",prompt:$p}')")"

# --- the context covers the unknown verdict and forbids --no-fetch (H1) ---
ctx=$(jq -n '{hook_event_name:"UserPromptSubmit",prompt:"סגור על זה ?!"}' | node "$HOOK" | jq -r '.hookSpecificOutput.additionalContext')
case "$ctx" in *"לסגור את הסשן: לא ידוע"*"without --no-fetch"*|*"without --no-fetch"*"לסגור את הסשן: לא ידוע"*) expect "context: unknown + no --no-fetch" ok ok ;;
  *) expect "context: unknown + no --no-fetch" ok "missing in: $ctx" ;; esac

# --- N3: the context asks for every directory the session changed, and for its own worktree in the NOTE ---
case "$ctx" in *"on every directory where this session changed files"*"its worktree"*"this session's own"*) expect "context: every changed dir + own worktree" ok ok ;;
  *) expect "context: every changed dir + own worktree" ok "missing in: $ctx" ;; esac
case "$ctx" in *"in the project directory"*) expect "context: not 'in the project directory'" ok "found in: $ctx" ;;
  *) expect "context: not 'in the project directory'" ok ok ;; esac

# --- malformed input: exit 0, no output ---
expect "empty stdin"   none "$(run '')"
expect "bad json"      none "$(run '{nope')"
expect "no prompt"     none "$(run '{"hook_event_name":"UserPromptSubmit"}')"
expect "prompt number" none "$(run '{"hook_event_name":"UserPromptSubmit","prompt":5}')"
expect "other event"   none "$(run '{"hook_event_name":"Stop","prompt":"סגור על זה ?!"}')"
# binary and 5 MB input: no output and exit 0 (the output is "rc=<exit>" only)
expect "binary stdin"  rc=0 "$(head -c 4096 /dev/urandom | tr -d '\000' | node "$HOOK"; echo "rc=$?")"
big=$(head -c 5000000 /dev/zero | tr '\0' 'x')
expect "5 MB prompt"   rc=0 "$(printf '{"hook_event_name":"UserPromptSubmit","prompt":"%s סיימנו?"}' "$big" | node "$HOOK"; echo "rc=$?")"

# --- speed: well under 100 ms of hook work (node startup included, so the bound is loose) ---
start=$(date +%s%N)
for _ in 1 2 3 4 5; do run '{"hook_event_name":"UserPromptSubmit","prompt":"זהו סיימנו?"}' >/dev/null; done
ms=$(( ($(date +%s%N) - start) / 5000000 ))
if [ "$ms" -lt 300 ]; then PASS=$((PASS+1)); else echo "FAIL: speed — ${ms} ms per run"; FAIL=$((FAIL+1)); fi

echo "close-check-hint: $PASS passed, $FAIL failed (${ms} ms per run incl. node and jq)"
[ "$FAIL" -eq 0 ]
