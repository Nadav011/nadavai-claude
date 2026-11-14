#!/usr/bin/env bash
# Tests for bin/disk-now and bin/docker-tidy with fake du, docker, sudo and hostname on PATH and
# HOME in a temp dir, so no real disk scan, image or other machine is touched.
#   tests/disk-now.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
dn=$here/../bin/disk-now dt=$here/../bin/docker-tidy
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
export HOME=$t/home DT_T=$t
mkdir -p "$HOME" "$t/fakebin"
G=1073741824
printf '#!/bin/sh\necho testhost\n' >"$t/fakebin/hostname"
printf '#!/bin/sh\nexit 1\n' >"$t/fakebin/sudo"
# Fake du prints the "size<TAB>path" lines of $DT_T/gdu.out (spaces turned into a tab, as
# `du -B1` prints them) and exits with $DT_T/du.rc (default 0).
cat >"$t/fakebin/du" <<'EOF'
#!/bin/sh
echo "start $$" >>"$DT_T/du.order"
[ -n "$DT_SLOW" ] && sleep "$DT_SLOW"
echo "$*" >"$DT_T/du.args"
tac "$DT_T/gdu.out" | sed -E 's/^ *([0-9]+) +/\1\t/'
echo "end $$" >>"$DT_T/du.order"
exit "$(cat "$DT_T/du.rc" 2>/dev/null || echo 0)"
EOF
chmod +x "$t/fakebin/"*
export PATH=$t/fakebin:$PATH DISK_NOW_DU=$t/fakebin/du DISK_NOW_NO_SLOT=1
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

r=$HOME
cat >"$t/gdu.out" <<EOF
 $((40 * G)) $r
 $((30 * G)) $r/Projects
 $((20 * G)) $r/Projects/big
 $((6 * G)) $r/Projects/big/node_modules
 $((9 * G)) $r/Projects/other
 $((5 * 1048576)) $r/tiny
EOF
"$dn" --scan || bad "first scan exits 0"
m=$HOME/.cache/disk-map/testhost.tsv
grep -q "^# scanned .* root $r " "$m" && ok "map header names the root" || bad "map header: $(head -n1 "$m")"
grep -qE -- "-x -a -B1 -t 100M -d 8 $r\$" "$t/du.args" && ok "du keeps one filesystem, files and folders of 100 MB, depth 8" || bad "du args: $(cat "$t/du.args")"
out=$("$dn" --local)
# Deepest at 5 GB: node_modules (6) and other (9); big (20) has a child over 5 GB, so it is not listed.
grep -q "node_modules" <<<"$out" && grep -q "Projects/other" <<<"$out" && ok "lists the deepest big folders" || bad "deepest: $out"
grep -qE "  $r/Projects\$|  $r/Projects \(" <<<"$out" && bad "a folder its big children explain is not listed" || ok "a folder its big children explain is not listed"
grep -q "שינוי מאז" <<<"$out" && bad "no growth section without a previous map" || ok "no growth section without a previous map"
# Projects (30) minus its big children big (20) and other (9) leaves 1 GB: not listed at 5 GB.
# big (20) minus node_modules (6) leaves 14 GB of smaller folders: listed as the rest of big.
grep -qE '14\.0  .*/Projects/big \(שאר התיקייה\)$' <<<"$out" && ok "a folder full of small ones shows as its rest" || bad "rest: $out"
grep -qE '10\.0  .*/home \(שאר התיקייה\)$' <<<"$out" && ok "the root's own rest shows too" || bad "root rest: $out"

# Second scan: node_modules grew by 3 GB, other shrank by 4 GB, a new 2 GB folder appeared.
cat >"$t/gdu.out" <<EOF
 $((41 * G)) $r
 $((31 * G)) $r/Projects
 $((23 * G)) $r/Projects/big
 $((9 * G)) $r/Projects/big/node_modules
 $((5 * G)) $r/Projects/other
 $((2 * G)) $r/Projects/new
EOF
"$dn" --scan || bad "second scan exits 0"
[ -s "$HOME/.cache/disk-map/testhost.prev.tsv" ] && ok "the old map is kept as prev" || bad "no prev map"
out=$("$dn" --local)
grep -qE '3\.0\+ .*/Projects/big/node_modules$' <<<"$out" && ok "growth names the folder that grew" || bad "growth: $out"
grep -qE '4\.0- .*/Projects/other$' <<<"$out" && ok "shrink is shown with a minus" || bad "shrink: $out"
grep -qE '2\.0\+ .*/Projects/new$' <<<"$out" && ok "a new folder counts as growth" || bad "new: $out"
grep -qE '\+ .*/Projects/big( |$)' <<<"$out" && bad "a parent whose child explains the growth is not listed" || ok "a parent whose child explains the growth is not listed"
out=$("$dn" --in "$r/Projects")
[ "$(wc -l <<<"$out")" = 3 ] && head -n1 <<<"$out" | grep -q '/Projects/big$' && ok "--in lists children, biggest first" || bad "--in: $out"

# A parent that grew mostly in small children still shows its growth.
cp "$t/gdu.out" "$t/gdu.keep"
sed -i -E "s|^ *[0-9]+ $r/Projects\$| $((51 * G)) $r/Projects|; s|^ *[0-9]+ $r\$| $((61 * G)) $r|" "$t/gdu.out"
"$dn" --scan && out=$("$dn" --local)
grep -qE '20\.0\+ .*/Projects$' <<<"$out" && ok "growth in many small children shows on the parent" || bad "parent growth: $out"
grep -qE '\+ .*/home$' <<<"$out" && bad "the root's growth is explained by Projects" || ok "the root's growth is explained by Projects"

# du exit 1 (a vanished file) still makes a map; a partial run that was killed keeps the old one.
cp "$t/gdu.keep" "$t/gdu.out"; echo 1 >"$t/du.rc"
"$dn" --scan && ok "du exit 1 still writes the map" || bad "du exit 1 failed the scan"
before=$(md5sum <"$m"); echo 143 >"$t/du.rc"; head -n2 "$t/gdu.keep" >"$t/gdu.out"
"$dn" --scan 2>/dev/null && bad "a killed scan exits non-zero" || ok "a killed scan exits non-zero"
[ "$(md5sum <"$m")" = "$before" ] && ok "a killed scan with partial output keeps the old map" || bad "the map changed after a killed scan"
ls -A "$HOME/.cache/disk-map" | grep -q '^\.scan\.' && bad "no temp file is left behind" || ok "no temp file is left behind"

# Two scans at once: the second waits for the lock, and the map is whole afterwards.
cp "$t/gdu.keep" "$t/gdu.out"; echo 0 >"$t/du.rc"
rm -f "$t/du.order"
DT_SLOW=1 "$dn" --scan & p1=$!
sleep 0.3; "$dn" --scan; wait "$p1"
[ "$(awk '{ print $1 }' "$t/du.order" | tr '\n' ' ')" = "start end start end " ] && ok "a second scan waits for the first" || bad "du order: $(cat "$t/du.order")"
[ "$(grep -vc '^#' "$m")" = "$(grep -c '' "$t/gdu.keep")" ] && [ "$(grep -c '^#' "$m")" = 1 ] && ok "two scans at once leave one whole map" || bad "map after two scans: $(cat "$m")"

# A cut-off map (du exit 1 on a full disk, the root line missing) keeps the old map.
before=$(md5sum <"$m"); echo 1 >"$t/du.rc"; tail -n +3 "$t/gdu.keep" >"$t/gdu.out"
"$dn" --scan 2>/dev/null && bad "a cut-off map exits non-zero" || ok "a cut-off map exits non-zero"
[ "$(md5sum <"$m")" = "$before" ] && ok "a cut-off map keeps the old one" || bad "a cut-off map replaced the old one"
echo 0 >"$t/du.rc"; cp "$t/gdu.keep" "$t/gdu.out"

# A scan of a smaller root (sudo stopped working) does not replace a map of /.
sed -i "1s|root [^ ]* |root / |" "$m"; before=$(md5sum <"$m")
"$dn" --scan 2>/dev/null && bad "a scan of another root exits non-zero" || ok "a scan of another root exits non-zero"
[ "$(md5sum <"$m")" = "$before" ] && ok "a scan of another root keeps the map of /" || bad "the map of / was replaced"
sed -i "1s|root / |root $r |" "$m"

# --in takes a relative path.
out=$(cd "$r" && "$dn" --in Projects)
grep -q '/Projects/big$' <<<"$out" && ok "--in resolves a relative path" || bad "--in relative: $out"

# A change two levels down counts against the nearest changed ancestor.
"$dn" --scan
sed -i -E "s|^ *[0-9]+ $r/Projects/big/node_modules\$| $((14 * G)) $r/Projects/big/node_modules|; s|^ *[0-9]+ $r/Projects/big\$| $((25 * G)) $r/Projects/big|; s|^ *[0-9]+ $r/Projects\$| $((35 * G)) $r/Projects|; s|^ *[0-9]+ $r\$| $((45 * G)) $r|" "$t/gdu.out"
sed -i -E "s|^ *[0-9]+ $r/Projects/big\$| $((23 * G + G / 2)) $r/Projects/big|" "$t/gdu.out"
"$dn" --scan && out=$("$dn" --local)
grep -qE '5\.0\+ .*/node_modules$' <<<"$out" && ! grep -qE '\+ .*/Projects( |$)' <<<"$out" && ok "a change below a small change counts once" || bad "nested growth: $out"

# docker-tidy: fake docker. Images (repo, tag, id, created); c1 uses pg:3 (the oldest).
cat >"$t/fakebin/docker" <<'EOF'
#!/bin/sh
case "$1" in
  info) exit 0 ;;
  ps) echo c1 ;;
  inspect) echo sha256:pg3 ;;
  images) printf 'pw\tv4\tsha256:pw4\t2026-11-01 10:00:00 +0200 IST\npw\tv3\tsha256:pw3\t2026-10-01 10:00:00 +0200 IST\npw\tv2\tsha256:pw2\t2026-09-01 10:00:00 +0200 IST\npw\tv1\tsha256:pw1\t2026-08-01 10:00:00 +0200 IST\npr\tv14.14\tsha256:pr14\t2026-08-01 10:00:00 +0200 IST\npr\tv14.5\tsha256:pr5\t2026-08-01 10:00:00 +0200 IST\npr\tv15.0\tsha256:pr15\t2026-08-01 10:00:00 +0200 IST\npg\t5\tsha256:pg5\t2026-11-01 10:00:00 +0200 IST\npg\t4\tsha256:pg4\t2026-10-01 10:00:00 +0200 IST\npg\t3\tsha256:pg3\t2026-09-01 10:00:00 +0200 IST\nredis\ta\tsha256:r1\t2026-11-01 10:00:00 +0200 IST\nredis\tb\tsha256:r1\t2026-11-01 10:00:00 +0200 IST\nredis\tc\tsha256:r0\t2026-10-01 10:00:00 +0200 IST\n<none>\t<none>\tsha256:x\t2026-01-01 10:00:00 +0200 IST\n' ;;
  image) if [ "$2" = inspect ]; then echo 1000000000; else echo "$*" >>"$DT_T/other.log"; fi ;;
  rmi) echo "$2" >>"$DT_T/rmi.log" ;;
  volume) echo "volume $*" >>"$DT_T/volume.log" ;;
  *) echo "$*" >>"$DT_T/other.log" ;;
esac
EOF
chmod +x "$t/fakebin/docker"
mkdir -p "$t/proj/app/supabase/.temp"; printf 'v2' >"$t/proj/app/supabase/.temp/playwright-version"
export DOCKER_TIDY_ROOTS=$t/proj
out=$("$dt")
[ ! -e "$t/rmi.log" ] && ok "dry run removes nothing" || bad "dry run called rmi"
grep -q 'would remove pw:v1' <<<"$out" && ok "older than the two newest goes" || bad "pw: $out"
grep -q 'pw:v2' <<<"$out" && bad "a tag a project pins stays" || ok "a tag a project pins stays"
grep -q 'pw:v3\|pw:v4' <<<"$out" && bad "the two newest stay" || ok "the two newest stay"
grep -q 'would remove pr:v14.5' <<<"$out" && ! grep -q 'pr:v15.0\|pr:v14.14' <<<"$out" && ok "same creation time: the newest versions stay" || bad "tie: $out"
grep -q 'pg:3' <<<"$out" && bad "an image a container uses stays" || ok "an image a container uses stays"
grep -q 'redis' <<<"$out" && bad "two tags of one image count once" || ok "two tags of one image count once"
"$dt" --apply >/dev/null
[ "$(sort "$t/rmi.log" | tr '\n' ' ')" = "pr:v14.5 pw:v1 " ] && ok "--apply removes exactly the superseded tags" || bad "rmi: $(cat "$t/rmi.log")"
[ ! -e "$t/volume.log" ] && ok "volumes are never touched" || bad "volume called"
grep -qx 'image prune -f' "$t/other.log" && grep -qx 'builder prune -f --filter until=168h' "$t/other.log" && ok "--apply prunes dangling images and old build cache" || bad "prune calls: $(cat "$t/other.log" 2>/dev/null)"
exit $fail
