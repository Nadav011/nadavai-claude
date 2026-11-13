#!/usr/bin/env bash
# One lock for the single x86sim iPhone on this machine, visible to every agent.
#   x86sim-lock.sh take <agent pid> <session name>   exit 0: the lock is yours; 1: a live session holds it (printed)
#   x86sim-lock.sh show                              print the holder; exit 1 when the lock is free
#   x86sim-lock.sh release <agent pid>               release it, only if it is yours
# <agent pid> is the long-lived agent process (in Claude Code: $PPID of the tool's shell), so that
# another session can tell a dead holder from a live one. X86SIM_LOCK overrides the path (tests).
set -euo pipefail
L="${X86SIM_LOCK:-$HOME/.cache/nadavai/x86sim.lock}"

owner() { cat "$L/owner" 2>/dev/null || true; }
write_owner() { printf '%s %s %s\n' "$1" "$2" "$(date -Is)" > "$L/owner"; }
alive() { [[ -n ${1:-} ]] && kill -0 "$1" 2>/dev/null; }

case "${1:-}" in
  take)
    pid=${2:?agent pid}
    name=${3:?session name}
    alive "$pid" || { echo "x86sim-lock: $pid is not a live process" >&2; exit 2; }
    mkdir -p "$(dirname "$L")"
    if mkdir "$L" 2>/dev/null; then
      write_owner "$pid" "$name"
      echo "taken"
      exit 0
    fi
    # Held. A new holder writes its owner file a moment after the directory appears.
    for _ in 1 2 3 4 5; do
      [[ -s $L/owner ]] && break
      sleep 1
    done
    read -r held_pid held_name held_since < <(owner) || true
    if [[ -z ${held_pid:-} ]]; then
      echo "held, and the holder has not written its owner file yet; try again"
      exit 1
    fi
    if [[ $held_pid == "$pid" ]]; then
      echo "already yours"
      exit 0
    fi
    if alive "$held_pid"; then
      echo "held by $held_name (pid $held_pid) since $held_since"
      exit 1
    fi
    # The holder is dead. The lock directory stays in place; whoever creates `takeover` inside it
    # decides alone, re-reads the owner there, and rewrites it. So two sessions cannot both win.
    if mkdir "$L/takeover" 2>/dev/null; then
      read -r held_pid held_name held_since < <(owner) || true
      if alive "${held_pid:-}"; then
        rmdir "$L/takeover"
        echo "held by $held_name (pid $held_pid) since $held_since"
        exit 1
      fi
      write_owner "$pid" "$name"
      rmdir "$L/takeover"
      echo "taken over from a dead session (${held_name:-unknown})"
      exit 0
    fi
    echo "another session is taking the lock over; try again"
    exit 1
    ;;
  show)
    if [[ ! -d $L ]]; then
      echo "free"
      exit 1
    fi
    o=$(owner)
    echo "${o:-held, owner file not written yet}"
    ;;
  release)
    pid=${2:?agent pid}
    read -r held_pid _ < <(owner) || true
    if [[ ${held_pid:-} != "$pid" ]]; then
      echo "x86sim-lock: not yours (holder: $(owner))" >&2
      exit 1
    fi
    rm -f "${L:?}/owner"
    rmdir "$L"
    echo "released"
    ;;
  *)
    sed -n '2,5p' "$0"
    exit 2
    ;;
esac
