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

# Waiting jobs start in arrival order: a job that arrives at the moment a slot frees does not
# pass the one that waited. (The old flock-only script let the late one win about half the time.)
printf 'heavy_slots=2\nheavy_floor=2\n' >"$t/config/nadavai/capacity"
passed=1
for r in 1 2 3 4; do
  : >"$t/order"
  "$hs" -- bash -c "echo \$\$ >'$t/h1'; exec sleep 60" 2>/dev/null & h1=$!; pids+=("$h1")
  "$hs" -- bash -c "echo \$\$ >'$t/h2'; exec sleep 60" 2>/dev/null & h2=$!; pids+=("$h2")
  for _ in $(seq 1 25); do [ -s "$t/h1" ] && [ -s "$t/h2" ] && break; sleep 0.2; done
  "$hs" -- bash -c "echo A >>'$t/order'; sleep 0.5" 2>/dev/null & wa=$!; pids+=("$wa")
  sleep 1.3   # A is waiting, somewhere in its 2 s wait on one of the two slots
  kill "$(cat "$t/h$(((r % 2) + 1))")"
  "$hs" -- bash -c "echo C >>'$t/order'; sleep 0.5" 2>/dev/null & wc=$!; pids+=("$wc")
  for _ in $(seq 1 30); do [ "$(wc -l <"$t/order")" = 1 ] && break; sleep 0.1; done
  [ "$(head -1 "$t/order")" = A ] || passed=0
  kill "$(cat "$t/h1")" "$(cat "$t/h2")" 2>/dev/null; wait "$h1" "$h2" "$wa" "$wc" 2>/dev/null
  rm -f "$t/h1" "$t/h2"
done
[ "$passed" = 1 ] && ok "a late arrival never passes a waiting job (4 rounds)" || bad "a late arrival started before the job that was waiting"

# A --slots call is outside the queue: waiting for its own slot, it holds nobody else up.
printf 'heavy_slots=4\nheavy_floor=4\n' >"$t/config/nadavai/capacity"
"$hs" -- bash -c "echo \$\$ >'$t/s0'; exec sleep 60" & holder=$!; pids+=("$holder")
wait_taken
"$hs" --slots 1 -- true 2>/dev/null & strict=$!; pids+=("$strict")
sleep 0.5
if timeout 5 "$hs" -- true 2>/dev/null; then ok "a waiting --slots call does not hold up the queue"
else bad "the queue waited behind a --slots call (exit $?)"; fi
kill "$(cat "$t/s0")"; wait "$holder" "$strict" 2>/dev/null

# A stopped job at the head of the queue keeps its ticket but not its turn. (Ctrl-Z stops the
# whole group, so its flock child is stopped with it.)
printf 'heavy_slots=1\nheavy_floor=1\n' >"$t/config/nadavai/capacity"
mkdir -p "$t/proc/pressure"; echo 3 >"$t/proc/stale"
export HEAVY_SLOT_TEST_PROC=$t/proc
"$hs" -- bash -c "echo \$\$ >'$t/z0'; exec sleep 60" & holder=$!; pids+=("$holder")
wait_taken
"$hs" -- true 2>/dev/null & stopped=$!; pids+=("$stopped")
sleep 1; kill -STOP "$stopped"; pkill -STOP -P "$stopped"
kill "$(cat "$t/z0")"; wait "$holder" 2>/dev/null
if timeout 15 "$hs" -- true 2>/dev/null; then ok "a stopped job at the head is passed once its ticket is stale"
else bad "the queue stayed behind a stopped job (exit $?)"; fi
pkill -CONT -P "$stopped"; kill -CONT "$stopped"; wait "$stopped" 2>/dev/null; rc=$?
[ "$rc" = 0 ] && ok "the stopped job runs once it continues" || bad "the stopped job exited $rc"
unset HEAVY_SLOT_TEST_PROC

# The command gets neither the slot's fd nor the ticket's.
printf 'heavy_slots=2\nheavy_floor=2\n' >"$t/config/nadavai/capacity"
# shellcheck disable=SC2016  # expanded by the child
fds=$("$hs" -- bash -c 'ls /proc/$$/fd' 9>&- 8>&- | tr '\n' ' ')
[[ " $fds" != *" 8 "* && " $fds" != *" 9 "* ]] && ok "the command has no fd 8 or 9" || bad "the command's fds: $fds"

# A waiting job that was SIGKILLed leaves a ticket that holds nobody up.
printf 'heavy_slots=1\nheavy_floor=1\n' >"$t/config/nadavai/capacity"
"$hs" -- bash -c "echo \$\$ >'$t/q1'; exec sleep 60" & holder=$!; pids+=("$holder")
wait_taken
"$hs" -- true 2>/dev/null & dead=$!
sleep 0.8; kill -9 "$dead"; wait "$dead" 2>/dev/null
[ -n "$(ls "$HOME/.cache/heavy-slot/queue")" ] || bad "the killed job left no ticket to test with"
kill "$(cat "$t/q1")"; wait "$holder" 2>/dev/null
if timeout 8 "$hs" -- true 2>/dev/null; then ok "a SIGKILLed waiting job does not block the queue"
else bad "the queue stayed blocked behind a dead ticket (exit $?)"; fi

# Beyond the floor, a job waits for memory, swap, disk and the CPU; --status shows both lists.
printf 'heavy_slots=3\nheavy_floor=1\nheavy_mem_min_gb=8\nheavy_cpu_max=85\nheavy_swap_max=80\n' >"$t/config/nadavai/capacity"
export HEAVY_SLOT_TEST_PROC=$t/proc
mkdir -p "$t/proc/pressure"; echo 2 >"$t/proc/gap"
calm() { printf 'MemAvailable:   52428800 kB\nSwapTotal: 1000 kB\nSwapFree: 900 kB\n' >"$t/proc/meminfo"; echo 10 >"$t/proc/busy"
  for r in cpu memory io; do echo 'some avg10=1.50 avg60=0.00 avg300=0.00 total=1' >"$t/proc/pressure/$r"; done; }
# $1 label, $2 the text the waiting job must print, after the state was made bad: it waits, then starts when calm
gate() {
  local n=$1 want=$2 p
  rm -f "$t/g.$n"
  "$hs" -- bash -c "echo ran >'$t/g.$n'" 2>"$t/g.$n.err" & p=$!; pids+=("$p")
  sleep 4   # past the gap (2 s here) after the job before it
  if [ ! -e "$t/g.$n" ] && grep -q "$want" "$t/g.$n.err"; then ok "a job beyond the floor waits: $want"
  else bad "$n: ran=$([ -e "$t/g.$n" ] && echo yes || echo no), said '$(cat "$t/g.$n.err")'"; fi
  [ "$n" = memory ] && { st=$("$hs" --status); grep -q '^running: 1$' <<<"$st" && grep -q '^waiting, in order: 1$' <<<"$st" && ok "--status lists 1 running and 1 waiting" || bad "--status: $st"; }
  calm
  for _ in $(seq 1 60); do [ -e "$t/g.$n" ] && break; sleep 0.2; done
  [ -e "$t/g.$n" ] && ok "it starts once that is back to normal" || bad "$n: it did not start when calm"
  wait "$p" 2>/dev/null
}
calm
"$hs" -- bash -c "echo \$\$ >'$t/l0'; exec sleep 300" & holder=$!; pids+=("$holder")
wait_taken
printf 'MemAvailable:    2097152 kB\nSwapTotal: 1000 kB\nSwapFree: 900 kB\n' >"$t/proc/meminfo"; gate memory 'memory: 2 GB'
printf 'MemAvailable:   52428800 kB\nSwapTotal: 1000 kB\nSwapFree: 100 kB\n' >"$t/proc/meminfo"; gate swap 'swap 90% used'
echo 'some avg10=55.20 avg60=0.00 avg300=0.00 total=1' >"$t/proc/pressure/io"; gate disk 'disk pressure 55%'
echo 'some avg10=61.00 avg60=0.00 avg300=0.00 total=1' >"$t/proc/pressure/cpu"; gate cpu-pressure 'CPU pressure 61%'
echo 95 >"$t/proc/busy"; gate cpu-busy 'CPU 95% busy'
kill "$(cat "$t/l0")" 2>/dev/null; wait "$holder" 2>/dev/null
# Inside the floor, the first two jobs start whatever the machine measures; the third waits for memory.
printf 'heavy_slots=4\nheavy_floor=4\n' >"$t/config/nadavai/capacity"
printf 'MemAvailable:    2097152 kB\nSwapTotal: 1000 kB\nSwapFree: 900 kB\n' >"$t/proc/meminfo"
: >"$t/f.ran"
for n in 1 2 3; do "$hs" -- bash -c "echo $n >>'$t/f.ran'; exec sleep 16" 2>"$t/f.$n.err" & pids+=("$!"); sleep 0.5; done
sleep 10   # long enough for the third job's 2 s waits to have gone round every floor slot
[ "$(wc -l <"$t/f.ran")" = 2 ] && grep -q 'memory: 2 GB' "$t/f.3.err" && ok "with low memory two floor jobs run and the third waits" || bad "floor under low memory: $(wc -l <"$t/f.ran") ran, third said '$(cat "$t/f.3.err")'"
calm
for _ in $(seq 1 30); do [ "$(wc -l <"$t/f.ran")" = 3 ] && break; sleep 0.2; done
[ "$(wc -l <"$t/f.ran")" = 3 ] && ok "the third starts once memory is back" || bad "the third floor job did not start"
wait 2>/dev/null
unset HEAVY_SLOT_TEST_PROC
mv "$t/config/nadavai/capacity" "$t/capacity.off"
[ "$(OMP_NUM_THREADS=1 "$hs" --status | sed -n 3p)" = "$("$hs" --status | sed -n 3p)" ] && OMP_NUM_THREADS=1 "$hs" --status | grep -q "ceiling: $(nproc --all)\$" && ok "OMP_NUM_THREADS does not change the pool" || bad "pool under OMP_NUM_THREADS=1: $(OMP_NUM_THREADS=1 "$hs" --status | sed -n 3p)"
mv "$t/capacity.off" "$t/config/nadavai/capacity"
printf 'heavy_slots=2\nheavy_floor=5\n' >"$t/config/nadavai/capacity"
"$hs" --status | grep -q '^always admitted: 2; ceiling: 2$' && ok "a floor above the ceiling is cut to the ceiling" || bad "floor above ceiling: $("$hs" --status | sed -n 3p)"
printf 'heavy_slots=1\n' >"$t/config/nadavai/capacity"

"$hs" --slots 0 -- true 2>/dev/null; [ $? = 64 ] && ok "--slots 0 is refused" || bad "--slots 0 accepted"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
