#!/usr/bin/env bash
# tests/resume-all.sh: how bin/resume-all reads a session's screen, and what it types into.
# The screens are built in the shape Claude Code 2.1.325 draws (read on 2026-11-14 with
# `orca terminal read --screen`): the transcript, a line with Claude Code's own right-aligned
# notice, a rule, the prompt box, a rule, the status lines. The shape of a stop on a usage limit
# is the one three real drawings show (copies of stopped transcripts, resumed in a test window on
# 2026-11-14): the notice under his message, and a hint line under the notice. The texts are
# made up. Nothing here reaches a real Orca: the tool is pointed at a made-up `orca`, and the
# script stops before any send when that cannot be set up.
set -uo pipefail
BIN="$(cd "$(dirname "$0")/.." && pwd)/bin/resume-all"
PASS=0; FAIL=0
RULE=$(printf '─%.0s' $(seq 1 80))
FOOT=$'  ⚠ loop-detective: loop: no active cases\n  branch:main | profile:home\n  ⏵⏵ bypass permissions on · 1 shell\n  ● main\n  ◯ reviewer  reading the diff'
GOAL=$(printf '%60s◎ /goal active (2h)' '')
# A real screen has a non-breaking space after the ⎿ of the notice and after the ❯ of the box
# (the bytes of the saved drawings); the screens here carry the same bytes.
NB=$'\xc2\xa0'
HIT_W="  ⎿ ${NB}You've hit your weekly limit · resets Nov 20, 4pm (Asia/Jerusalem)"
HINT="     /usage-credits to finish what you’re working on."
# screen <transcript> [text in the prompt box] [status lines]; SLOT is Claude Code's own line.
screen() { printf '%s\n%s\n%s\n❯%s%s\n%s\n%s\n' "$1" "${SLOT-$GOAL}" "$RULE" "$NB" "${2-}" "$RULE" "${3:-$FOOT}"; }
t() {  # name want screen
  local got; got="$(printf '%s\n' "$3" | RESUME_ALL_CLASSIFY_ONLY=1 bash "$BIN")"
  if [ "$got" = "$2" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want $2, got $got"; FAIL=$((FAIL+1)); fi
}
REPLY=$'● Read 3 files\n  ⎿  done\n● הכול מוכן.\n  מצב: הכול סגור'
MSG=$'❯ תמשיך מאיפה שעצרת\n  ותבדוק גם את הדוח'
WORK=$'\n  Thought for 13s, ran 1 shell command'
# Stopped for sure: the notice hangs under a message of his.
STOP="$REPLY"$'\n'"$MSG"$'\n'"$HIT_W"$'\n'"$HINT"
# Looks stopped: the same notice under a reply, as a stop in the middle of work is drawn.
MID="$MSG"$'\n'"$REPLY$WORK"$'\n'"$HIT_W"$'\n'"$HINT"

t "stopped, as the real drawing shows it" limit "$(screen "$STOP")"
t "stopped, drawn with plain spaces" limit "$(screen "$MSG"$'\n'"  ⎿  You've hit your weekly limit · resets Nov 20, 4pm"$'\n'"$HINT" | sed "s/^❯$NB/❯ /")"
t "stopped, with no hint line (older versions)" limit "$(screen "$REPLY"$'\n❯ תמשיך\n'"$HIT_W")"
t "stopped on the 5-hour limit" limit "$(screen "$MSG"$'\n'"  ⎿  You've hit your 5-hour limit · resets 8:40am (Asia/Jerusalem)"$'\n'"$HINT")"
t "stopped on the session limit" limit "$(screen "$MSG"$'\n'"  ⎿  You've hit your session limit · resets 1:50am (Asia/Jerusalem)")"
t "stopped, no kind named" limit "$(screen "$MSG"$'\n'"  ⎿  You've hit your limit · resets 6pm (Asia/Jerusalem)")"
t "stopped, old wording" limit "$(screen "$MSG"$'\n  ⎿  Claude usage limit reached. Your limit will reset at 6pm.')"
t "stopped, with the summary line after the notice" limit "$(screen "$STOP"$'\n\n✻ Cooked for 2m 14s')"
t "stopped in the middle of work, under his message and a line that sums the work up" limit "$(screen "$MSG$WORK"$'\n'"$HIT_W"$'\n'"$HINT")"
PAD=$(printf '.\n%.0s' $(seq 1 36)); PAD=${PAD//./}   # 35 empty lines, as under a short transcript
t "stopped, a short transcript with empty lines down to the box" limit "$(screen "$STOP"$'\n'"$PAD")"
t "stopped, and Claude Code's own line starts with a reply mark" limit "$(SLOT="$(printf '%110s● high · /effort' '')" screen "$STOP")"
t "stopped, and Claude Code's own line is empty" limit "$(SLOT='' screen "$STOP")"
# Found by the review of 2026-11-14: his own message is drawn with ❯ in the transcript too.
t "stopped right after his message, box empty" limit "$(screen $'❯ לוגו בצד שמאל לא ?\n● בודק.\n❯ תמשיך עם זה\n'"$HIT_W")"
t "stopped, and the box holds text" draft "$(screen "$STOP" 'תבדוק גם את')"
t "looks stopped, and the box holds text" draft "$(screen "$MID" 'תבדוק גם את')"
t "stopped, and the box holds a draft of two lines" draft "$(printf '%s\n%s\n❯\n  שורה שנייה\n%s\n%s\n' "$STOP" "$RULE" "$RULE" "$FOOT")"
# Not for sure: the screen cannot tell a stop in the middle of work from a quoted notice.
t "the notice under a reply: looks stopped" maybe "$(screen "$MID")"
t "the notice under a reply, and the line a restarted session adds" maybe "$(screen "$MID"$'\n\n'"● 2 background shell command tasks didn't finish before the previous session ended. Task ids: b1, b2.")"
t "his message is off the top of the screen: looks stopped" maybe "$(screen $'  the end of a long message\n'"$HIT_W"$'\n'"$HINT")"
t "a reply that ends on a quoted notice line: looks stopped, never for sure" maybe "$(screen "$MSG"$'\n● השורה שהכלי מחפש:\n\n'"$HIT_W")"
t "a reply that shows his mark, indented, above the notice: never for sure" maybe "$(screen $'● כך נראה מסך של עצירה:\n  ❯ תמשיך\n'"$HIT_W")"
t "a message from another session above the notice: never for sure" maybe "$(screen $'› הודעה מסשן אחר\n'"$HIT_W")"
t "a tool output that is exactly the notice: looks stopped, never for sure" maybe "$(screen "$MSG"$'\n● Bash(tail -1 notes.txt)\n'"$HIT_W")"
# What Claude Code's own continue at the reset, or his "continue", leaves on the screen.
t "the limit passed and the session went on by itself" other "$(screen "$STOP"$'\n● ממשיך מאיפה שעצרתי.\n  ⎿  done\n● הכול מוכן.')"
t "the limit passed and he typed continue" other "$(screen "$STOP"$'\n❯ continue\n● ממשיך.')"
t "the limit passed and only his continue is on the screen" other "$(screen "$STOP"$'\n❯ continue')"
t "a reply that only mentions background tasks is a reply, not the restart line" other "$(screen "$STOP"$'\n● יש 2 background tasks שעדיין רצים')"
t "the limit passed and only a reply is on the screen" other "$(screen "$STOP"$'\n● ממשיך.')"
t "a message of his is queued after the limit" other "$(screen "$STOP"$'\n› תמשיך בבקשה')"
t "an old limit line that scrolled far up" other "$(screen "$STOP"$'\n● ממשיך.\n'"$(for i in $(seq 1 40); do echo "  line $i"; done)")"
t "login expired" login "$(screen "$REPLY"$'\n  ⎿  Login expired · Please run /login')"
t "idle" other "$(screen "$REPLY")"
t "the 80% warning is not a stop" other "$(screen "$REPLY" '' "  You've used 80% of your weekly limit · resets Nov 20, 4pm (Asia/Jerusalem) · ◎ /goal active (2h)"$'\n'"$FOOT")"
t "stopped, with the 80% warning beside it" limit "$(screen "$MSG"$'\n'"  ⎿  You've hit your session limit · resets 6pm (Asia/Jerusalem)" '' "  You've used 80% of your weekly limit · resets Nov 20, 4pm"$'\n'"$FOOT")"
t "a question dialog is open" asking "$HIT_W"$'\n\n ☐ להעיר עכשיו\n❯ 1. כן\n  2. לא\nEnter to select · ↑/↓ to navigate · Esc to cancel'
t "a permission menu is open" asking "$(printf '%s\n%s\n Bash command\n Do you want to proceed?\n❯ 1. Yes\n  2. No\n' "$REPLY" "$HIT_W")"
t "a plan approval dialog is open" asking "$(printf '%s\n%s\n Here is the plan\n Would you like to proceed?\n❯ 1. Yes\n  2. No\n' "$REPLY" "$HIT_W")"
t "no prompt box on the screen: nothing is read into it" other "$STOP"$'\n\n> '
t "a short line of dashes in the status lines is not the rule of the box" limit "$(screen "$STOP" '' $'  ───\n'"$FOOT")"
# Found by the third review of 2026-11-14: the limit words on the screen of a session that did
# not stop. The screens have the shape of real ones (a reply's lines are indented under its ●, a
# long tool output is cut to "… +N lines"); none of them may read as stopped.
QUOTE=$'● בדקתי את הכלי.\n  הוא מחפש את השורה You\'ve hit your weekly limit · resets Nov 20, 4pm ולא מוצא אותה.\n  מצב: הכול סגור'
GREP=$'● Search(pattern: "hit your", path: "tests")\n  ⎿  tests/resume-all.sh:13:HIT_W="  ⎿  You\'ve hit your weekly limit · resets Nov 20, 4pm"\n     … +4 lines (ctrl+o to expand)'
BARE=$'● Bash(grep -h hit notes.txt)\n  ⎿  You\'ve hit your weekly limit · resets Nov 20, 4pm\n     a second line of the output\n     … +4 lines (ctrl+o to expand)'
t "idle, the last reply quotes the notice inside a sentence" unsure "$(screen "$QUOTE")"
t "idle, the reply ends on a sentence that quotes the notice" unsure "$(screen $'● בדקתי את הכלי.\n  הוא מחפש את השורה You\'ve hit your weekly limit · resets Nov 20, 4pm')"
t "idle, a reply says usage limit reached in English" unsure "$(screen $'● Done.\n  The run ended when the usage limit reached its cap.')"
t "idle, the last block is a search output that shows the notice" unsure "$(screen "$GREP")"
t "idle, a tool output whose first line is the bare notice" unsure "$(screen "$BARE")"
t "a tool output with the bare notice, and a reply after it" other "$(screen "$BARE"$'\n● זה מה שמצאתי.')"
t "a teammate's report quotes the notice" unsure "$(screen $'● Teammate finished\n  ⎿  the screen showed You\'ve hit your weekly limit · resets Nov 20\n     and nothing after it')"
t "stopped, and a line the reading does not know comes after the notice" unsure "$(screen "$STOP"$'\n  ⎿  Tip: run /usage to see what is left')"
t "the notice cut in two by a narrow pane" unsure "$(screen "$MSG"$'\n'"  ⎿  You've hit your weekly"$'\n'"     limit · resets Nov 20, 4pm")"
# Working.
TODO=$'  ⎿  ☐ Read the plan'; for i in $(seq 1 8); do TODO+=$'\n'"     ☐ step $i"; done
t "working, new wording" busy "$(screen "$STOP"$'\n● Reading the file\n* Beaming… (19m 53s · ↓ 42.2k tokens)\n  ⎿  Tip: drag and drop image files')"
t "working, seconds only" busy "$(screen "$REPLY"$'\n✻ Thinking… (41s)')"
t "working, old wording" busy "$(screen "$STOP"$'\n✻ Thinking… (esc to interrupt)')"
t "working, the notice in a tool output and a long list under the timer" busy "$(screen "$BARE"$'\n* Misting… (6m 27s · ↓ 29.2k tokens)\n'"$TODO")"
t "working, a long list under the timer and no notice" busy "$(screen "$REPLY"$'\n✽ Computing… (1m 18s · ↓ 5.3k tokens)\n'"$TODO"$'\n'"$TODO")"
t "working, minutes only" busy "$(screen "$STOP"$'\n✻ Thinking… (6m · ↓ 1k tokens)')"
t "working, minutes only, under a sign the reading does not know" busy "$(screen "$STOP"$'\n◐ Thinking… (6m · ↓ 1k tokens)')"
t "working, hours and minutes" busy "$(screen "$STOP"$'\n✻ Thinking… (1h 2m · ↓ 1k tokens)')"
t "working, three dots" busy "$(screen "$STOP"$'\n✻ Thinking... (12s · ↓ 1k tokens)')"
t "working, no timer yet" busy "$(screen "$STOP"$'\n✽ Embellishing…')"
t "working, the sign only in the status lines" busy "$(screen "$STOP" '' $'  ⏵⏵ bypass permissions on · esc to interrupt\n  ● main')"
# The reading does not depend on the locale (an install over ssh can run with none).
got="$(screen "$STOP" | LC_ALL=C RESUME_ALL_CLASSIFY_ONLY=1 bash "$BIN")"
[ "$got" = limit ] && PASS=$((PASS+1)) || { echo "FAIL: stopped, read under LC_ALL=C — got $got"; FAIL=$((FAIL+1)); }
got="$(screen "$STOP" 'טיוטה' | LC_ALL=C RESUME_ALL_CLASSIFY_ONLY=1 bash "$BIN")"
[ "$got" = draft ] && PASS=$((PASS+1)) || { echo "FAIL: a draft, read under LC_ALL=C — got $got"; FAIL=$((FAIL+1)); }

# The whole tool against a made-up orca: a dry run types nothing; --send types only into a
# session that is stopped for sure with an empty box; --only narrows it to what he was shown,
# and is the only way a session that looks stopped is woken; --environment reaches every call.
fake=$(mktemp -d) || { echo "FAIL: no temp folder for the made-up orca; nothing more was run"; exit 1; }
[ -n "$fake" ] && [ -d "$fake" ] || { echo "FAIL: no temp folder for the made-up orca; nothing more was run"; exit 1; }
log="$fake/calls.log"
export FAKE_SCREENS="$fake/screens"; mkdir -p "$FAKE_SCREENS"
screen "$STOP" > "$FAKE_SCREENS/t-stopped"
screen "$REPLY"$'\n❯ תמשיך\n'"$HIT_W" > "$FAKE_SCREENS/t-stopped2"
screen "$MID" > "$FAKE_SCREENS/t-midwork"
screen "$MSG"$'\n● השורה שהכלי מחפש:\n\n'"$HIT_W" > "$FAKE_SCREENS/t-endquote"
screen "$STOP"$'\n* Beaming… (3m 2s · ↓ 1.2k tokens)' > "$FAKE_SCREENS/t-working"
screen "$REPLY" '' "  You've used 80% of your weekly limit · resets Nov 20, 4pm"$'\n'"$FOOT" > "$FAKE_SCREENS/t-warned"
screen "$REPLY"$'\n  ⎿  Login expired · Please run /login' > "$FAKE_SCREENS/t-login"
screen "$STOP" 'טיוטה שלו' > "$FAKE_SCREENS/t-draft"
printf '%s\n\n ☐ שאלה\n❯ 1. כן\n  2. לא\nEnter to select · ↑/↓ to navigate · Esc to cancel\n' "$HIT_W" > "$FAKE_SCREENS/t-dialog"
screen "$STOP"$'\n● ממשיך מאיפה שעצרתי.\n● הכול מוכן.' > "$FAKE_SCREENS/t-resumed"
screen "$STOP" > "$FAKE_SCREENS/t-codex"
screen "$QUOTE" > "$FAKE_SCREENS/t-quote"
screen "$GREP" > "$FAKE_SCREENS/t-grep"
screen "$BARE" > "$FAKE_SCREENS/t-bare"
cat > "$fake/orca" <<'ORCA'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$1 $2" in
  "terminal list")
    for t in t-stopped t-stopped2 t-midwork t-endquote t-working t-warned t-login t-draft t-dialog t-resumed t-quote t-grep t-bare; do
      jq -n --arg h "$t" '{handle:$h,title:("title of "+$h),agentIdentity:"claude",connected:true,writable:true,orphaned:false}'
    done | jq -s '{result:{terminals:(. + [{handle:"t-codex",title:"codex one",agentIdentity:"codex",connected:true,writable:true,orphaned:false}])}}' ;;
  "terminal read")
    h=''; while [ $# -gt 0 ]; do [ "$1" = --terminal ] && h=$2; shift; done
    jq -Rn '{result:{terminal:{tail:[inputs]}}}' < "$FAKE_SCREENS/$h" ;;
  "terminal send") case " $* " in *" --terminal ${FAKE_FAIL:-none} "*) exit 1 ;; esac; exit 0 ;;
esac
ORCA
chmod +x "$fake/orca"
[ -x "$fake/orca" ] || { echo "FAIL: the made-up orca could not be written; nothing more was run"; exit 1; }
# The tool is pointed at the made-up orca by its path, never through PATH.
run() { : > "$log"; FAKE_LOG="$log" RESUME_ALL_ORCA="$fake/orca" bash "$BIN" "$@" 2>&1; }
check() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
sends() { grep -c "^terminal send" "$log"; }
out=$(run)
check "a dry run lists the two sessions stopped for sure, and no other, as stopped" \
  '[ "$(grep -c "^would send" <<<"$out")" = 2 ] && grep -q "^would send  *t-stopped " <<<"$out" && grep -q "^would send  *t-stopped2 " <<<"$out"'
check "a dry run lists the two that look stopped apart from them" \
  '[ "$(grep -c "^looks stopped" <<<"$out")" = 2 ] && grep -q "^looks stopped  *t-midwork " <<<"$out" && grep -q "^looks stopped  *t-endquote " <<<"$out"'
check "a dry run names the session that needs /login"      'grep -q "^needs /login  *t-login " <<<"$out"'
check "a dry run names the one with text in its box"       'grep -q "^has text in its box  *t-draft " <<<"$out"'
check "a dry run names the one with a dialog"              'grep -q "^has a dialog  *t-dialog " <<<"$out"'
check "a session that went on, a working one, a warned one and codex are not listed" \
  '! grep -q "t-resumed\|t-working\|t-warned\|t-codex" <<<"$out"'
check "a dry run counts two for sure and two more that look stopped" \
  'grep -q "2 limit-stopped sessions found" <<<"$out" && grep -q "2 more look stopped" <<<"$out"'
check "a dry run names a screen that only quotes the notice as unsure, never as stopped" \
  '[ "$(grep -c "^unsure " <<<"$out")" = 3 ] && ! grep "^would send\|^looks stopped" <<<"$out" | grep -q "t-quote\|t-grep\|t-bare"'
check "a stopped session is listed with the notice its screen shows" \
  'grep -qF "[You'"'"'ve hit your weekly limit · resets Nov 20, 4pm (Asia/Jerusalem)]" <<<"$(grep "^would send  *t-stopped " <<<"$out")"'
check "a dry run types into nothing"                       '[ "$(sends)" = 0 ]'
out=$(run --send)
check "--send types into the two sessions stopped for sure only" \
  '[ "$(sends)" = 2 ] && grep -q "^terminal send --terminal t-stopped " "$log" && grep -q "^terminal send --terminal t-stopped2 " "$log"'
check "--send leaves the ones that look stopped, and names them" \
  '[ "$(grep -c "^looks stopped" <<<"$out")" = 2 ] && grep -q "2 more look stopped" <<<"$out"'
check "--send types into no session with text in its box, a dialog, work, a reply after the limit, or only a quote of the notice" \
  '! grep "^terminal send" "$log" | grep -q "t-draft\|t-dialog\|t-working\|t-resumed\|t-warned\|t-login\|t-codex\|t-quote\|t-grep\|t-bare\|t-midwork\|t-endquote"'
check "--send says two of two"                             'grep -q "2 of 2 limit-stopped sessions resumed" <<<"$out"'
out=$(run --send --only t-stopped2,t-draft,t-working)
check "--only types into what was named and is still stopped, and nothing else" \
  '[ "$(sends)" = 1 ] && grep -q "^terminal send --terminal t-stopped2 " "$log"'
check "--only names the stopped session it left alone"     'grep -q "^not in --only  *t-stopped " <<<"$out"'
check "--only says which named session is not stopped now" 'grep -q "^not stopped now  *t-working " <<<"$out" && ! grep -q "^not stopped now  *t-draft " <<<"$out"'
out=$(FAKE_FAIL=t-stopped2 run --send)
check "a send that fails is said and not counted" \
  'grep -q "^SEND FAILED  *t-stopped2 " <<<"$out" && grep -q "1 of 2 limit-stopped sessions resumed" <<<"$out"'
out=$(run --send --only t-stopped,t-midwork)
check "--only wakes a session that looks stopped when it is named" \
  '[ "$(sends)" = 2 ] && grep -q "^terminal send --terminal t-midwork " "$log" && grep -q "^sent  *t-midwork " <<<"$out"'
check "--only leaves the other one that looks stopped"     'grep -q "^not in --only  *t-endquote " <<<"$out"'
out=$(run --only t-midwork)
check "a dry run with --only shows what it would wake, and types nothing" \
  '[ "$(sends)" = 0 ] && grep -q "^would send  *t-midwork " <<<"$out"'
out=$(run --send --only t-quote,t-grep,t-bare)
check "--only with the sessions that only quote the notice types into nothing" '[ "$(sends)" = 0 ]'
out=$(run --send --only "t-draft, t-stopped2")
check "--only takes a list written with spaces"            '[ "$(sends)" = 1 ] && grep -q "^terminal send --terminal t-stopped2 " "$log"'
out=$(run --environment msi --send --only t-stopped)
check "--environment reaches the list, the read and the send" \
  '[ "$(grep -c -- "--environment msi" "$log")" = "$(wc -l < "$log")" ] && grep -q "^terminal send --environment msi --terminal t-stopped " "$log"'
rm -rf -- "${fake:?}"

echo "resume-all: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
