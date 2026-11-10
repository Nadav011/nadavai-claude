#!/bin/bash
# Is a CPU tuning value worth keeping? Runs the same work under each configuration, in
# interleaved rounds (A B C, then C B A, ...), while the machine does whatever it is doing, and
# prints per configuration: single-thread work, 8-process work, the whole machine's work
# (average MHz x instructions per cycle over every CPU, from turbostat: on a busy machine this
# is steadier than the script's own share), thermal throttle events, hottest package temperature
# and average package power. A value stays only when it wins by more than the spread between
# its own rounds.
#
#   cpu-ab.sh [--pause '<unit> ...'] <rounds> <reset command> <name>=<apply command> [<name>=<apply command> ...]
#
# Each apply command sets the whole configuration (it runs right after the reset command), as
# root through `sudo bash -c`. The reset command also runs at the end and on any exit, so a
# stopped run leaves the machine as it was.
# --pause names the systemd units that write the tested value back while the run goes on; they
# are stopped for the run and started again at its end. Without it the numbers compare nothing:
# on the LENOVO legion-power-limits.timer restores the power limits every 15 s, and on the MSI
# cpu-maxfreq.timer and msi-power-limits.timer restore the clock cap and the limits every minute.
# Example, the LENOVO's sustained limit, 110 W against 100 W:
#   M=/sys/class/powercap/intel-rapl-mmio:0
#   cpu-ab.sh --pause legion-power-limits.timer 5 "echo 110000000 >$M/constraint_0_power_limit_uw" \
#     base=true p100="echo 100000000 >$M/constraint_0_power_limit_uw"
# About 25 s per configuration per round. Run it through `heavy-slot --`.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pause=()
if [ "${1:-}" = --pause ]; then read -r -a pause <<<"${2:?units}"; shift 2; fi
rounds=${1:?rounds}; reset=${2:?reset command}; shift 2
[ $# -ge 2 ] || { echo "give at least two name=command configurations" >&2; exit 64; }
names=() cmds=()
for a in "$@"; do names+=("${a%%=*}"); cmds+=("${a#*=}"); done
out=$(mktemp -d)
finish() { # stop what this script started, put the machine back, then remove the scratch files
  local j; j=$(jobs -p)
  # shellcheck disable=SC2086  # a list of pids
  [ -n "$j" ] && kill $j 2>/dev/null
  sudo bash -c "$reset"
  [ ${#pause[@]} -gt 0 ] && sudo systemctl start "${pause[@]}"
  rm -rf -- "${out:?}"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[ ${#pause[@]} -gt 0 ] && { sudo systemctl stop "${pause[@]}" || exit 1; }

throttle() { cat /sys/devices/system/cpu/cpu*/thermal_throttle/core_throttle_count 2>/dev/null | awk '{ s += $1 } END { print s + 0 }'; }
pkg_temp() { for h in /sys/class/hwmon/hwmon*; do [ "$(cat "$h/name" 2>/dev/null)" = coretemp ] && { cat "$h/temp1_input"; return; }; done; echo 0; }

one() { # $1 config index, $2 round
  local i=$1 r=$2 t0 single multi t1 hot p ts mhz ipc watt work
  sudo bash -c "$reset" && sudo bash -c "${cmds[$i]}" || { echo "apply failed: ${names[$i]}" >&2; exit 1; }
  sleep 4
  : >"$out/temps"
  ( while :; do pkg_temp >>"$out/temps"; sleep 1; done ) & p=$!
  sudo turbostat --quiet --Summary --show Avg_MHz,IPC,PkgWatt -i 18 -n 1 >"$out/ts" 2>/dev/null & ts=$!
  t0=$(throttle)
  single=$(node "$here/cpu-ab-work.mjs" 8)
  : >"$out/multi"
  for _ in 1 2 3 4 5 6 7 8; do node "$here/cpu-ab-work.mjs" 10 >>"$out/multi" & done
  wait $(jobs -p | grep -vx -e "$p" -e "$ts") 2>/dev/null
  multi=$(awk '{ s += $1 } END { print s + 0 }' "$out/multi")
  t1=$(throttle)
  wait "$ts" 2>/dev/null
  kill "$p" 2>/dev/null; wait "$p" 2>/dev/null
  hot=$(sort -n "$out/temps" | tail -1); hot=$((hot / 1000))
  read -r mhz ipc watt < <(awk 'NR == 2 { print $1, $2, $3 }' "$out/ts")
  work=$(awk -v m="${mhz:-0}" -v c="${ipc:-0}" 'BEGIN { printf "%d", m * c }')
  echo "$single $multi $((t1 - t0)) $hot ${watt%.*} $work" >>"$out/res.$i"
  printf 'round %s %-10s single %5s  multi %6s  machine %5s  throttle %6s  max %3s C  %3s W\n' "$r" "${names[$i]}" "$single" "$multi" "$work" "$((t1 - t0))" "$hot" "${watt%.*}"
}

n=${#names[@]}
for ((r = 1; r <= rounds; r++)); do
  if ((r % 2)); then for ((i = 0; i < n; i++)); do one "$i" "$r"; done
  else for ((i = n - 1; i >= 0; i--)); do one "$i" "$r"; done; fi
done
echo
printf '%-10s %-20s %-22s %-20s %-13s %-6s %s\n' config "single min-med-max" "multi min-med-max" "machine min-med-max" throttle/run "max C" "avg W"
for ((i = 0; i < n; i++)); do
  col() { awk -v c="$1" '{ print $c }' "$out/res.$i" | sort -n | awk '{ a[NR] = $1 } END { printf "%s-%s-%s", a[1], a[int((NR + 1) / 2)], a[NR] }'; }
  med() { awk -v c="$1" '{ print $c }' "$out/res.$i" | sort -n | awk '{ a[NR] = $1 } END { print a[int((NR + 1) / 2)] }'; }
  printf '%-10s %-20s %-22s %-20s %-13s %-6s %s\n' "${names[$i]}" "$(col 1)" "$(col 2)" "$(col 6)" "$(med 3)" "$(awk '{ print $4 }' "$out/res.$i" | sort -n | tail -1)" "$(med 5)"
done
