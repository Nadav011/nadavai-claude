#!/usr/bin/env bash
# Physically click the center of an agent-desktop ref with the real mouse.
# Tier 4 (moves Nadav's cursor): only after his OK for this action.
# For when the semantic `agent-desktop click <ref>` is refused or has no effect
# (Wayland pointer-only widgets, Qt combo popups, menus without a press action).
# Usage: click-ref.sh <ref> <window-id> [left|right|middle|double]
#   <window-id> is the kdotool id of the window the ref's snapshot came from.
# Refuses unless that window is the active one, on this desktop, not minimized,
# and the point lies inside it: a real click lands on whatever is on top.
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: click-ref.sh <ref> <window-id> [left|right|middle|double]" >&2; exit 2; }
ref=$1 win=$2 btn=${3:-left}
here=$(cd "$(dirname "$0")" && pwd)

b=$(agent-desktop get "$ref" --property bounds) || { echo "agent-desktop could not read $ref: $(head -c 300 <<<"$b")" >&2; exit 1; }
read -r bx by bw bh < <(python3 -I -c '
import json, sys
d = json.loads(sys.argv[1])
if not d.get("ok"): sys.exit("agent-desktop: " + json.dumps(d.get("error", d))[:300])
v = d["data"]["value"]
print(v["x"], v["y"], v["width"], v["height"])' "$b")
read -r cx cy cw ch state < <("$here/window-content.sh" "$win")
[ -n "${state:-}" ] || { echo "could not locate window $win" >&2; exit 1; }

case "$state" in
  *minimized=1*) echo "refused: window is minimized" >&2; exit 6 ;;
  *here=0*) echo "refused: window is on another desktop" >&2; exit 6 ;;
  *active=0*) echo "refused: window is not the active one, so the click could hit a window on top of it. Activate it first (kdotool windowactivate $win, with Nadav's OK)." >&2; exit 6 ;;
esac

read -r x y < <(python3 -I -c '
import sys
cx, cy, cw, ch, bx, by, bw, bh = map(float, sys.argv[1:])
px, py = bx + bw / 2, by + bh / 2
if not (0 <= px < cw and 0 <= py < ch): sys.exit(f"refused: element center {px:.0f},{py:.0f} is outside the window content {cw:.0f}x{ch:.0f}")
print(round(cx + px), round(cy + py))' "$cx" "$cy" "$cw" "$ch" "$bx" "$by" "$bw" "$bh")

if [ "$btn" = double ]; then "$here/mouse.sh" double "$x" "$y"; else "$here/mouse.sh" click "$x" "$y" "$btn"; fi
echo "clicked $btn at $x,$y"
