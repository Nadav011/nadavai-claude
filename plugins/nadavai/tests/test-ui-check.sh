#!/usr/bin/env bash
# test-ui-check.sh: runs bin/ui-check against local fixtures over file:// and checks that every
# check fires on bad.html, that clean.html (with a scrolling carousel and a dark theme) is clean,
# that each review fixture (shell, hiddenwrap, offright, fixednav, spanlabel, noviewport, spoof,
# hang) reports its failure, and the exit codes.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
UI="$here/../../../bin/ui-check"
FX="file://$here/fixtures/ui-check"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT

expect() {  # name  want  got
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want ${2}, got: ${3:0:300}"; FAIL=$((FAIL+1)); fi
}
# jq-free JSON probe: q <file> <python expression over v (first viewport) and d (whole report)>
q() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=d["viewports"][0]; print(eval(sys.argv[2]))' "$1" "$2"; }

# bad.html at a phone width: every check fires
"$UI" "$FX/bad.html" --width 375 --json >"$tmp/bad.json"; rc=$?
expect "bad exits 1"                   1 "$rc"
expect "bad dir"                       rtl "$(q "$tmp/bad.json" 'v["dir"]')"
expect "bad lang"                      he "$(q "$tmp/bad.json" 'v["lang"]')"
expect "bad page overflow"             True "$(q "$tmp/bad.json" 'bool(v["pageOverflow"])')"
expect "bad past-viewport is .wide"    True "$(q "$tmp/bad.json" 'v["overflow"]["count"] >= 1 and "wide" in v["overflow"]["examples"][0]["selector"] and v["overflow"]["examples"][0]["box"][0] < 0')"
expect "bad clipped text"              True "$(q "$tmp/bad.json" 'any("clip" in e["selector"] for e in v["clipped"]["examples"])')"
expect "bad overlap"                   True "$(q "$tmp/bad.json" 'v["overlap"]["count"] >= 1 and "first" in v["overlap"]["examples"][0]["selector"] + v["overlap"]["examples"][0]["other"]')"
expect "bad 30x30 touch target"        True "$(q "$tmp/bad.json" 'any("tiny" in e["selector"] and e["box"][2:] == [30, 30] for e in v["touch"]["examples"])')"
expect "bad console error"             True "$(q "$tmp/bad.json" 'v["console"]["count"] >= 1 and "fixture boom" in v["console"]["messages"][0]')"
expect "bad axe color-contrast"        True "$(q "$tmp/bad.json" 'any(r["id"] == "color-contrast" and r["examples"][0]["ratio"] < 4.5 for r in v["axe"]["rules"])')"
expect "bad rtl text-align:left"       True "$(q "$tmp/bad.json" 'any("left" in e["selector"] for e in v["rtlTextLeft"]["examples"])')"
expect "bad boxes are [x,y,w,h] ints"  True "$(q "$tmp/bad.json" 'all(len(e["box"]) == 4 and all(isinstance(n, int) for n in e["box"]) for e in v["clipped"]["examples"])')"
expect "bad findings add up"           True "$(q "$tmp/bad.json" 'd["findings"] == v["findings"] >= 8')"

# touch targets are only checked up to 480 px
"$UI" "$FX/bad.html" --width 1440 --json >"$tmp/wide.json"
expect "no touch check at 1440"        None "$(q "$tmp/wide.json" 'v["touch"]')"

# --ignore removes the overflowing element from the report
"$UI" "$FX/bad.html" --width 375 --ignore .wide --json >"$tmp/ign.json"
expect "--ignore drops .wide"          0 "$(q "$tmp/ign.json" 'v["overflow"]["count"]')"

# the human summary stays short
"$UI" "$FX/bad.html" --width 375,1440 --theme light,dark >"$tmp/bad.txt"
expect "summary under 40 lines"        True "$([ "$(wc -l <"$tmp/bad.txt")" -le 40 ] && echo True || echo False)"
expect "summary names past-viewport"   True "$(grep -q 'past-viewport 1: div.wide' "$tmp/bad.txt" && echo True || echo False)"

# clean.html: both widths and themes, zero findings, carousel not reported
"$UI" "$FX/clean.html" --width 375,1440 --theme light,dark --json >"$tmp/clean.json"; rc=$?
expect "clean exits 0"                 0 "$rc"
expect "clean zero findings"           0 "$(q "$tmp/clean.json" 'd["findings"]')"
expect "clean four viewports"          4 "$(q "$tmp/clean.json" 'len(d["viewports"])')"
expect "carousel not reported"         0 "$(q "$tmp/clean.json" 'sum(x["overflow"]["count"] for x in d["viewports"]) + (1 if any(x["pageOverflow"] for x in d["viewports"]) else 0)')"
# control: the same page with the carousel's scroll turned off does report the slides,
# so the zero above comes from the scroll-container rule, not from slides that fit
sed 's/overflow-x: auto;/overflow-x: visible;/' "$here/fixtures/ui-check/clean.html" >"$tmp/noscroll.html"
"$UI" "file://$tmp/noscroll.html" --width 375 --json >"$tmp/noscroll.json"
expect "unscrolled carousel reported"  True "$(q "$tmp/noscroll.json" 'v["overflow"]["count"] >= 1 and "slide" in v["overflow"]["examples"][0]["selector"]')"

# review fixtures: each failure shape is reported (all RTL phone pages unless noted)
"$UI" "$FX/shell.html" --width 375 --json >"$tmp/shell.json"; rc=$?
expect "shell exits 1"                 1 "$rc"
expect "overflow inside a vertical shell" True "$(q "$tmp/shell.json" 'v["overflow"]["count"] >= 1 and "wide" in v["overflow"]["examples"][0]["selector"]')"
"$UI" "$FX/hiddenwrap.html" --width 375 --json >"$tmp/hw.json"
expect "button cut by overflow-x:hidden" True "$(q "$tmp/hw.json" 'any("button" in e["selector"] and "wrap" in e["by"] for e in v["clippedByAncestor"]["examples"])')"
"$UI" "$FX/offright.html" --width 375 --json >"$tmp/off.json"
expect "button wholly off screen"      True "$(q "$tmp/off.json" 'any("button" in e["selector"] and e["box"][0] >= 375 for e in v["offscreen"]["examples"])')"
"$UI" "$FX/fixednav.html" --width 375 --json >"$tmp/fix.json"
expect "button under a fixed bottom bar" True "$(q "$tmp/fix.json" 'any(e.get("fixedBar") and "button" in e["selector"] and "nav" in e["other"] for e in v["overlap"]["examples"])')"
# control: with room to scroll the button clear of the bar, the pair is not reported
sed 's/\.spacer{height:700px}/.spacer{height:700px} main{padding-bottom:80px}/' "$here/fixtures/ui-check/fixednav.html" >"$tmp/fixok.html"
"$UI" "file://$tmp/fixok.html" --width 375 --json >"$tmp/fixok.json"
expect "bar with scroll room is clean" 0 "$(q "$tmp/fixok.json" 'v["overlap"]["count"]')"
"$UI" "$FX/spanlabel.html" --width 375 --json >"$tmp/span.json"
expect "label in a span clipped"       True "$(q "$tmp/span.json" 'any("button" in e["selector"] for e in v["clipped"]["examples"])')"
"$UI" "$FX/noviewport.html" --width 375,1440 --json >"$tmp/novp.json"
expect "missing viewport meta at 375"  missing "$(q "$tmp/novp.json" 'v["viewportMeta"]["problem"]')"
expect "viewport meta not checked at 1440" None "$(q "$tmp/novp.json" 'd["viewports"][1]["viewportMeta"]')"
# spoof.html replaces window.axe with a getter returning a fake result: the real axe still runs
"$UI" "$FX/spoof.html" --width 375 --json >"$tmp/spoof.json"
expect "page cannot spoof axe"         False "$(q "$tmp/spoof.json" 'any("IGNORE" in r["id"] for r in v["axe"]["rules"])')"
# page strings reach the summary without control characters
printf '<!doctype html><html lang="en"><title>t</title><main><h1>x</h1></main><script>console.error("\\x1b[2J\\x1b[31mesc\\x07")</script></html>' >"$tmp/esc.html"
"$UI" "file://$tmp/esc.html" --width 1440 >"$tmp/esc.txt"
expect "summary shows the page string" 1 "$(grep -c 'console-errors 1: .*esc' "$tmp/esc.txt")"
expect "summary has no control chars"  0 "$(LC_ALL=C grep -c $'[\x01-\x08\x0b-\x1f\x7f]' "$tmp/esc.txt")"
# controls: an a without href is not one; role=switch and summary are
printf '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>t</title><main><h1>x</h1><a class="nohref" style="display:inline-block;width:20px;height:20px">a</a><div class="sw" role="switch" aria-checked="false" aria-label="s" tabindex="-1" style="width:20px;height:20px"></div><details><summary class="sum" style="width:20px;height:20px">s</summary>d</details></main></html>' >"$tmp/ctl.html"
"$UI" "file://$tmp/ctl.html" --width 375 --json >"$tmp/ctl.json"
expect "a without href not a control"  False "$(q "$tmp/ctl.json" 'any("nohref" in e["selector"] for e in v["touch"]["examples"])')"
expect "role=switch and summary are controls" True "$(q "$tmp/ctl.json" 'sum(("sw" in e["selector"]) + ("sum" in e["selector"]) for e in v["touch"]["examples"]) == 2')"
# round 2: a clipped-away menu, cut tabs, a sheet that hides a button sideways, a text-only fixed banner
"$UI" "$FX/menuclip.html" --width 375 --json >"$tmp/mc.json"
expect "menu clipped away by overflow-x:hidden" True "$(q "$tmp/mc.json" 'any("menu" in e["selector"] for e in v["offscreen"]["examples"] + v["clippedByAncestor"]["examples"])')"
"$UI" "$FX/navcut.html" --width 375 --json >"$tmp/nc.json"
expect "tab cut by a hidden tab row"   True "$(q "$tmp/nc.json" 'v["offscreen"]["count"] + v["clippedByAncestor"]["count"] >= 1')"
"$UI" "$FX/sheet.html" --width 375 --json >"$tmp/sh.json"
expect "button hidden sideways in a sheet" True "$(q "$tmp/sh.json" 'any("button" in e["selector"] for e in v["overflow"]["examples"])')"
"$UI" "$FX/banner.html" --width 375 --json >"$tmp/bn.json"
expect "button under a text-only fixed banner" True "$(q "$tmp/bn.json" 'any(e.get("fixedBar") and "banner" in e["other"] for e in v["overlap"]["examples"])')"
for f in menu label rowlabel; do
  "$UI" "$FX/$f.html" --width 375 >/dev/null 2>&1; rc=$?
  expect "$f.html still reports"       1 "$rc"
done
"$UI" "$FX/chips.html" --width 375 --json >"$tmp/chips.json"; rc=$?
expect "scrollable chip row is clean"  0 "$rc"
# round 3: a small floating button is a bar too; a track on a GPU layer is not a carousel
"$UI" "$FX/fab.html" --width 375 --json >"$tmp/fab.json"
expect "footer link under a floating button" True "$(q "$tmp/fab.json" 'any(e.get("fixedBar") and "footer" in e["selector"] and "fab" in e["other"] for e in v["overlap"]["examples"])')"
"$UI" "$FX/tabsT.html" --width 375 --json >"$tmp/tt.json"
expect "tab cut in an unmoved track"   True "$(q "$tmp/tt.json" 'v["offscreen"]["count"] + v["clippedByAncestor"]["count"] >= 1')"
# controls: the same track moved by a script, or with a next button beside it, is a carousel
sed 's/translateX(0)/translateX(-50px)/' "$here/fixtures/ui-check/tabsT.html" >"$tmp/tmoved.html"
sed 's#</nav>#</nav><button aria-label="הבא">›</button>#' "$here/fixtures/ui-check/tabsT.html" >"$tmp/tarrow.html"
for f in tmoved tarrow; do
  "$UI" "file://$tmp/$f.html" --width 375 --json >"$tmp/$f.json"
  expect "$f track is a carousel"      0 "$(q "$tmp/$f.json" 'v["offscreen"]["count"] + v["clippedByAncestor"]["count"]')"
done
"$UI" "$FX/sticky.html" --width 375 >/dev/null 2>&1; rc=$?
expect "sticky bar mid-page is clean"  0 "$rc"

# --json escapes C1 controls and bidi overrides; the value survives a parse
printf '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>t</title><main><h1>x</h1></main><script>console.error("a\\x85b\\x9bc\\u202ed\\u2066e")</script></html>' >"$tmp/c1.html"
"$UI" "file://$tmp/c1.html" --width 375 --json >"$tmp/c1.json"
expect "json has no raw C1 or bidi"    True "$(python3 -c 'import re,sys; t=open(sys.argv[1],encoding="utf-8").read(); print(not re.search("[\x7f-\x9f‪-‮⁦-⁩]", t))' "$tmp/c1.json")"
expect "json keeps the escaped value"  True "$(q "$tmp/c1.json" 'v["console"]["messages"][0] == "a\x85b\x9bc‮d⁦e"')"
# a timeout keeps the viewports already done: 1440 finishes, 375 hangs
"$UI" "$FX/hangphone.html" --width 1440,375 --timeout 5 --json >"$tmp/hp.json" 2>/dev/null; rc=$?
expect "partial timeout exits 2"       2 "$rc"
expect "finished viewport kept, hung one marked" True "$(q "$tmp/hp.json" 'd["timedOut"] and "axe" in d["viewports"][0] and d["viewports"][1]["timedOut"] and d["viewports"][1]["width"] == 375')"
"$UI" "$FX/hangphone.html" --width 1440,375 --timeout 5 >"$tmp/hp.txt" 2>/dev/null
expect "summary shows both viewports"  True "$(grep -q '^1440 light .*clean' "$tmp/hp.txt" && grep -q '^375 light .*timed out' "$tmp/hp.txt" && grep -q 'exit 2' "$tmp/hp.txt" && echo True || echo False)"

# a page that never yields: exit 2 within the timeout, with a clear message
start=$SECONDS
"$UI" "$FX/hang.html" --width 375 --timeout 5 >/dev/null 2>"$tmp/hang.err"; rc=$?
expect "hung page exits 2"             2 "$rc"
expect "hung page says timed out"      1 "$(grep -c 'timed out after 5s' "$tmp/hang.err")"
expect "hung page stops in time"       True "$([ $((SECONDS - start)) -le 10 ] && echo True || echo False)"

# errors exit 2
"$UI" "file://$here/fixtures/ui-check/missing.html" >/dev/null 2>"$tmp/err"; rc=$?
expect "bad url exits 2"               2 "$rc"
expect "bad url says navigation"       1 "$(grep -c 'navigation failed' "$tmp/err")"
"$UI" >/dev/null 2>&1; rc=$?
expect "no url exits 2"                2 "$rc"
"$UI" "$FX/clean.html" --theme sepia >/dev/null 2>&1; rc=$?
expect "bad theme exits 2"             2 "$rc"
"$UI" "$FX/clean.html" --ignore '[[' >/dev/null 2>&1; rc=$?
expect "bad --ignore selector exits 2" 2 "$rc"

echo "ui-check: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
