#!/usr/bin/env bash
# Screenshot through Spectacle, with no consent dialog on KDE Plasma.
# Usage: screenshot.sh <out.png> [--window <window-id|class-regex>] [--pointer]
# Without --window: the whole desktop. With it: the screen area of that window's
# content, which shows whatever is on top there, so only the active window is
# accepted (anything else would capture other windows, possibly private ones).
# Output pixels are physical; divide by the printed scale to get the logical
# coordinates mouse.sh takes. Screenshots can hold private content: keep them in
# the session scratchpad and never upload them.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: screenshot.sh <out.png> [--window <id|class>] [--pointer]" >&2; exit 2; }
out=$1; shift
win="" ptr=""
while [ $# -gt 0 ]; do
  case "$1" in
    --window) win=$2; shift 2 ;;
    --pointer) ptr=-p; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
here=$(cd "$(dirname "$0")" && pwd)

# A path that does not exist yet: Spectacle will not write over an existing file.
tmpd=$(mktemp -d); trap 'rm -rf "$tmpd"' EXIT
full="$tmpd/full.png"
timeout 20 spectacle -b -n -f $ptr -o "$full" >/dev/null 2>&1
[ -s "$full" ] || { echo "spectacle produced no image" >&2; exit 3; }

# Scale = physical width / logical width of the desktop.
lw=$(kscreen-doctor -j 2>/dev/null | python3 -I -c '
import json, sys
o = [x for x in json.load(sys.stdin)["outputs"] if x.get("enabled")]
print(max(x["pos"]["x"] + x["size"]["width"] / x.get("scale", 1) for x in o))' 2>/dev/null || true)
[ -n "$lw" ] || { echo "could not read the screen layout from kscreen-doctor, so the scale is unknown" >&2; exit 3; }
pw=$(magick identify -format '%w' "$full")
scale=$(python3 -I -c 'import sys; print(round(float(sys.argv[1]) / float(sys.argv[2]), 4))' "$pw" "$lw")

if [ -n "$win" ]; then
  read -r x y w h state < <("$here/window-content.sh" "$win")
  [ -n "${state:-}" ] || { echo "could not locate window $win" >&2; exit 1; }
  case "$state" in
    *active=1*minimized=0*here=1*) ;;
    *) echo "refused: window is not the active one on screen ($state); a crop would show what covers it. Take a full screenshot or ask Nadav to bring it up." >&2; exit 6 ;;
  esac
  geo=$(python3 -I -c 'import sys; s=float(sys.argv[5]); x,y,w,h=(round(float(v)*s) for v in sys.argv[1:5]); print(f"{w}x{h}+{x}+{y}")' "$x" "$y" "$w" "$h" "$scale")
  magick "$full" -crop "$geo" +repage "$out"
  echo "saved $out (window content at logical $x,$y; scale $scale)"
else
  cp "$full" "$out"
  echo "saved $out (scale $scale)"
fi
