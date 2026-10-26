#!/usr/bin/env bash
# Tests for bin/heavy-slot's flock slots, with HOME pointed at a temp dir so the machine's real
# slots (~/.cache/heavy-slot) are never taken. Not under bin/, which setup links into
# ~/.local/bin file by file.
#   tests/heavy-slot.sh [path to heavy-slot, default ../bin/heavy-slot]
set -u
hs=$(realpath "${1:-$(dirname "$0")/../bin/heavy-slot}")
t=$(mktemp -d) || exit 1
pids=()
trap 'kill "${pids[@]}" 2>/dev/null; rm -rf -- "$t"' EXIT
export HOME=$t/home XDG_CONFIG_HOME=$t/config
unset HEAVY_SLOT_HELD
slot0=$HOME/.cache/heavy-slot/slot.0
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
taken() { ! flock -n "$slot0" true 2>/dev/null; }
wait_taken() { for _ in $(seq 1 25); do taken && return 0; sleep 0.2; done; return 1; }
start_of() { awk '{ sub(/^.*\) /, ""); print $20 }' "/proc/$1/stat"; }

# Each job marks itself active, records how many are active, and leaves after 1 s.
cat >"$t/job" <<'EOF'
#!/usr/bin/env bash
mkdir "$ACTIVE/$1"
ls "$ACTIVE" | wc -l >>"$SEEN"
sleep 1
rmdir "$ACTIVE/$1"
EOF
chmod +x "$t/job"
export ACTIVE=$t/active SEEN=$t/seen
mkdir -p "$ACTIVE"
for i in 1 2 3 4 5; do "$hs" --slots 2 -- "$t/job" "$i" 2>/dev/null & done
wait
max=$(sort -n "$SEEN" | tail -1); runs=$(wc -l <"$SEEN")
if [ "$runs" = 5 ] && [ "$max" -le 2 ]; then ok "5 jobs on 2 slots: all ran, at most $max at once"
else bad "5 jobs on 2 slots: $runs ran, $max at once"; fi
[ -f "$slot0" ] && ok "(2) the slots live in ~/.cache/heavy-slot" || bad "(2) no slot file at $slot0"

mkdir -p "$t/config/nadavai"; printf '# test\nheavy_slots = 1 # one\n' >"$t/config/nadavai/capacity"
: >"$SEEN"
for i in 1 2 3; do "$hs" -- "$t/job" "c$i" 2>/dev/null & done
wait
max=$(sort -n "$SEEN" | tail -1)
if [ "$max" = 1 ]; then ok "capacity file heavy_slots=1 is read"; else bad "capacity file: $max at once"; fi

if timeout 10 "$hs" --slots 1 -- "$hs" --slots 1 -- true; then ok "a nested call does not deadlock"
else bad "nested call: exit $?"; fi
# shellcheck disable=SC2016  # expanded by the child
out=$("$hs" --slots 1 -- bash -c 'echo "$HEAVY_SLOT_HELD"')
[[ $out =~ ^[0-9]+:[0-9]+$ ]] && ok "the command sees HEAVY_SLOT_HELD=<pid>:<start>" || bad "HEAVY_SLOT_HELD is '$out'"
echo in | "$hs" --slots 1 -- cat >"$t/stdin"
[ "$(cat "$t/stdin")" = in ] && ok "the command reads the caller's stdin" || bad "stdin: '$(cat "$t/stdin")'"

# SIGKILL of heavy-slot: the slot is freed at once (the documented gap).
"$hs" --slots 1 -- bash -c "echo \$\$ >'$t/child'; exec sleep 60" & holder=$!; pids+=("$holder")
wait_taken || bad "the holder never took the slot"
if timeout 3 "$hs" --slots 1 -- true 2>/dev/null; then bad "the slot was not held"; fi
kill -9 "$holder"; wait "$holder" 2>/dev/null
kill "$(cat "$t/child")" 2>/dev/null
if timeout 5 "$hs" --slots 1 -- true 2>/dev/null; then ok "a SIGKILLed holder frees its slot"
else bad "the slot stayed taken after kill -9"; fi

# A daemon the command leaves behind does not keep the slot; the exit code passes through.
"$hs" --slots 1 -- bash -c "sleep 30 & echo \$! >'$t/daemon'; exit 0"
if timeout 5 "$hs" --slots 1 -- true 2>/dev/null; then ok "a leftover daemon does not hold the slot"
else bad "the slot stayed with the daemon"; fi
kill "$(cat "$t/daemon")" 2>/dev/null
"$hs" --slots 1 -- sh -c 'exit 75'; rc=$?
[ "$rc" = 75 ] && ok "the command's exit code (75) is passed on" || bad "exit code: $rc"

# (1) TERM reaches the command's whole process group; the slot stays held until it has ended.
"$hs" --slots 1 -- bash -c "trap 'sleep 1.5; echo got >\"$t/got\"; exit 0' TERM; while :; do sleep 0.2; done" &
holder=$!; pids+=("$holder")
wait_taken || bad "(1) the holder never took the slot"
sleep 0.3; kill -TERM "$holder"
sleep 0.7
taken && ok "(1) the slot is held while the command handles TERM" || bad "(1) the slot was freed before the command ended"
wait "$holder"; rc=$?
[ "$rc" = 143 ] && [ -f "$t/got" ] && ok "(1) TERM is passed on and heavy-slot exits 143" || bad "(1) TERM: exit $rc, got=$([ -f "$t/got" ] && echo yes || echo no)"
taken && bad "(1) the slot stayed taken" || ok "(1) the slot is free once the command ended"
# (A background job of this script starts with SIGINT ignored; env gives heavy-slot a terminal's default.)
env --default-signal=INT "$hs" --slots 1 -- bash -c "trap 'echo int >\"$t/int\"; exit 0' INT; while :; do sleep 0.2; done" &
holder=$!; pids+=("$holder")
wait_taken; sleep 0.3; kill -INT "$holder"; wait "$holder"; rc=$?
[ "$rc" = 130 ] && [ -f "$t/int" ] && ok "(1) INT is passed on and heavy-slot exits 130" || bad "(1) INT: exit $rc"

# #2/#7 The command shares heavy-slot's process group: a group kill reaches both.
mypg=$(ps -o pgid= -p $$ | tr -d ' ')
# shellcheck disable=SC2016  # expanded by the child
cpg=$("$hs" --slots 1 -- bash -c 'ps -o pgid= -p $$' | tr -d ' ')
[ "$cpg" = "$mypg" ] && ok "#2 the command runs in the caller's process group" || bad "#2 pgid $cpg, caller $mypg"
(timeout -s KILL 2 "$hs" --slots 1 -- bash -c "echo \$\$ >'$t/gk'; exec sleep 30"; true) 2>/dev/null
sleep 0.3
kill -0 "$(cat "$t/gk")" 2>/dev/null && { bad "#2 timeout -s KILL left the command running"; kill "$(cat "$t/gk")"; } || ok "#2 timeout -s KILL kills heavy-slot and the command"
# #7 SIGKILL of heavy-slot alone: the command gets TERM through its parent-death signal.
if command -v setpriv >/dev/null; then
  "$hs" --slots 1 -- bash -c "echo \$\$ >'$t/pd'; exec sleep 30" & holder=$!; pids+=("$holder")
  wait_taken; sleep 0.3
  kill -9 "$holder"; wait "$holder" 2>/dev/null
  gone=0; for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$(cat "$t/pd")" 2>/dev/null || { gone=1; break; }; sleep 0.2; done
  [ "$gone" = 1 ] && ok "#7 SIGKILL of heavy-slot sends TERM to the command" || { bad "#7 the command outlived a SIGKILLed heavy-slot"; kill "$(cat "$t/pd")"; }
fi
# #8 The words are read as bash reads them, on the normal and the nested path.
timeout 5 "$hs" --slots 1 -- FOO=bar true 2>/dev/null; r1=$?
timeout 5 "$hs" --slots 1 -- "$hs" --slots 1 -- FOO=bar true 2>/dev/null; r2=$?
[ "$r1$r2" = 127127 ] && ok "#8 FOO=bar cmd is a command named FOO=bar on both paths (127)" || bad "#8 exits $r1 $r2"
# #10 A command that is not found ends the wait at once.
timeout 5 "$hs" --slots 1 -- no-such-command-xyz 2>/dev/null; r=$?
[ "$r" = 127 ] && ok "#10 a missing command exits 127 without hanging" || bad "#10 exit $r"

# (3) HEAVY_SLOT_HELD counts only for a live ancestor.
"$hs" --slots 1 -- bash -c "echo \$\$ >'$t/child2'; exec sleep 30" & holder=$!; pids+=("$holder")
wait_taken
sleep 30 & other=$!; pids+=("$other")
HEAVY_SLOT_HELD=1 timeout 3 "$hs" --slots 1 -- true 2>/dev/null; rc1=$?
HEAVY_SLOT_HELD=99999999:1 timeout 3 "$hs" --slots 1 -- true 2>/dev/null; rc2=$?
HEAVY_SLOT_HELD="$other:$(start_of "$other")" timeout 3 "$hs" --slots 1 -- true 2>/dev/null; rc3=$?
[ "$rc1$rc2" = 124124 ] && ok "HEAVY_SLOT_HELD=1 and a dead holder are ignored" || bad "bypass: exits $rc1 $rc2"
[ "$rc3" = 124 ] && ok "(3) a live holder that is not an ancestor is ignored" || bad "(3) a non-ancestor holder skipped the queue (exit $rc3)"
kill "$(cat "$t/child2")" "$other" 2>/dev/null; wait "$holder" 2>/dev/null

"$hs" --slots 0 -- true 2>/dev/null; [ $? = 64 ] && ok "--slots 0 is refused" || bad "--slots 0 accepted"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
