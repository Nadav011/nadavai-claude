#!/usr/bin/env bash
# Tests for bin/ci-wait's superseded answers, against a stub gh and ssh: nothing reaches GitHub
# or NadavAI. Not under bin/, which setup links into ~/.local/bin file by file.
#   tests/ci-wait.sh [path to ci-wait, default ../bin/ci-wait]
set -u
cw=$(realpath "${1:-$(dirname "$0")/../bin/ci-wait}")
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
mkdir -p "$t/bin"
# The commit's newest nadavai-ci status is an error described by $CIDESC. A branch or main reads
# as $HEAD_<name>: a sha, "deleted" (HTTP 422, as GitHub answers a ref with no commit) or "down".
cat >"$t/bin/gh" <<'GH'
#!/usr/bin/env bash
case $* in
  *commits/*/status*) printf '{"statuses":[{"context":"nadavai-ci","state":"error","description":"%s"}]}' "$CIDESC" ;;
  *branches-where-head*) echo "$WHERE" ;;
  *commits/*)
    all="$*"; ref=${all#*commits/}; ref=${ref%% *}; v=HEAD_$ref; v=${!v:-}
    case $v in
      deleted) echo "gh: No commit found for SHA: $ref (HTTP 422)" >&2; exit 1 ;;
      down) echo "error connecting to api.github.com" >&2; exit 1 ;;
      *) echo "$v" ;;
    esac ;;
esac
GH
printf '#!/bin/sh\nexit 0\n' >"$t/bin/ssh"
chmod +x "$t/bin/gh" "$t/bin/ssh"
A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
fail=0
# --timeout 0: one poll. Exit 0 with NOT MEASURED is an answer; exit 2 (timeout) means it waits on.
check() { # name expected-exit description where head_fix head_main
  local out rc
  out=$(PATH=$t/bin:$PATH CI_WAIT_POLL=1 CIDESC=$3 WHERE=$4 HEAD_fix=$5 HEAD_main=$6 \
    timeout 60 bash "$cw" therapy-flow-v2 "$A" --timeout 0 2>&1); rc=$?
  if [ "$rc" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1: expected exit $2, got $rc: $(tail -1 <<<"$out")"; fail=1; fi
}
cancel="superseded by bbbbbbb, cancelled"
bymain="superseded by main bbbbbbb: on main, not built as a branch"
check "the branch moved on: not measured"                0 "$cancel" fix "$B" "$B"
check "A->B->A, the branch back at A: waits"             2 "$cancel" fix "$A" "$B"
check "the branch deleted (422): not measured"           0 "$cancel" fix deleted "$B"
check "GitHub unreachable: waits"                        2 "$cancel" fix down "$B"
check "superseded by main, main elsewhere: not measured" 0 "$bymain" fix "$A" "$B"
check "superseded by main, main reset to A: waits"       2 "$bymain" main "$A" "$A"
check "a branch's cancel, A now main's head: waits"      2 "$cancel" main "$A" "$A"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
