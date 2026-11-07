#!/usr/bin/env bash
# tests/resume-all.sh: the screen classifier of bin/resume-all on real wording from transcripts.
set -uo pipefail
BIN="$(cd "$(dirname "$0")/.." && pwd)/bin/resume-all"
PASS=0; FAIL=0
t() {  # name want screen
  local got; got="$(printf '%s\n' "$3" | RESUME_ALL_CLASSIFY_ONLY=1 bash "$BIN")"
  if [ "$got" = "$2" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want $2, got $got"; FAIL=$((FAIL+1)); fi
}
t "weekly"   limit $'some output\n  ⎿  You\'ve hit your weekly limit · resets Nov 6, 1am (Asia/Jerusalem)\n\n> '
t "5-hour"   limit "You've hit your 5-hour limit · resets 8:40am (Asia/Jerusalem)"
t "session"  limit "You've hit your session limit · resets 1:50am (Asia/Jerusalem)"
t "login"    login "Login expired · Please run /login"
t "busy"     busy  $'You\'ve hit your session limit · resets 1:50am\n✻ Thinking… (esc to interrupt)'
t "idle"     other $'Done.\n> '
t "old msg scrolled away" other "$(printf 'You\x27ve hit your weekly limit · resets Nov 6\n'; for i in $(seq 1 25); do echo "line $i"; done)"
echo "resume-all: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
