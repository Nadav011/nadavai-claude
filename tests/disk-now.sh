#!/usr/bin/env bash
# Tests for bin/disk-now and bin/docker-tidy with fake gdu, docker, sudo and hostname on PATH and
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
# Fake gdu prints the "size path" lines of $DT_T/gdu.out, as `gdu -n --no-prefix --depth` does.
printf '#!/bin/sh\ncat "$DT_T/gdu.out"\n' >"$t/fakebin/gdu"
chmod +x "$t/fakebin/"*
export PATH=$t/fakebin:$PATH
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
grep -q "$r/tiny" "$m" && bad "entries under 100 MB are dropped" || ok "entries under 100 MB are dropped"
out=$("$dn" --local)
# Deepest at 5 GB: node_modules (6) and other (9); big (20) has a child over 5 GB, so it is not listed.
grep -q "node_modules" <<<"$out" && grep -q "Projects/other" <<<"$out" && ok "lists the deepest big folders" || bad "deepest: $out"
grep -qE "[0-9.]+  $r/Projects/big\$" <<<"$out" && bad "a folder with a big child is not listed" || ok "a folder with a big child is not listed"
grep -q "שינוי מאז" <<<"$out" && bad "no growth section without a previous map" || ok "no growth section without a previous map"

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
grep -qE '\+ .*/Projects/big$' <<<"$out" && bad "a parent whose child explains the growth is not listed" || ok "a parent whose child explains the growth is not listed"
out=$("$dn" --in "$r/Projects")
[ "$(wc -l <<<"$out")" = 3 ] && head -n1 <<<"$out" | grep -q '/Projects/big$' && ok "--in lists children, biggest first" || bad "--in: $out"

# A failed scan keeps the old map.
printf '#!/bin/sh\nexit 1\n' >"$t/fakebin/gdu"
before=$(md5sum <"$m")
"$dn" --scan 2>/dev/null && bad "a failed scan exits non-zero" || ok "a failed scan exits non-zero"
[ "$(md5sum <"$m")" = "$before" ] && ok "a failed scan keeps the old map" || bad "the map changed after a failed scan"

# docker-tidy: fake docker. Images (repo, tag, id, created); c1 uses pg:3 (the oldest).
cat >"$t/fakebin/docker" <<'EOF'
#!/bin/sh
case "$1" in
  info) exit 0 ;;
  ps) echo c1 ;;
  inspect) echo sha256:pg3 ;;
  images) printf 'pw\tv4\tsha256:pw4\t2026-11-01 10:00:00 +0200 IST\npw\tv3\tsha256:pw3\t2026-10-01 10:00:00 +0200 IST\npw\tv2\tsha256:pw2\t2026-09-01 10:00:00 +0200 IST\npw\tv1\tsha256:pw1\t2026-08-01 10:00:00 +0200 IST\npg\t5\tsha256:pg5\t2026-11-01 10:00:00 +0200 IST\npg\t4\tsha256:pg4\t2026-10-01 10:00:00 +0200 IST\npg\t3\tsha256:pg3\t2026-09-01 10:00:00 +0200 IST\nredis\ta\tsha256:r1\t2026-11-01 10:00:00 +0200 IST\nredis\tb\tsha256:r1\t2026-11-01 10:00:00 +0200 IST\nredis\tc\tsha256:r0\t2026-10-01 10:00:00 +0200 IST\n<none>\t<none>\tsha256:x\t2026-01-01 10:00:00 +0200 IST\n' ;;
  image) if [ "$2" = inspect ]; then echo 1000000000; else echo "$*" >>"$DT_T/other.log"; fi ;;
  rmi) echo "$2" >>"$DT_T/rmi.log" ;;
  volume) echo "volume $*" >>"$DT_T/volume.log" ;;
  *) echo "$*" >>"$DT_T/other.log" ;;
esac
EOF
chmod +x "$t/fakebin/docker"
out=$("$dt")
[ ! -e "$t/rmi.log" ] && ok "dry run removes nothing" || bad "dry run called rmi"
grep -q 'would remove pw:v2' <<<"$out" && grep -q 'would remove pw:v1' <<<"$out" && ok "older than the two newest goes" || bad "pw: $out"
grep -q 'pw:v3\|pw:v4' <<<"$out" && bad "the two newest stay" || ok "the two newest stay"
grep -q 'pg:3' <<<"$out" && bad "an image a container uses stays" || ok "an image a container uses stays"
grep -q 'redis' <<<"$out" && bad "two tags of one image count once" || ok "two tags of one image count once"
"$dt" --apply >/dev/null
[ "$(sort "$t/rmi.log" | tr '\n' ' ')" = "pw:v1 pw:v2 " ] && ok "--apply removes exactly the superseded tags" || bad "rmi: $(cat "$t/rmi.log")"
[ ! -e "$t/volume.log" ] && ok "volumes are never touched" || bad "volume called"
grep -qx 'image prune -f' "$t/other.log" && grep -qx 'builder prune -f --filter until=168h' "$t/other.log" && ok "--apply prunes dangling images and old build cache" || bad "prune calls: $(cat "$t/other.log" 2>/dev/null)"
exit $fail
