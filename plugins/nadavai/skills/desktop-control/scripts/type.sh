#!/usr/bin/env bash
# Type text as real keyboard input into the focused window.
# Tier 4 (keys go to whatever has focus): last resort; announce it in one line first (no per-use OK since 2026-11-03).
# Prefer `agent-desktop type <ref> 'text'`: no focus, layout or clipboard involved.
# Usage: type.sh --window <kdotool-id> 'text' [--allow-newline]
#   --window: the window that must have focus; checked right before typing, exit 6
#     if it does not.
#   A newline is a real Enter, which sends a chat message or submits a form, so
#     text with line breaks is refused unless --allow-newline.
# ASCII text: switches KDE to the US layout, types with ydotool, restores the layout
#   (ydotool sends key positions, so a Hebrew layout would turn "Hello" into Hebrew letters).
# Other text (Hebrew, emoji): pastes through the clipboard with Ctrl+V, then puts
#   Nadav's clipboard text back. Refused when his clipboard holds anything but plain
#   text (an image, files, a password-manager entry), because that cannot be restored.
#   Klipper's history will still list the pasted text.
set -euo pipefail

usage() { echo "usage: type.sh --window <kdotool-id> 'text' [--allow-newline]" >&2; exit 2; }
[ $# -ge 3 ] && [ "$1" = --window ] || usage
win=$2 text=$3 allow_nl=${4:-}
[ -z "$allow_nl" ] || [ "$allow_nl" = --allow-newline ] || usage
here=$(cd "$(dirname "$0")" && pwd)

if [[ "$text" == *$'\n'* || "$text" == *$'\r'* ]] && [ "$allow_nl" != --allow-newline ]; then
  echo "refused: text has a line break, which types Enter (sends/submits); pass --allow-newline only if that is intended" >&2; exit 2
fi

focused() {
  [ "$(kdotool getactivewindow 2>/dev/null)" = "$win" ] || { echo "refused: window $win is not focused (Nadav may have switched windows)" >&2; exit 6; }
}

ascii=1
if printf '%s' "$text" | LC_ALL=C grep -qP '[^\x00-\x7F]'; then ascii=0; fi

if [ "$ascii" = 1 ]; then
  # Literal form: [Argument: a(sss) {[Argument: (sss) "us", "", "English (US)"], ...}]
  layouts=$(qdbus6 --literal org.kde.keyboard /Layouts org.kde.KeyboardLayouts.getLayoutsList 2>/dev/null || true)
  prev=$(qdbus6 org.kde.keyboard /Layouts org.kde.KeyboardLayouts.getLayout 2>/dev/null || true)
  us=""
  [ -z "$layouts" ] || us=$(grep -oE '\(sss\) "[^"]*"' <<<"$layouts" | awk '$2=="\"us\"" {print NR-1; exit}' || true)
  focused
  if [ -n "$us" ] && [ -n "$prev" ] && [ "$us" != "$prev" ]; then
    trap 'qdbus6 org.kde.keyboard /Layouts org.kde.KeyboardLayouts.setLayout "$prev" >/dev/null' EXIT
    qdbus6 org.kde.keyboard /Layouts org.kde.KeyboardLayouts.setLayout "$us" >/dev/null
    sleep 0.15
  elif [ -z "$us" ]; then
    echo "warning: no 'us' layout found; typed letters follow the active layout" >&2
  fi
  focused
  ydotool type -- "$text" >/dev/null
  sleep 0.1
else
  command -v wl-copy >/dev/null || { echo "missing wl-clipboard" >&2; exit 3; }
  focused   # before touching the clipboard at all
  types=$(wl-paste --list-types 2>/dev/null || true)
  if grep -qi 'passwordmanagerhint' <<<"$types"; then
    echo "refused: the clipboard holds a password-manager entry; use agent-desktop type instead" >&2; exit 7
  fi
  if [ -n "$types" ] && grep -qvE '^(text/plain(;charset=utf-8)?|UTF8_STRING|STRING|TEXT|COMPOUND_TEXT|text/x-moz-text-internal)$' <<<"$types"; then
    echo "refused: the clipboard holds more than plain text ($(tr '\n' ' ' <<<"$types")), which cannot be restored; use agent-desktop type instead" >&2; exit 7
  fi
  tmp=$(mktemp -d)
  had=0
  if [ -n "$types" ]; then
    wl-paste --no-newline >"$tmp/clip" || { rm -rf "$tmp"; echo "refused: could not save the clipboard" >&2; exit 7; }
    had=1
  fi
  restore() {
    if [ "$had" = 1 ]; then wl-copy <"$tmp/clip"; else wl-copy --clear; fi
    rm -rf "$tmp"
  }
  trap restore EXIT
  focused
  printf '%s' "$text" | wl-copy
  sleep 0.15
  focused
  "$here/key.sh" --window "$win" ctrl+v
  sleep 0.6   # let the app read the clipboard before it changes back
fi
