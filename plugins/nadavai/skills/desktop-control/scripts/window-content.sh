#!/usr/bin/env bash
# Print a window's content area (without the title bar) in KWin logical
# coordinates, plus its state:
#   "X Y W H active=0|1 minimized=0|1 here=0|1"   (here = on the current desktop)
# agent-desktop element bounds are relative to this area, so
#   screen point = content X,Y + bounds x,y.
# Usage: window-content.sh <kdotool-window-id | class-regex>
#   Prefer the window id (`kdotool search --class <app>`): a class regex must match
#   exactly one normal window, else the script lists the matches and exits 5.
# kdotool covers everything else about windows; it reports only the outer frame.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: window-content.sh <window-id|class-regex>" >&2; exit 2; }
want=$1
if [[ "$want" == *[[:cntrl:]]* ]] || LC_ALL=C grep -q $'\xe2\x80[\xa8\xa9]' <<<"$want"; then
  echo "window argument contains control characters" >&2; exit 2
fi
tok="WC$$_$RANDOM"
js=$(mktemp --suffix=.js)
trap 'rm -f "$js"; qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$tok" >/dev/null 2>&1 || true' EXIT
want_js=$(printf '%s' "$want" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat >"$js" <<JS
var want = "$want_js";
var ws = workspace.windowList ? workspace.windowList() : workspace.clientList();
var re = null; try { re = new RegExp(want, "i"); } catch (e) {}
var hits = [];
for (var i = 0; i < ws.length; i++) {
  var w = ws[i];
  if (String(w.internalId) === want) { hits = [w]; break; }
  if (!w.normalWindow && !w.dialog) continue;
  if (re && (re.test(String(w.resourceClass)) || re.test(String(w.resourceName)))) hits.push(w);
}
if (hits.length === 1) {
  var w = hits[0], c = w.clientGeometry;
  var here = w.onAllDesktops || (w.desktops || []).indexOf(workspace.currentDesktop) >= 0;
  print("$tok " + Math.round(c.x) + " " + Math.round(c.y) + " " + Math.round(c.width) + " " + Math.round(c.height)
        + " active=" + (workspace.activeWindow === w ? 1 : 0) + " minimized=" + (w.minimized ? 1 : 0) + " here=" + (here ? 1 : 0));
} else if (hits.length === 0) {
  print("$tok NONE");
} else {
  var l = []; for (var j = 0; j < hits.length; j++) l.push(hits[j].internalId + " " + hits[j].resourceClass + " \"" + hits[j].caption + "\"");
  print("$tok MANY " + l.join(" | "));
}
JS
id=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$js" "$tok")
qdbus6 org.kde.KWin "/Scripting/Script$id" org.kde.kwin.Script.run >/dev/null
r=""
for _ in $(seq 1 15); do
  r=$(journalctl --user -n 400 -o cat --since "-15s" 2>/dev/null | grep -o "$tok .*" | tail -1 || true)
  [ -n "$r" ] && break
  sleep 0.15
done
r=${r#"$tok "}
[ -n "$r" ] || { echo "KWin gave no answer (is this a KDE Plasma session?)" >&2; exit 3; }
case "$r" in
  NONE) echo "no window matches: $want" >&2; exit 1 ;;
  MANY*) echo "several windows match '$want'; pass one id: ${r#MANY }" >&2; exit 5 ;;
esac
echo "$r"
