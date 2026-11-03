#!/usr/bin/env bash
# Press a key combo as real keyboard input through ydotool.
# Tier 4 (keys go to whatever has focus): last resort; announce it in one line first (no per-use OK since 2026-11-03).
# Usage: key.sh --window <kdotool-id|any> <combo>
#   key.sh --window "$W" ctrl+shift+t     key.sh --window "$W" Return
#   --window: the window that must have focus; checked right before the keys
#   go out, exit 6 if it does not. "any" only for global shortcuts.
# Keys are physical key positions (layout-independent), named as in
# linux/input-event-codes.h without the KEY_ prefix, plus common aliases.
set -euo pipefail

usage() { echo "usage: key.sh --window <kdotool-id|any> <combo>  e.g. ctrl+c, Return, alt+tab" >&2; exit 2; }
[ $# -eq 3 ] && [ "$1" = --window ] || usage
win=$2; shift 2
HDR=/usr/include/linux/input-event-codes.h
[ -r "$HDR" ] || { echo "missing $HDR (install linux-api-headers)" >&2; exit 3; }

code_of() {
  local n
  n=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')
  case "$n" in
    CTRL|CONTROL) n=LEFTCTRL ;; SHIFT) n=LEFTSHIFT ;; ALT) n=LEFTALT ;;
    ALTGR) n=RIGHTALT ;; SUPER|META|WIN|CMD) n=LEFTMETA ;;
    RETURN) n=ENTER ;; ESCAPE) n=ESC ;; DEL) n=DELETE ;; INS) n=INSERT ;;
    PGUP|PRIOR) n=PAGEUP ;; PGDN|NEXT) n=PAGEDOWN ;; BKSP) n=BACKSPACE ;;
    PRINT|PRTSC) n=SYSRQ ;; MENU) n=COMPOSE ;;
    -) n=MINUS ;; =) n=EQUAL ;; ,) n=COMMA ;; .) n=DOT ;; /) n=SLASH ;;
    \;) n=SEMICOLON ;; \') n=APOSTROPHE ;; \[) n=LEFTBRACE ;; \]) n=RIGHTBRACE ;;
    \`) n=GRAVE ;; \\) n=BACKSLASH ;;
  esac
  local c
  c=$(awk -v k="KEY_$n" '$1=="#define" && $2==k {print $3; exit}' "$HDR")
  [[ "$c" =~ ^[0-9]+$ ]] || { echo "unknown key: $1" >&2; exit 2; }
  echo "$c"
}

IFS='+' read -ra parts <<<"$1"
codes=()
for p in "${parts[@]}"; do codes+=("$(code_of "$p")"); done

if [ "$win" != any ] && [ "$(kdotool getactivewindow 2>/dev/null)" != "$win" ]; then
  echo "refused: window $win is not focused (Nadav may have switched windows)" >&2; exit 6
fi
args=()
for c in "${codes[@]}"; do args+=("$c:1"); done
for ((i=${#codes[@]}-1; i>=0; i--)); do args+=("${codes[$i]}:0"); done
ydotool key "${args[@]}" >/dev/null
