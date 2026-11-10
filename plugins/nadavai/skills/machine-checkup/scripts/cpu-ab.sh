#!/bin/bash
# Is a CPU tuning value worth keeping? Runs the same work under each configuration, in
# interleaved rounds (A B C, then C B A, ...), while the machine does whatever it is doing, and
# prints per configuration: single-thread work, 8-process work, thermal throttle events, hottest
# package temperature and average package power. A value stays only when it wins by more than
# the spread between its own rounds.
#
#   cpu-ab.sh <rounds> <reset command> <name>=<apply command> [<name>=<apply command> ...]
#
# Each apply command sets the whole configuration (it runs right after the reset command), as
# root through `sudo bash -c`. The reset command also runs at the end and on any exit, so a
# stopped run leaves the machine as it was. Example, a clock cap against none:
#   cpu-ab.sh 3 'for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; do cat ${f%scaling_max_freq}cpuinfo_max_freq >$f; done' \
#     base=true cap48='for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; do echo 4800000 >$f; done'
# About 25 s per configuration per round. Run it through `heavy-slot --`.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
rounds=${1:?rounds}; reset=${2:?reset command}; shift 2
[ $# -ge 2 ] || { echo "give at least two name=command configurations" >&2; exit 64; }
names=() cmds=()
for a in "$@"; do names+=("${a%%=*}"); cmds+=("${a#*=}"); done
out=$(mktemp -d)
trap 'sudo bash -c "$reset"; rm -rf -- "${out:?}"' EXIT
trap 'exit 130' INT TERM

throttle() { cat /sys/devices/system/cpu/cpu*/thermal_throttle/core_throttle_count 2>/dev/null | awk '{ s += $1 } END { print s + 0 }'; }
energy() { sudo cat /sys/class/powercap/intel-rapl:0/energy_uj 2>/dev/null || echo 0; }
pkg_temp() { for h in /sys/class/hwmon/hwmon*; do [ "$(cat "$h/name" 2>/dev/null)" = coretemp ] && { cat "$h/temp1_input"; return; }; done; echo 0; }

one() { # $1 config index, $2 round
  local i=$1 r=$2 t0 e0 s0 single multi t1 e1 s1 hot=0 t p
  sudo bash -c "$reset" && sudo bash -c "${cmds[$i]}" || { echo "apply failed: ${names[$i]}" >&2; exit 1; }
  sleep 4
  : >"$out/temps"
  ( while :; do pkg_temp >>"$out/temps"; sleep 1; done ) & p=$!
  t0=$(throttle) e0=$(energy) s0=$(date +%s)
  single=$(node "$here/cpu-ab-work.mjs" 8)
  multi=0
  for _ in 1 2 3 4 5 6 7 8; do node "$here/cpu-ab-work.mjs" 10 >>"$out/multi.$i.$r" & done
  wait $(jobs -p | grep -v "^$p$") 2>/dev/null
  multi=$(awk '{ s += $1 } END { print s + 0 }' "$out/multi.$i.$r")
  t1=$(throttle) e1=$(energy) s1=$(date +%s)
  kill "$p" 2>/dev/null; wait "$p" 2>/dev/null
  hot=$(sort -n "$out/temps" | tail -1); hot=$((hot / 1000))
  [ "$e1" -lt "$e0" ] && e1=$e0
  echo "$single $multi $((t1 - t0)) $hot $(((e1 - e0) / 1000000 / (s1 - s0)))" >>"$out/res.$i"
  printf 'round %s %-10s single %5s  multi %6s  throttle %6s  max %3s C  %3s W\n' "$r" "${names[$i]}" "$single" "$multi" "$((t1 - t0))" "$hot" "$(((e1 - e0) / 1000000 / (s1 - s0)))"
}

n=${#names[@]}
for ((r = 1; r <= rounds; r++)); do
  if ((r % 2)); then for ((i = 0; i < n; i++)); do one "$i" "$r"; done
  else for ((i = n - 1; i >= 0; i--)); do one "$i" "$r"; done; fi
done
echo
printf '%-10s %-22s %-24s %-12s %-8s %s\n' config "single (min-med-max)" "multi (min-med-max)" "throttle/run" "max C" "avg W"
for ((i = 0; i < n; i++)); do
  col() { awk -v c="$1" '{ print $c }' "$out/res.$i" | sort -n | awk '{ a[NR] = $1 } END { printf "%s-%s-%s", a[1], a[int((NR + 1) / 2)], a[NR] }'; }
  med() { awk -v c="$1" '{ print $c }' "$out/res.$i" | sort -n | awk '{ a[NR] = $1 } END { print a[int((NR + 1) / 2)] }'; }
  printf '%-10s %-22s %-24s %-12s %-8s %s\n' "${names[$i]}" "$(col 1)" "$(col 2)" "$(med 3)" "$(awk '{ print $4 }' "$out/res.$i" | sort -n | tail -1)" "$(med 5)"
done
