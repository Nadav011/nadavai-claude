#!/usr/bin/env bash
# test-ui-check.sh: runs bin/ui-check against two local fixtures over file:// and checks that every
# check fires on bad.html, that clean.html (with a scrolling carousel) is clean, and the exit codes.
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
