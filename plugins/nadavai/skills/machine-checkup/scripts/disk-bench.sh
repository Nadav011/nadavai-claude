#!/bin/bash
# One A/B window for disk tuning: two buffered 1M sequential writers + a 16k random writer that fsyncs
# every 32 writes (agents, installs, logs) while fsync-probe.py does a 4 KB append+fsync every 50 ms
# (an app like Orca saving state). Prints probe latency percentiles and writer throughput, and
# appends the line to <parent>/results.txt. Needs fio and ~5 GB free on the tested filesystem.
# usage: disk-bench.sh <label> [seconds=45] [parent dir=~/disk-bench]
set -uo pipefail
lab=$1; T=${2:-45}; P=${3:-$HOME/disk-bench}; here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$P"; D=$(mktemp -d "$P/run.XXXXXX")   # every file this run writes lives here and only here
free=$(df -Pk "$D" | awk 'NR==2{print $4}'); [ "$free" -gt $((5 * 1024 * 1024)) ] || { echo "need 5 GB free in $D" >&2; rmdir "$D"; exit 2; }
dev=$(lsblk -no PKNAME "$(findmnt -no SOURCE -T "$D")" 2>/dev/null | head -1); q=/sys/block/${dev:-nvme0n1}/queue
fio --name=bulk --directory="$D" --rw=write --bs=1M --size=2G --time_based --runtime="$T" --ioengine=psync --direct=0 --numjobs=2 --end_fsync=1 --output-format=terse --terse-version=3 > "$D/fio.out" 2>&1 & f1=$!
fio --name=small --directory="$D" --rw=randwrite --bs=16k --size=256M --time_based --runtime="$T" --ioengine=psync --direct=0 --fsync=32 --output-format=terse --terse-version=3 > "$D/fio2.out" 2>&1 & f2=$!
sleep 3; p=$(python3 -I "$here/fsync-probe.py" "$D/probe.dat" $((T - 5))); pr=$?
wait $f1; r1=$?; wait $f2; r2=$?
if [ $pr -ne 0 ] || [ $r1 -ne 0 ] || [ $r2 -ne 0 ]; then find "$D" -maxdepth 1 -type f \( -name "bulk.*" -o -name "small.*" \) -delete; echo "$lab | FAILED probe=$pr fio=$r1/$r2 (fio logs in $D)" | tee -a "$P/results.txt"; exit 1; fi
bw=$(awk -F';' '{s+=$48} END{printf "%.0f", s/1024}' "$D/fio.out"); bw2=$(awk -F';' '{printf "%.1f", $48/1024}' "$D/fio2.out")
echo "$lab | ${dev:-?} $(grep -o '\[.*\]' $q/scheduler) nr=$(cat $q/nr_requests) wbt=$(cat $q/wbt_lat_usec) | $p | bulk ${bw}MB/s small ${bw2}MB/s" | tee -a "$P/results.txt"
find "$D" -mindepth 1 -maxdepth 1 -type f \( -name 'bulk.*' -o -name 'small.*' -o -name 'fio*.out' \) -delete; rmdir "$D"
