#!/usr/bin/env bash
# Real mouse input through ydotool, in KWin logical coordinates (the numbers
# `kdotool getmouselocation` and window geometry use; screenshot pixels / scale).
# Tier 4 (moves Nadav's cursor): only after his OK for this action.
# Moves go straight from the current position by relative steps (1:1 on the
# flat-acceleration ydotoold device) and are checked against the real cursor;
# no corner parking, so no screen-edge action can fire. After click, double,
# drag and scroll the cursor goes back to where it was.
#
# Usage:
#   mouse.sh pos                       print the current cursor position "X Y"
#   mouse.sh move X Y
#   mouse.sh click X Y [left|right|middle]
#   mouse.sh double X Y
#   mouse.sh drag X1 Y1 X2 Y2
#   mouse.sh scroll X Y N              N>0 scrolls down, N<0 up (wheel notches)
# Exit 4: the cursor did not reach the point (often Nadav moved the mouse):
# stop and ask, never retry in a loop.
set -euo pipefail

pos() {
  local out
  out=$(kdotool getmouselocation --shell)
  echo "$(sed -n 's/^X=//p' <<<"$out") $(sed -n 's/^Y=//p' <<<"$out")"
}

int() { [[ "$1" =~ ^[0-9]+$ ]] || { echo "coordinates must be non-negative integers: $1" >&2; exit 2; }; }

move() {
  local tx=$1 ty=$2 cx cy dx dy
  for _ in 1 2 3 4 5; do
    read -r cx cy < <(pos)
    dx=$((tx - cx)); dy=$((ty - cy))
    if [ "${dx#-}" -le 1 ] && [ "${dy#-}" -le 1 ]; then return 0; fi
    ydotool mousemove -x "$dx" -y "$dy" >/dev/null
    sleep 0.05
  done
  read -r cx cy < <(pos)
  echo "cursor at $cx,$cy, wanted $tx,$ty (moved by someone, or the ydotoold device lost its flat acceleration: run check.sh)" >&2
  return 4
}

button() {
  case "${1:-left}" in
    left) echo 0 ;; right) echo 1 ;; middle) echo 2 ;;
    *) echo "button must be left, right or middle" >&2; exit 2 ;;
  esac
}

home=""
# shellcheck disable=SC2086  # home is "X Y", split on purpose
go_home() { if [ -n "$home" ]; then move $home >/dev/null 2>&1 || true; fi; }

cmd=${1:-}; shift || true
case "$cmd" in
  pos) pos ;;
  move) [ $# -eq 2 ] || exit 2; int "$1"; int "$2"; move "$1" "$2" || exit 4 ;;
  click)
    [ $# -ge 2 ] || exit 2; int "$1"; int "$2"; b=$(button "${3:-left}")
    home=$(pos); move "$1" "$2" || exit 4; ydotool click "0xC$b" >/dev/null; sleep 0.05; go_home ;;
  double)
    [ $# -eq 2 ] || exit 2; int "$1"; int "$2"
    home=$(pos); move "$1" "$2" || exit 4; ydotool click -r 2 -D 60 0xC0 >/dev/null; sleep 0.05; go_home ;;
  drag)
    [ $# -eq 4 ] || exit 2; int "$1"; int "$2"; int "$3"; int "$4"
    home=$(pos); move "$1" "$2" || exit 4
    # From here the button is down: release it on every exit path, or the
    # whole desktop keeps a held left button. (A SIGKILL skips traps: then run
    # `ydotool click 0x80` by hand.)
    trap 'ydotool click 0x80 >/dev/null 2>&1' EXIT
    ydotool click 0x40 >/dev/null; sleep 0.15
    # Move in steps so apps see a drag gesture, then land exactly.
    for k in 1 2 3 4 5 6 7 8; do
      ydotool mousemove -x $((($3 - $1) * k / 8 - ($3 - $1) * (k - 1) / 8)) -y $((($4 - $2) * k / 8 - ($4 - $2) * (k - 1) / 8)) >/dev/null
      sleep 0.03
    done
    # KWin snapping can hold the cursor a few pixels short while it drags a
    # window; warn and still drop rather than abort with the button held.
    move "$3" "$4" || echo "warning: dropped near, not exactly at, $3,$4" >&2
    sleep 0.15; ydotool click 0x80 >/dev/null; trap - EXIT; go_home ;;
  scroll)
    [ $# -eq 3 ] || exit 2; int "$1"; int "$2"; [[ "$3" =~ ^-?[0-9]+$ ]] || exit 2
    home=$(pos); move "$1" "$2" || exit 4; ydotool mousemove --wheel -x 0 -y "$((-$3))" >/dev/null; sleep 0.05; go_home ;;
  *) sed -n '2,18p' "$0" >&2; exit 2 ;;
esac
