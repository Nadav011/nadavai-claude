#!/usr/bin/env bash
# lab-emulator.sh: an Android lab emulator on the MSI (its usual place) or on this machine, always
# seen from this machine as emulator-<port>, so agent-device, adb and the lab scripts work unchanged.
#
#   lab-emulator.sh where     --avd NAME                          measure both machines, print the choice
#   lab-emulator.sh start     --avd NAME --port N [--on auto|msi|here] [--locale he-IL]
#   lab-emulator.sh status    --port N                            exit 0 only when adb sees the device
#   lab-emulator.sh reconnect --port N                            reopen a tunnel that died
#   lab-emulator.sh stop      --port N                            only for a port you started
#   lab-emulator.sh emu       --port N -- <console command...>    e.g. -- sms send 0501234567 "text"
#
# The port and the AVD are yours: there is no default, so a command never lands on another
# session's emulator by omission. On the other machine the emulator runs as the systemd user unit
# lab-emulator-<port>, at low CPU and IO weight and for at most four hours, because that machine
# also runs CI. Its console and adb ports reach this machine through one ssh tunnel whose control
# socket is this script's handle on it. Nothing is ever selected by matching command-line text.
# The emulator console's auth token differs per machine, so console commands ("adb emu ...") go
# through "lab-emulator.sh emu", which runs them on the machine that holds the emulator.
set -uo pipefail
REMOTE="${LAB_EMULATOR_REMOTE:-msi}"   # the machine that usually holds the emulator
AVD=""; PORT=""; ON=auto; LOCALE=""
CMD="${1:-}"; [ $# -gt 0 ] && shift
EMU_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --avd) AVD="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --on) ON="${2:-}"; shift 2 ;;
    --locale) LOCALE="${2:-}"; shift 2 ;;
    --) shift; EMU_ARGS=("$@"); break ;;
    *) echo "unknown argument: $1"; exit 2 ;;
  esac
done
usage() { sed -n '2,11p' "$0"; exit 2; }
case "$CMD" in
  where) [ -n "$AVD" ] || { echo "where needs --avd"; exit 2; }; PORT="${PORT:-5554}" ;;
  start) { [ -n "$AVD" ] && [ -n "$PORT" ]; } || { echo "start needs --avd and --port (your own; see 'adb devices' for ports in use)"; exit 2; } ;;
  status|reconnect|stop|emu) [ -n "$PORT" ] || { echo "$CMD needs --port"; exit 2; } ;;
  *) usage ;;
esac
[[ "$AVD" =~ ^[A-Za-z0-9._-]*$ ]] || { echo "bad AVD name"; exit 2; }
{ [[ "$PORT" =~ ^55[0-9][02468]$ ]] && [ "$PORT" -ge 5554 ] && [ "$PORT" -le 5584 ]; } || { echo "the port must be even, 5554..5584"; exit 2; }
[[ "$LOCALE" =~ ^([a-z]{2}-[A-Z]{2})?$ ]] || { echo "bad locale"; exit 2; }
case "$ON" in auto|msi|here) ;; *) echo "--on takes auto, msi or here"; exit 2 ;; esac
SERIAL="emulator-$PORT"
STATE_DIR="$HOME/.local/state/mobile-lab"; mkdir -p "$STATE_DIR"
STATE="$STATE_DIR/emulator-$PORT.state"; SOCK="$STATE_DIR/tunnel-$PORT.sock"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 -o ConnectionAttempts=3)
# One command at a time per port on this machine.
if [ "$CMD" != where ]; then
  exec 9>"$STATE_DIR/emulator-$PORT.lock"
  flock -w 5 9 || { echo "another lab-emulator command is running for port $PORT"; exit 1; }
fi

# The lock is fd 9. A process that outlives this script must not inherit it: adb can start its
# server, which would then hold the lock for as long as it lives. Every adb call goes through here.
adb() { command adb "$@" 9>&-; }
tadb() { local t="$1"; shift; timeout "$t" adb "$@" 9>&-; }   # timeout runs the binary, not the function
tunnel_alive() { [ -S "$SOCK" ] && "${SSH[@]}" -S "$SOCK" -O check "$REMOTE" 2>/dev/null; }
port_listening_here() { ss -ltn 2>/dev/null | grep -q "127.0.0.1:$PORT "; }
# Commands for the other machine ride on the tunnel's connection when it is open, so a busy sshd
# is asked for few handshakes. Its login shell is fish: always bash -s.
remote() {
  if tunnel_alive; then "${SSH[@]}" -S "$SOCK" "$REMOTE" bash -s
  else "${SSH[@]}" "$REMOTE" bash -s; fi
}
open_tunnel() {
  # A socket file left by a crash makes ssh connect without a handle on the tunnel: clear it first.
  if [ -e "$SOCK" ] && ! tunnel_alive; then rm -f "${SOCK:?}"; fi
  "${SSH[@]}" -f -N -M -S "$SOCK" -o ControlPersist=no -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 \
    -L "127.0.0.1:$PORT:127.0.0.1:$PORT" -L "127.0.0.1:$((PORT + 1)):127.0.0.1:$((PORT + 1))" "$REMOTE" && tunnel_alive
}
close_tunnel() {
  local i=0
  tunnel_alive && "${SSH[@]}" -S "$SOCK" -O exit "$REMOTE" 2>/dev/null
  while port_listening_here && [ "$i" -lt 5 ]; do sleep 1; i=$((i + 1)); done
  if port_listening_here; then echo "WARNING: port $PORT is still listening on this machine; the tunnel was not closed by this script"; return 1; fi
  if [ -e "$SOCK" ]; then rm -f "${SOCK:?}"; fi
  echo "tunnel closed"
}

# Prints: cores load1 availableGB hasAvd(1/0)
MEASURE='c=$(nproc); l=$(cut -d" " -f1 /proc/loadavg); a=$(awk "/MemAvailable/{printf \"%d\", \$2/1048576}" /proc/meminfo)
h=0; [ -f "$HOME/.android/avd/__AVD__.ini" ] && h=1; echo "$c $l $a $h"'
MEASURE="${MEASURE//__AVD__/$AVD}"
measure_here() { bash -c "$MEASURE"; }
measure_remote() { printf '%s\n' "$MEASURE" | remote 2>/dev/null; }

choose() {   # sets WHERE and REASON, prints the numbers
  local h r hc hl ha hh rc rl ra rh hb rb
  h=$(measure_here); r=""
  [ "$(hostname)" = "$REMOTE" ] || r=$(measure_remote) || r=""
  read -r hc hl ha hh <<<"$h"
  echo "here: $hc cores, load $hl, ${ha} GB memory available, AVD $AVD: $([ "$hh" = 1 ] && echo yes || echo no)"
  if [ "$(hostname)" = "$REMOTE" ]; then
    WHERE=here; REASON="this machine is $REMOTE"
  elif [ -z "$r" ]; then
    echo "$REMOTE: unreachable"; WHERE=here; REASON="$REMOTE is unreachable"
    if [ "$ON" = msi ]; then echo "$REMOTE cannot be reached"; return 1; fi
  else
    read -r rc rl ra rh <<<"$r"
    echo "$REMOTE: $rc cores, load $rl, ${ra} GB memory available, AVD $AVD: $([ "$rh" = 1 ] && echo yes || echo no)"
    hb=$(awk "BEGIN{printf \"%.2f\", $hl/$hc}"); rb=$(awk "BEGIN{printf \"%.2f\", $rl/$rc}")
    if [ "$rh" != 1 ]; then WHERE=here; REASON="$REMOTE has no AVD $AVD"
    elif [ "$ra" -lt 6 ]; then WHERE=here; REASON="$REMOTE has under 6 GB of memory available"
    elif [ "$hh" = 1 ] && [ "$ha" -ge 8 ] && awk "BEGIN{exit !($rb > 1.0 && $hb + 0.25 < $rb)}"; then WHERE=here; REASON="$REMOTE is busier (load per core $rb against $hb here)"
    else WHERE=msi; REASON="$REMOTE is the usual place (load per core $rb there, $hb here)"; fi
    if [ "$ON" != auto ]; then WHERE="$ON"; REASON="asked for with --on"; fi
    if [ "$WHERE" = msi ] && [ "$rh" != 1 ]; then echo "$REMOTE cannot run AVD $AVD"; return 1; fi
  fi
  if [ "$WHERE" = here ] && [ "$hh" != 1 ]; then echo "this machine has no AVD $AVD"; return 1; fi
  echo "choice: $WHERE ($REASON)"
}

register_with_adb() {   # what a local emulator does on start: tell the adb server its adb port
  adb start-server >/dev/null 2>&1
  local msg="host:emulator:$((PORT + 1))"
  exec 3<>"/dev/tcp/127.0.0.1/${ANDROID_ADB_SERVER_PORT:-5037}" || return 1
  printf '%04x%s' "${#msg}" "$msg" >&3
  read -r -n 4 -t 3 _ <&3 || true
  exec 3>&- 3<&-
}
wait_boot() {
  local i=0 left="it is still running: fix the cause or run 'stop --port $PORT'"
  [ "$WHERE" = msi ] && left="$left (its log: ssh $REMOTE journalctl --user -u lab-emulator-$PORT)"
  tadb 180 -s "$SERIAL" wait-for-device || { echo "FAIL: $SERIAL did not appear; $left"; return 1; }
  until [ "$(tadb 5 -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] &&
        tadb 5 -s "$SERIAL" shell settings get system system_locales >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 150 ] && { echo "FAIL: $SERIAL did not finish booting in 10 minutes; $left"; return 1; }; sleep 4
  done
  if [ -n "$LOCALE" ]; then   # -change-locale restarts the framework once: wait until it is back in that locale
    i=0
    until [ "$(tadb 5 -s "$SERIAL" shell getprop persist.sys.locale 2>/dev/null | tr -d '\r')" = "$LOCALE" ] &&
          [ "$(tadb 5 -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
      i=$((i + 1)); [ "$i" -gt 75 ] && { echo "FAIL: the locale did not become $LOCALE; $left"; return 1; }; sleep 4
    done
  fi
  echo "ready: $SERIAL ($AVD on $WHERE) after ~$SECONDS s"
}

start_remote() {
  local loc=""; [ -n "$LOCALE" ] && loc="-change-locale $LOCALE"
  {
    echo 'set -u'
    echo "ss -ltn 2>/dev/null | grep -q '127.0.0.1:$PORT ' && { echo \"port $PORT is already in use on \$(hostname): choose another port\"; exit 3; }"
    echo "systemctl --user is-active --quiet lab-emulator-$PORT && { echo 'unit lab-emulator-$PORT is already running there: choose another port'; exit 3; }"
    echo "for u in \$(systemctl --user list-units --plain --no-legend --state=active 'lab-emulator-*' | awk '{print \$1}'); do systemctl --user show \"\$u\" -p ExecStart | grep -q -- '-avd $AVD ' && { echo \"AVD $AVD is already running there as \$u: use your own AVD\"; exit 3; }; done"
    echo 'heavy-slot -- true || exit 4'
    echo "systemd-run --user --quiet --collect --unit=lab-emulator-$PORT -p CPUWeight=20 -p IOWeight=20 -p Nice=10 -p RuntimeMaxSec=4h --setenv=ANDROID_HOME=\$HOME/Android/Sdk --setenv=ANDROID_SDK_ROOT=\$HOME/Android/Sdk \$HOME/Android/Sdk/emulator/emulator -avd $AVD -port $PORT -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect $loc"
  } | remote
}
stop_remote() {
  {
    echo "systemctl --user stop lab-emulator-$PORT 2>/dev/null; sleep 2"
    echo "if systemctl --user is-active --quiet lab-emulator-$PORT; then echo 'unit still active'; exit 1; else echo \"emulator on \$(hostname) stopped\"; fi"
  } | remote
}
is_emulator_pid() { [ -n "$1" ] && [[ "$(readlink "/proc/$1/exe" 2>/dev/null)" == */emulator/qemu/* ]]; }

case "$CMD" in
  where) choose ;;
  start)
    [ -f "$STATE" ] && { echo "port $PORT was already started from this machine ($(cat "$STATE")). If it is another session's, choose another port; if it is yours, run stop first."; exit 1; }
    port_listening_here && { echo "port $PORT is already in use on this machine: choose another port"; exit 1; }
    choose || exit 1
    if [ "$WHERE" = msi ]; then
      open_tunnel || { echo "FAIL: the tunnel to $REMOTE did not open; nothing was started"; exit 1; }
      if ! start_remote; then
        if close_tunnel >/dev/null; then echo "FAIL: the emulator was not started on $REMOTE (see the line above); this script left nothing behind"
        else echo "FAIL: the emulator was not started on $REMOTE (see the line above), and this script's tunnel on port $PORT did not close"; fi
        exit 1
      fi
      printf 'where=msi host=%s avd=%s port=%s unit=lab-emulator-%s started=%s\n' "$REMOTE" "$AVD" "$PORT" "$PORT" "$(date -Is)" > "$STATE"
      sleep 3
      register_with_adb || { echo "FAIL: the local adb server did not take the emulator; run 'stop --port $PORT'"; exit 1; }
    else
      heavy-slot -- true || exit 1
      EMU="${ANDROID_HOME:-$HOME/Android/Sdk}/emulator/emulator"
      LOC=(); [ -n "$LOCALE" ] && LOC=(-change-locale "$LOCALE")
      nohup setsid "$EMU" -avd "$AVD" -port "$PORT" -no-window -no-audio -no-boot-anim -no-snapshot -feature -Vulkan "${LOC[@]}" > "$STATE_DIR/emulator-$PORT.log" 2>&1 9>&- &
      i=0; pid=""
      until is_emulator_pid "$pid" || [ "$i" -gt 30 ]; do
        sleep 2; i=$((i + 1))
        pid=$(ss -ltnp 2>/dev/null | grep "127.0.0.1:$PORT " | grep -o -E 'pid=[0-9]+' | head -1 | cut -d= -f2)
      done
      is_emulator_pid "$pid" || { echo "FAIL: no emulator opened port $PORT within a minute (log: $STATE_DIR/emulator-$PORT.log). If one appears later it is not recorded: check 'adb devices'."; exit 1; }
      printf 'where=here host=%s avd=%s port=%s pid=%s started=%s\n' "$(hostname)" "$AVD" "$PORT" "$pid" "$(date -Is)" > "$STATE"
    fi
    wait_boot ;;
  status)
    [ -f "$STATE" ] || { echo "port $PORT was not started by this script on this machine"; exit 1; }
    cat "$STATE"
    if grep -q '^where=msi ' "$STATE"; then if tunnel_alive; then echo "tunnel: open"; else echo "tunnel: closed (run reconnect)"; fi; fi
    st=$(tadb 5 -s "$SERIAL" get-state 2>&1); echo "adb: $st"; [ "$st" = device ] ;;
  reconnect)
    { [ -f "$STATE" ] && grep -q '^where=msi ' "$STATE"; } || { echo "port $PORT has no emulator on $REMOTE started from this machine"; exit 1; }
    tunnel_alive && { echo "the tunnel is open"; exit 0; }
    port_listening_here && { echo "port $PORT is in use on this machine by something else"; exit 1; }
    open_tunnel || { echo "FAIL: the tunnel to $REMOTE did not open"; exit 1; }
    if ! echo "systemctl --user is-active --quiet lab-emulator-$PORT" | remote; then
      close_tunnel >/dev/null; echo "the emulator on $REMOTE is no longer running (four-hour limit, or it was stopped there): run 'stop --port $PORT', then start"; exit 1
    fi
    sleep 2; register_with_adb; tadb 60 -s "$SERIAL" wait-for-device && echo "reconnected: $SERIAL" ;;
  stop)
    [ -f "$STATE" ] || { echo "port $PORT was not started by this script on this machine: nothing stopped"; exit 0; }
    if grep -q '^where=msi ' "$STATE"; then
      stop_remote || { echo "FAIL: the emulator on $REMOTE was not confirmed stopped; run stop again"; exit 1; }
      close_tunnel || { echo "FAIL: the emulator on $REMOTE is stopped but the tunnel is not closed; run stop again"; exit 1; }
    else
      pid=$(sed -n 's/.* pid=\([0-9]*\) .*/\1/p' "$STATE")
      if is_emulator_pid "$pid" && ss -ltnp 2>/dev/null | grep "127.0.0.1:$PORT " | grep -q "pid=$pid,"; then
        kill "$pid"; i=0
        while [ -d "/proc/$pid" ] && [ "$i" -lt 15 ]; do sleep 2; i=$((i + 1)); done
        [ -d "/proc/$pid" ] && kill -9 "$pid"
        echo "emulator here stopped"
      else
        echo "the recorded emulator process no longer holds port $PORT: nothing stopped"
      fi
    fi
    mv -f "$STATE" "$STATE.last" ;;
  emu)
    [ -f "$STATE" ] || { echo "port $PORT was not started by this script on this machine"; exit 1; }
    [ "${#EMU_ARGS[@]}" -gt 0 ] || { echo "usage: emu --port N -- <console command...>"; exit 2; }
    if grep -q '^where=msi ' "$STATE"; then
      { printf '%s -s %s emu' "\$HOME/Android/Sdk/platform-tools/adb" "$SERIAL"; printf ' %q' "${EMU_ARGS[@]}"; echo; } | remote
    else
      adb -s "$SERIAL" emu "${EMU_ARGS[@]}"
    fi ;;
esac
