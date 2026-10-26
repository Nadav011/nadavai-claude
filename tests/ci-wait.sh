#!/usr/bin/env bash
# Tests for bin/ci-wait against a stub gh and ssh: nothing reaches GitHub or NadavAI. Not under
# bin/, which setup links into ~/.local/bin file by file. Covers its superseded answers, the
# shared poller, the parent check, --require full and --land.
#   tests/ci-wait.sh [path to ci-wait, default ../bin/ci-wait]
set -u
cw=$(realpath "${1:-$(dirname "$0")/../bin/ci-wait}")
t=$(mktemp -d) || exit 1
trap 'kill $(jobs -p) 2>/dev/null; rm -rf -- "$t"' EXIT
mkdir -p "$t/bin"
# Commit A's newest nadavai-ci status is $CISTATE (default error) described by $CIDESC, pending
# while $DONE names a file that does not exist yet; nadavai-security is there as $SECSTATE when
# set; its updated_at is $CIUPDATED (none when unset). Any other commit's nadavai-ci is
# $BASESTATE/$BASEDESC ("down": that read fails). A branch or main reads as
# $HEAD_<name>: a sha, "deleted" (HTTP 422, as GitHub answers a ref with no commit), "notfound"
# (HTTP 404), "down" (GitHub unreachable), "empty" or "garbage" (exit 0 with no sha on stdout).
# Every status read appends a line to $CALLS; ssh appends its arguments to $SSHLOG.
cat >"$t/bin/gh" <<'GH'
#!/usr/bin/env bash
q=""; prev=""
for a in "$@"; do [ "$prev" = -q ] && q=$a; prev=$a; done
case $* in
  *commits/*/status*)
    echo x >>"${CALLS:-/dev/null}"
    all="$*"; ref=${all#*commits/}; ref=${ref%%/*}
    if [ "$ref" = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ]; then
      s=${CISTATE:-error} d=${CIDESC:-}
      [ -n "${DONE:-}" ] && [ ! -e "$DONE" ] && s=pending d=running
    else
      [ "${BASESTATE:-}" = down ] && { echo "error connecting to api.github.com" >&2; exit 1; }
      s=${BASESTATE:-} d=${BASEDESC:-}
    fi
    body=$(jq -cn --arg s "$s" --arg d "$d" --arg sec "${SECSTATE:-}" --arg u "${CIUPDATED:-}" '{statuses: ([{context: "nadavai-ci", state: $s, description: $d}
        + (if $u == "" then {} else {updated_at: $u} end)]
      + (if $sec == "" then [] else [{context: "nadavai-security", state: $sec, description: "clean"}] end))}')
    if [ -n "$q" ]; then jq -r "$q" <<<"$body"; else echo "$body"; fi ;;
  *branches-where-head*) echo "$WHERE" ;;
  *commits/*)
    all="$*"; ref=${all#*commits/}; ref=${ref%% *}; v=HEAD_$ref; v=${!v:-}
    case $v in
      deleted) echo "gh: No commit found for SHA: $ref (HTTP 422)" >&2; exit 1 ;;
      notfound) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
      empty) ;;
      garbage) echo "<html>rate limited</html>" ;;
      down) echo "error connecting to api.github.com" >&2; exit 1 ;;
      *) echo "$v" ;;
    esac ;;
esac
GH
# shellcheck disable=SC2016  # expanded by the stub, not here
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >>"${SSHLOG:-/dev/null}"\nexit 0\n' >"$t/bin/ssh"
chmod +x "$t/bin/gh" "$t/bin/ssh"
A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export PATH=$t/bin:$PATH CI_WAIT_POLL=1
fail=0 n=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1: $2"; fail=1; }
# Every run gets its own cache: a snapshot of one case must not answer the next.
fresh_cache() { n=$((n + 1)); export CI_WAIT_CACHE=$t/cache$n; }

# --timeout 0: one poll. Exit 0 with NOT MEASURED is an answer; exit 2 (timeout) means it waits on.
check() { # name expected-exit description where head_fix head_main [ci-wait options...]
  local out rc name=$1 want=$2
  fresh_cache
  out=$(CIDESC=$3 WHERE=$4 HEAD_fix=$5 HEAD_main=$6 timeout 60 bash "$cw" therapy-flow-v2 "$A" --timeout 0 "${@:7}" 2>&1); rc=$?
  if [ "$rc" = "$want" ]; then ok "$name"; else bad "$name" "expected exit $want, got $rc: $(tail -1 <<<"$out")"; fi
}
cancel="superseded by bbbbbbb, cancelled"
bymain="superseded by main bbbbbbb: on main, not built as a branch"
check "the branch moved on: not measured"                0 "$cancel" fix "$B" "$B"
check "A->B->A, the branch back at A: waits"             2 "$cancel" fix "$A" "$B"
check "the branch deleted (422): not measured"           0 "$cancel" fix deleted "$B"
check "GitHub unreachable: waits"                        2 "$cancel" fix down "$B"
check "the branch gone (404): not measured"              0 "$cancel" fix notfound "$B"
check "an empty answer: waits"                           2 "$cancel" fix empty "$B"
check "an answer with no sha in it: waits"               2 "$cancel" fix garbage "$B"
check "superseded by main, main elsewhere: not measured" 0 "$bymain" fix "$A" "$B"
check "superseded by main, main reset to A: waits"       2 "$bymain" main "$A" "$A"
check "a branch's cancel, A now main's head: waits"      2 "$cancel" main "$A" "$A"

# --require full: green only on a full-scope pass, directly or through the commit it names.
full="passed on NadavAI in 5m" partial="passed on NadavAI in 5m; outside this branch scope, not run: E2E"
export SECSTATE=success
CISTATE=success check "a full pass: green"                                0 "$full" fix "$A" "$B" --require full
CISTATE=success check "an MSI full pass with its tag: green"              0 "passed on MSI in 4m [msi:0123abcd]" fix "$A" "$B" --require full
CISTATE=success check "a partial scope: not full"                         1 "$partial" fix "$A" "$B" --require full
CISTATE=success check "a partial scope without --require: green as today" 0 "$partial" fix "$A" "$B"
CISTATE=success check "not measured, superseded: not full"                1 "not measured: superseded" fix "$A" "$B" --require full
CISTATE=success check "a coverage tag [changed@abc1234]: not full"        1 "passed on NadavAI in 5m [changed@abc1234]" fix "$A" "$B" --require full
CISTATE=success check "any other tag: not full"                           1 "passed on NadavAI in 5m [slot:omarchy]" fix "$A" "$B" --require full
CISTATE=success check "an MSI tag that is no token: not full"             1 "passed on MSI in 4m [msi:zz]" fix "$A" "$B" --require full
CISTATE=success BASESTATE=success BASEDESC=$full \
  check "the same tree as a full pass: green"                             0 "same tree as bbbbbbb, which passed; not rebuilt" fix "$A" "$B" --require full
CISTATE=success BASESTATE=success BASEDESC=$partial \
  check "the same tree as a partial pass: not full"                       1 "same tree as bbbbbbb, which passed; not rebuilt" fix "$A" "$B" --require full
CISTATE=success BASESTATE=success BASEDESC="same tree as ccccccc, which passed; not rebuilt" \
  check "two levels of same tree: not full"                               1 "same tree as bbbbbbb, which passed; not rebuilt" fix "$A" "$B" --require full
CISTATE=success BASESTATE=down \
  check "the commit it names unreadable: waits, never NOT FULL"           2 "same tree as bbbbbbb, which passed; not rebuilt" fix "$A" "$B" --require full
check "superseded with --require full: exit 1"                            1 "$cancel" fix "$B" "$B" --require full
unset SECSTATE

# --land writes the request on NadavAI (the stub ssh records it), then waits as --require full
# for a nadavai-ci status posted after the request.
export SSHLOG=$t/ssh.log SECSTATE=success
new=2099-01-01T00:00:00Z old=2020-01-01T00:00:00Z
CISTATE=success CIUPDATED=$new check "--land, a full pass after the request: green"     0 "$full" feat/x "$A" "$B" --land
# shellcheck disable=SC2088  # the literal text of the remote command
f="~/ci/state/land/therapy-flow-v2__feat__x"
if grep -qF "printf '%s %s\n' $A " "$SSHLOG" && grep -qF "> $f.tmp && mv $f.tmp $f" "$SSHLOG"; then
  ok "--land writes <sha> <epoch> to state/land/<repo>__<branch> through tmp + mv"
else
  bad "--land request" "ssh got: $(cat "$SSHLOG" 2>/dev/null)"
fi
CISTATE=success CIUPDATED=$old check "--land, a full pass from before the request: waits" 2 "$full" feat/x "$A" "$B" --land
CISTATE=success CIUPDATED=$old check "--land, a partial pass from before: waits"          2 "$partial" feat/x "$A" "$B" --land
CISTATE=success CIUPDATED=$new check "--land, a partial pass after the request: not full" 1 "$partial" feat/x "$A" "$B" --land
CISTATE=success check "--land on main: refused"                                            64 "$full" main "$A" "$A" --land
mkdir -p "$t/down"; printf '#!/bin/sh\nexit 255\n' >"$t/down/ssh"; chmod +x "$t/down/ssh"
PATH=$t/down:$PATH CISTATE=success check "--land, the request not written: exit 3"        3 "$full" feat/x "$A" "$B" --land
unset SSHLOG SECSTATE

# The waits below run on: A is pending until $DONE exists.
export CISTATE=success CIDESC=$full SECSTATE=success WHERE=fix HEAD_fix=$A HEAD_main=$B
wait_gone() { # pid seconds: 0 when the process ended within that time
  local i
  for ((i = 0; i < $2 * 10; i++)); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.1; done
  return 1
}

# Three waiters on one sha share one poller: about one status read per poll, not three.
fresh_cache; export CALLS=$t/calls1 DONE=$t/done1
pids=()
for i in 1 2 3; do bash "$cw" therapy-flow-v2 "$A" --timeout 1 >"$t/w$i.out" 2>&1 & pids+=($!); done
sleep 6; touch "$DONE"
rcs=""; for p in "${pids[@]}"; do wait "$p"; rcs+="$? "; done
calls=$(wc -l <"$CALLS")
if [ "$rcs" = "0 0 0 " ] && [ "$calls" -le 10 ]; then
  ok "3 waiters for ~6 polls read the status $calls times (unshared: ~21)"
else
  bad "shared poller" "exits $rcs, $calls status reads in ~6 polls of 3 waiters"
fi

# The poller killed: another waiter takes the polling over within two polls.
fresh_cache; export CALLS=$t/calls2 DONE=$t/done2
bash "$cw" therapy-flow-v2 "$A" --timeout 1 >"$t/p1.out" 2>&1 & p1=$!
sleep 0.5
bash "$cw" therapy-flow-v2 "$A" --timeout 1 >"$t/p2.out" 2>&1 & p2=$!
sleep 2
if flock -n "$CI_WAIT_CACHE/therapy-flow-v2-$A.lock" true; then bad "takeover" "nobody held the poller's lock"; fi
kill -9 "$p1"; wait "$p1" 2>/dev/null
before=$(wc -l <"$CALLS"); sleep 2.5; after=$(wc -l <"$CALLS")
touch "$DONE"; wait "$p2"; rc=$?
if [ "$after" -gt "$before" ] && [ "$rc" = 0 ]; then
  ok "the poller killed: the other waiter read $((after - before)) times in the next 2.5 s, then went green"
else
  bad "takeover" "reads $before -> $after after the kill, survivor exit $rc: $(tail -1 "$t/p2.out")"
fi

# The parent killed: the waiter stops within one poll, exit 4.
fresh_cache; export CALLS=/dev/null DONE=$t/done3
bash -c 'bash "$1" therapy-flow-v2 "$2" --timeout 1 >"$3" 2>&1 & echo $! >"$4"; wait' _ "$cw" "$A" "$t/pg.out" "$t/pg.pid" &
parent=$!
# Killed once the wait is in its loop: a parent gone before that reads as a launcher.
for ((i = 0; i < 100; i++)); do grep -q "nadavai-ci: pending" "$t/pg.out" 2>/dev/null && break; sleep 0.1; done
waiter=$(cat "$t/pg.pid")
kill -9 "$parent"; wait "$parent" 2>/dev/null
if wait_gone "$waiter" 2 && grep -q "parent gone" "$t/pg.out"; then
  ok "the parent killed: the waiter stopped within a poll ($(tail -1 "$t/pg.out" | cut -c1-40)...)"
else
  bad "parent gone" "waiter $waiter still there or no message: $(tail -1 "$t/pg.out")"; kill "$waiter" 2>/dev/null
fi

# A wrapper orphaned (bash -c inside bash -c with the top one killed, as when a session dies and
# its shell wrapper lives on): the waiter stops within one poll, exit 4.
fresh_cache; export DONE=$t/done5
# shellcheck disable=SC2016  # expanded by the inner shells
bash -c 'bash -c '\''bash "$1" therapy-flow-v2 "$2" --timeout 1 >"$3" 2>&1 & echo $! >"$4"; wait'\'' _ "$@" & wait' \
  _ "$cw" "$A" "$t/gp.out" "$t/gp.pid" &
top=$!
for ((i = 0; i < 100; i++)); do grep -q "nadavai-ci: pending" "$t/gp.out" 2>/dev/null && break; sleep 0.1; done
waiter=$(cat "$t/gp.pid")
kill -9 "$top"; wait "$top" 2>/dev/null
if wait_gone "$waiter" 2 && grep -q "parent gone" "$t/gp.out"; then
  ok "the top of a bash -c chain killed: the waiter stopped within a poll"
else
  bad "orphaned wrapper" "waiter $waiter still there or no message: $(tail -1 "$t/gp.out")"; kill "$waiter" 2>/dev/null
fi

# --detach, and CI_WAIT_FOLLOW_PARENT=0: the parent killed, the wait goes on.
detached() { # name env-assignment option
  fresh_cache; export DONE=$t/done-$1
  # shellcheck disable=SC2016  # expanded by the inner shell
  env "$2" bash -c 'bash "$1" therapy-flow-v2 "$2" --timeout 1 $5 >"$3" 2>&1 & echo $! >"$4"; wait' \
    _ "$cw" "$A" "$t/dt.out" "$t/dt.pid" "$3" &
  local parent=$! waiter i
  for ((i = 0; i < 100; i++)); do grep -q "nadavai-ci: pending" "$t/dt.out" 2>/dev/null && break; sleep 0.1; done
  waiter=$(cat "$t/dt.pid")
  kill -9 "$parent"; wait "$parent" 2>/dev/null
  sleep 2
  if ! kill -0 "$waiter" 2>/dev/null; then bad "$1" "it stopped: $(tail -1 "$t/dt.out")"; return; fi
  touch "$DONE"
  if wait_gone "$waiter" 3 && grep -q "^GREEN" "$t/dt.out"; then ok "$1: the parent killed, the wait went on to green"
  else bad "$1" "did not end green: $(tail -1 "$t/dt.out")"; kill "$waiter" 2>/dev/null; fi
}
detached --detach CI_WAIT_FOLLOW_PARENT=1 --detach
detached CI_WAIT_FOLLOW_PARENT=0 CI_WAIT_FOLLOW_PARENT=0 ""

# `( ci-wait … & )`: the launcher exits at once, which is no reason to stop.
fresh_cache; export DONE=$t/done4
( bash "$cw" therapy-flow-v2 "$A" --timeout 1 >"$t/det.out" 2>&1 & echo $! >"$t/det.pid" )
sleep 3
det=$(cat "$t/det.pid")
if kill -0 "$det" 2>/dev/null; then
  touch "$DONE"
  if wait_gone "$det" 3 && grep -q "^GREEN" "$t/det.out"; then
    ok "a ( ci-wait & ) launch waits on and ends green"
  else
    bad "detached launch" "did not end green: $(tail -1 "$t/det.out")"; kill "$det" 2>/dev/null
  fi
else
  bad "detached launch" "it stopped by itself: $(tail -1 "$t/det.out")"
fi

[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
