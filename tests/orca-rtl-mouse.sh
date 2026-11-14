#!/usr/bin/env bash
# Test for the pointer part of the Orca RTL patch (lib/orca-rtl/rtl-mouse.js, put in by patch.mjs):
# in a terminal row that holds Hebrew, a drag, a double click, a link click and a click sent to
# the running program must land on the characters under the pointer.
#   tests/orca-rtl-mouse.sh
# It copies the installed Orca's renderer files to a temp dir (pristine: files this machine's
# patch changed come from the patch's own backup), patches the copy twice and drives a real mouse
# over Orca's own terminal code in headless Chromium:
#   1. row patch only (ORCA_RTL_NO_MOUSE=1): the Hebrew checks must FAIL, the English one hold;
#   2. the whole patch: every check must hold; and a second run changes nothing.
# Nothing under /opt/Orca or ~/.local/share/orca-rtl is written. Needs an installed Orca with the
# unpacked layout, passwordless sudo (patch.mjs installs through it, here into the temp dir) and
# Playwright with Chromium. Exit 2 = could not run.
set -u
here=$(cd "$(dirname "$0")" && pwd)
patch=$here/../lib/orca-rtl/patch.mjs
src=${ORCA_RTL_TEST_SRC:-/opt/Orca}/resources/app.asar.unpacked/out
[ -d "$src/renderer/assets" ] || { echo "orca-rtl-mouse: no unpacked Orca renderer at $src"; exit 2; }
ver=$(jq -r '.version // empty' "$src/package.json" 2>/dev/null)
t=$(mktemp -d) || exit 2
trap 'rm -rf -- "$t"' EXIT
out=$t/root/resources/app.asar.unpacked/out
mkdir -p "$out" "$t/data"
cp -r "$src/renderer" "$out/renderer"
cp "$src/package.json" "$out/package.json"
# Back to the files Orca shipped: the installed copy may already carry the patch.
bak=$HOME/.local/share/orca-rtl/backup-$ver/out/renderer
if [ -d "$bak" ]; then (cd "$bak" && find . -type f) | while read -r rel; do cp "$bak/$rel" "$out/renderer/$rel"; done; fi
if grep -lq '_rtl = true' "$out"/renderer/assets/*.js 2>/dev/null; then
  echo "orca-rtl-mouse: the installed Orca is patched and no backup of its original files exists ($bak)"; exit 2
fi

run_patch() { ORCA_RTL_ROOT=$t/root ORCA_RTL_DATA=$t/data node "$patch" >"$t/patch.log" 2>&1; }
fail=0
say() { echo "== $*"; }

say "1. row patch only: the checks must see the fault"
ORCA_RTL_NO_MOUSE=1 run_patch || { cat "$t/patch.log"; echo "FAIL: patch.mjs (row patch only)"; exit 1; }
asset=$(basename "$(grep -l '_rtl = true' "$out"/renderer/assets/*.js | head -1)")
[ -n "$asset" ] || { echo "FAIL: no patched terminal asset"; exit 1; }
node "$here/orca-rtl-mouse.cjs" "$out/renderer" "$asset" fault || fail=1

say "2. the whole patch: every check must hold"
run_patch || { cat "$t/patch.log"; echo "FAIL: patch.mjs"; exit 1; }
if grep -q 'WARNING: pointer mapping NOT applied' "$t/patch.log"; then cat "$t/patch.log"; echo "FAIL: the pointer hooks do not fit Orca $ver"; exit 1; fi
node "$here/orca-rtl-mouse.cjs" "$out/renderer" "$asset" pass || fail=1

say "3. a second run changes nothing"
sum=$(sha256sum "$out/renderer/assets/$asset")
run_patch || fail=1
grep -q 'nothing to change' "$t/patch.log" || { echo "FAIL: the second run wanted to write again"; fail=1; }
[ "$sum" = "$(sha256sum "$out/renderer/assets/$asset")" ] || { echo "FAIL: the second run changed the asset"; fail=1; }

[ "$fail" = 0 ] && echo "PASS orca-rtl-mouse (Orca $ver)" || echo "FAILED orca-rtl-mouse (Orca $ver)"
exit "$fail"
