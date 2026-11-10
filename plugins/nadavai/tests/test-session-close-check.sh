#!/usr/bin/env bash
# test-session-close-check.sh: runs bin/session-close-check against throwaway git repos under a temp dir
# (a local bare "origin", a clone named therapy-flow-v2 so the deploy check runs) and checks each line
# and the final CLOSE verdict (yes, no, unknown). HOME, NADAVAI_HOME, CLAUDE_CONFIG_DIR and the drafts folder
# point into the temp dir, git reads no global or system config, and ssh, gh, systemctl and atq are fakes that
# log every call (git is wrapped to log its calls too), so nothing real is read and nothing goes to the network.
set -uo pipefail
TOOL="$(cd "$(dirname "$0")/../../.." && pwd)/bin/session-close-check"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
export HOME="$tmp/home" NADAVAI_HOME="$tmp/no-nadavai" CLAUDE_CONFIG_DIR="$tmp/cfg"
export CLOSE_CHECK_DRAFTS="$tmp/drafts" XDG_CONFIG_HOME="$tmp/home/.config"
unset CLOSE_CHECK_RECENT_HOURS CLOSE_CHECK_TIMEOUT
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL="$tmp/gitconfig"
mkdir -p "$HOME" "$CLAUDE_CONFIG_DIR" "$CLOSE_CHECK_DRAFTS" "$tmp/fake" "$tmp/plain"
git config --file "$GIT_CONFIG_GLOBAL" user.name test
git config --file "$GIT_CONFIG_GLOBAL" user.email test@example.invalid
git config --file "$GIT_CONFIG_GLOBAL" init.defaultBranch main
git config --file "$GIT_CONFIG_GLOBAL" core.hooksPath /dev/null
git config --file "$GIT_CONFIG_GLOBAL" advice.detachedHead false
OLD="$(date -d '3 days ago' '+%s') +0000"  # a committer date outside the 24 h window

# --- fakes: every call is logged; answers come from files the cases write ---
CALLS="$tmp/calls.log"; : >"$CALLS"
REAL_GIT=$(command -v git)
printf '[]' >"$tmp/fake/gh.json"
printf '[]' >"$tmp/fake/timers.json"; : >"$tmp/fake/show.txt"
for t in ssh gh systemctl atq; do
  cat >"$tmp/fake/$t" <<EOF
#!/usr/bin/env bash
printf '%s %s\n' "$t" "\$*" >>"$CALLS"
case "$t" in
  gh) [ -e "$tmp/fake/gh.hang" ] && sleep 30
      cat "$tmp/fake/gh.json" ;;
  ssh) [ -e "$tmp/fake/ssh.hang" ] && sleep 30
       cat "$tmp/fake/ssh.out" 2>/dev/null; exit "\$(cat "$tmp/fake/ssh.rc" 2>/dev/null || echo 0)" ;;
  systemctl) case "\$*" in *list-timers*) cat "$tmp/fake/timers.json" ;; *show*) cat "$tmp/fake/show.txt" ;; esac ;;
  atq) cat "$tmp/fake/atq.out" 2>/dev/null ;;
esac
exit 0
EOF
  chmod +x "$tmp/fake/$t"
done
cat >"$tmp/fake/git" <<EOF
#!/usr/bin/env bash
printf 'git %s\n' "\$*" >>"$CALLS"
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$tmp/fake/git"
export PATH="$tmp/fake:$PATH"

expect() {  # name want got
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want [$2], got [$3]"; FAIL=$((FAIL+1)); fi
}
has() {  # name pattern output: the output has a line matching the extended regex
  if grep -qE -- "$2" <<<"$3"; then PASS=$((PASS+1)); else echo "FAIL: $1 — no line /$2/ in:"; awk '{print "    " $0}' <<<"$3"; FAIL=$((FAIL+1)); fi
}
hasnt() {
  if grep -qE -- "$2" <<<"$3"; then echo "FAIL: $1 — unexpected /$2/ in:"; awk '{print "    " $0}' <<<"$3"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi
}
check() { "$TOOL" "$@" 2>&1; }
live() {  # hold-status live-sha: what the fake ssh answers
  printf '%s\nrc=0\ndpl_test %s\nrc=0\n' "$1" "$2" >"$tmp/fake/ssh.out"; printf 0 >"$tmp/fake/ssh.rc"
}
gh_says() { printf '%s' "$1" >"$tmp/fake/gh.json"; }
pr() {  # number state base head [merge commit]
  printf '{"number":%s,"isDraft":false,"url":"https://example.invalid/pr/%s","state":"%s","baseRefName":"%s","headRefOid":"%s","mergeCommit":%s}' \
    "$1" "$1" "$2" "$3" "$4" "$( [ -n "${5:-}" ] && printf '{"oid":"%s"}' "$5" || printf null)"
}

# --- repos: bare origin, a clone named like a Woodpecker repo, one commit on main ---
git init -q --bare "$tmp/origin.git"
R="$tmp/w/therapy-flow-v2"
git clone -q "$tmp/origin.git" "$R" 2>/dev/null
echo one >"$R/a.txt"; git -C "$R" add a.txt; git -C "$R" commit -qm one; git -C "$R" push -q -u origin main 2>/dev/null
git clone -q "$tmp/origin.git" "$tmp/pusher" 2>/dev/null  # stands in for other sessions pushing to origin
landed() {  # name: a branch with a commit of its own, pushed into origin/main (this session's landed commit)
  git -C "$R" checkout -q -b "$1"; echo "$1" >"$R/$1.txt"; git -C "$R" add "$1.txt"; git -C "$R" commit -qm "$1"
  git -C "$R" push -q origin HEAD:main 2>/dev/null
}
back_to_main() { git -C "$R" checkout -q main; git -C "$R" pull -q --ff-only; git -C "$R" branch -q -D "$1"; }
landed own0
MAIN=$(git -C "$R" rev-parse HEAD)
live manual "$MAIN"

# --- --no-fetch: no network call at all, and the network checks are UNCHECKED, never a plain yes (H1) ---
: >"$CALLS"
out=$(check --no-fetch "$R"); rc=$?
expect "no-fetch exit 0" 0 "$rc"
expect "no-fetch: no ssh/gh call" "" "$(grep -E '^(ssh|gh) ' "$CALLS")"
expect "no-fetch: no git fetch" "" "$(grep -E '^git .* fetch' "$CALLS")"
expect "no-fetch: no FETCH_HEAD" no "$([ -e "$R/.git/FETCH_HEAD" ] && echo yes || echo no)"
has "no-fetch: deploy unchecked" '^UNCHECKED +Deploy: therapy-flow-v2: not checked: --no-fetch' "$out"
has "no-fetch: CLOSE unknown" '^CLOSE: unknown \(1 not checked: Deploy\)$' "$out"
: >"$CALLS"
out=$(check "$R")
has "fetch: ssh called" '^ssh .*nadavai-deploy hold-status therapy-flow-v2' "$(cat "$CALLS")"
has "own landed commit live: deploy OK" "^OK +Deploy: therapy-flow-v2: production serves this session's commit ${MAIN:0:7}" "$out"
back_to_main own0

# --- clean repo on main, with fetch: every repo check OK ---
: >"$CALLS"
out=$(check "$R")
has "clean: working tree OK" '^OK +Working tree: clean' "$out"
has "clean: stash OK" '^OK +Stash: none' "$out"
has "clean: branch OK" '^OK +Branch: main: tracks origin/main, every commit is on a remote' "$out"
has "clean: main OK" '^OK +Main: HEAD [0-9a-f]{7} is in origin/main' "$out"
has "back on main, own0 landed here (C6-1): deploy OK" "^OK +Deploy: therapy-flow-v2: production serves this session's commit ${MAIN:0:7}" "$out"
has "clean: worktrees OK" '^OK +Worktrees: no other worktree' "$out"
expect "clean: last line is CLOSE yes" "CLOSE: yes" "$(tail -1 <<<"$out")"
expect "fetch ran (the no-fetch probe can see one)" yes "$([ -e "$R/.git/FETCH_HEAD" ] && echo yes || echo no)"
# Q: a fresh clone that made no commit and left no branch: nothing of its own, so Deploy SKIP and no ssh
Q="$tmp/q/therapy-flow-v2"; git clone -q "$tmp/origin.git" "$Q" 2>/dev/null
: >"$CALLS"
out=$(check "$Q")
has "clean on main: deploy SKIP, no commit of its own (N5)" "^SKIP +Deploy: therapy-flow-v2: no commit of this session to deploy" "$out"
expect "clean on main: ssh not called" "" "$(grep -E '^ssh ' "$CALLS")"
# M6: the fetch starts no gc or maintenance in a repo other sessions share.
has "fetch: no gc" '^git -C .* -c gc.auto=0 -c maintenance.auto=false fetch --quiet origin' "$(cat "$CALLS")"

# --- uncommitted files: the first path is printed whole (M1), Hebrew names unescaped (L4) ---
echo more >>"$R/a.txt"; echo x >"$R/קובץ.txt"
out=$(check --no-fetch "$R")
has "modified: OPEN" '^OPEN +Working tree: 2 uncommitted or untracked file' "$out"
has "modified: ' M a.txt' printed whole" '^ +a\.txt$' "$out"
has "hebrew name printed as is" '^ +קובץ\.txt$' "$out"
has "modified: CLOSE no" '^CLOSE: no \(1 open\)$' "$out"
git -C "$R" checkout -q -- a.txt; rm -f -- "${R:?}/קובץ.txt"

# --- unpushed commit on main (its upstream is origin/main itself) ---
echo two >>"$R/a.txt"; git -C "$R" commit -qam two
out=$(check "$R"); rc=$?
expect "unpushed: exit 0 when not closable" 0 "$rc"
has "unpushed: branch OPEN" '^OPEN +Branch: main: tracks origin/main, 1 commit\(s\) on no remote' "$out"
has "unpushed: main OPEN" '^OPEN +Main: main is not in origin/main and has no open PR' "$out"
has "unpushed: CLOSE no" '^CLOSE: no \(2 open\)$' "$out"
git -C "$R" reset -q --hard origin/main

# --- stashes: this branch or recent counts; another branch's old stash is a NOTE (H2) ---
echo dirty >>"$R/a.txt"; GIT_COMMITTER_DATE="$OLD" git -C "$R" stash push -q -m on-main-old
out=$(check --no-fetch "$R")
has "stash on this branch (old): OPEN" '^OPEN +Stash: 1 stash\(es\) on main' "$out"
git -C "$R" stash drop -q
git -C "$R" checkout -q -b other; echo o >>"$R/a.txt"; GIT_COMMITTER_DATE="$OLD" git -C "$R" stash push -q -m other-old
git -C "$R" checkout -q main; git -C "$R" branch -q -D other
out=$(check "$R")
has "old stash of another branch: NOTE" '^NOTE +Stash: 1 older stash\(es\) of other branches, not counted' "$out"
has "old stash of another branch: CLOSE yes" '^CLOSE: yes$' "$out"
git -C "$R" checkout -q -b other2; echo o >>"$R/a.txt"; git -C "$R" stash push -q -m other-new
git -C "$R" checkout -q main; git -C "$R" branch -q -D other2
out=$(check --no-fetch "$R")
has "recent stash of another branch: OPEN" '^OPEN +Stash: 1 stash\(es\) on main or from the last 24 h' "$out"
git -C "$R" stash clear

# --- feature branch: open PR, merged into main, merged into another base (H3), no PR ---
git -C "$R" checkout -q -b feat/x; echo f >"$R/f.txt"; git -C "$R" add f.txt; git -C "$R" commit -qm f
git -C "$R" push -q -u origin feat/x 2>/dev/null
FEAT=$(git -C "$R" rev-parse HEAD)
gh_says "[$(pr 7 OPEN main "$FEAT")]"
out=$(check "$R")
has "open PR: OPEN with number" '^OPEN +Main: feat/x is not in origin/main; PR #7 open into main: https://example.invalid/pr/7' "$out"
has "open PR: gh asked for the branch" '^gh pr list --head feat/x ' "$(cat "$CALLS")"
gh_says "[$(pr 8 MERGED feat-parent "$FEAT")]"
out=$(check "$R")
has "merged into another base: OPEN" '^OPEN +Main: feat/x merged as PR #8 into feat-parent, not into main' "$out"
hasnt "merged into another base: never yes" '^CLOSE: yes' "$out"
gh_says '[]'
out=$(check "$R")
has "no PR: OPEN" '^OPEN +Main: feat/x is not in origin/main and has no open PR' "$out"
out=$(check --no-fetch "$R")
has "no-fetch on a branch: main UNCHECKED" '^UNCHECKED +Main: feat/x is not in origin/main; its PR not checked: --no-fetch' "$out"
git -C "$R" checkout -q main

# --- H4b: a branch made from origin/main tracks it; pushed under its own name it is pushed ---
git -C "$R" checkout -q -b y --track origin/main 2>/dev/null; echo y >"$R/y.txt"; git -C "$R" add y.txt; git -C "$R" commit -qm y
git -C "$R" push -q origin y 2>/dev/null
out=$(check --no-fetch "$R")
has "tracks origin/main, pushed as y: branch OK" '^OK +Branch: y: tracks origin/main, every commit is on a remote' "$out"
git -C "$R" checkout -q main

# --- H4a: squash-merged PR, remote branch deleted and pruned: landed, deploy follows the merge commit ---
git -C "$R" checkout -q -b z; echo z >"$R/z.txt"; git -C "$R" add z.txt; git -C "$R" commit -qm z
git -C "$R" push -q -u origin z 2>/dev/null
Z=$(git -C "$R" rev-parse HEAD)
git -C "$tmp/pusher" pull -q --ff-only; echo z >"$tmp/pusher/z.txt"; git -C "$tmp/pusher" add z.txt
git -C "$tmp/pusher" commit -qm "z (#10)"; git -C "$tmp/pusher" push -q origin main 2>/dev/null
SQ=$(git -C "$tmp/pusher" rev-parse HEAD)
git -C "$tmp/pusher" push -q origin --delete z 2>/dev/null
git -C "$R" fetch -q --prune origin
gh_says "[$(pr 10 MERGED main "$Z" "$SQ")]"
live manual "$SQ"
out=$(check "$R")
has "squash + pruned: branch OK" '^OK +Branch: z: upstream gone, landed as PR #10' "$out"
has "squash + pruned: main OK" '^OK +Main: z merged into main as PR #10' "$out"
has "squash + pruned: deploy of the merge commit OK" "^OK +Deploy: therapy-flow-v2: production serves this session's commit ${SQ:0:7}" "$out"
has "squash + pruned: CLOSE yes" '^CLOSE: yes$' "$out"
live manual "$MAIN"
out=$(check "$R")
has "squash merged, not live: deploy OPEN" "^OPEN +Deploy: therapy-flow-v2: this session's commit ${SQ:0:7} is in origin/main but not live" "$out"
# N7: merged, but gh gives no merge commit: the deploy cannot be compared, never a yes
gh_says "[$(pr 10 MERGED main "$Z")]"
out=$(check "$R")
has "N7 merged, no merge commit: deploy UNCHECKED" "^UNCHECKED +Deploy: therapy-flow-v2: this session's PR is merged, but gh gave no merge commit" "$out"
hasnt "N7 merged, no merge commit: never yes" '^CLOSE: yes' "$out"
out=$(check --no-fetch "$R")
has "squash + pruned, no-fetch: branch UNCHECKED" '^UNCHECKED +Branch: z: upstream gone, 1 commit\(s\) on no remote' "$out"
git -C "$R" checkout -q main; git -C "$R" pull -q --ff-only; git -C "$R" branch -q -D z
gh_says '[]'

# --- H5: unpushed commits on another recent local branch; old branches are not counted ---
MAIN=$(git -C "$R" rev-parse HEAD); live manual "$MAIN"
git -C "$R" checkout -q -b w; echo w >"$R/w.txt"; git -C "$R" add w.txt; git -C "$R" commit -qm w
W=$(git -C "$R" rev-parse HEAD); git -C "$R" checkout -q main
git -C "$R" checkout -q -b v; echo v >"$R/v.txt"; git -C "$R" add v.txt; GIT_COMMITTER_DATE="$OLD" git -C "$R" commit -qm v
git -C "$R" checkout -q main
out=$(check "$R")
has "other recent branch: OPEN" '^OPEN +Branches: 1 other local branch\(es\) changed in the last 24 h' "$out"
has "other recent branch: named" '^ +w: 1 commit\(s\) on no remote$' "$out"
hasnt "old branch: not listed" '^ +v: ' "$out"
gh_says "[$(pr 11 MERGED main "$W")]"
out=$(check "$R")
has "other branch merged into main: OK" '^OK +Branches: no other local branch' "$out"
gh_says '[]'
out=$(check --no-fetch "$R")
has "other branch, no-fetch: UNCHECKED" '^UNCHECKED +Branches: 1 other recent local branch' "$out"
git -C "$R" branch -q -D w v

# --- M2: a stopped rebase is OPEN ---
git -C "$R" checkout -q -b r1; echo r >>"$R/a.txt"; git -C "$R" commit -qam r
GIT_SEQUENCE_EDITOR="sed -i '1i break'" git -C "$R" rebase -q -i HEAD~1 >/dev/null 2>&1
out=$(check --no-fetch "$R")
has "stopped rebase: OPEN" '^OPEN +Operation: rebase in progress' "$out"
git -C "$R" rebase --abort; git -C "$R" checkout -q main; git -C "$R" branch -q -D r1

# --- M3/N5: deploy is about this session's own commit; other sessions' merges are a NOTE, with no command ---
git -C "$tmp/pusher" pull -q --ff-only; echo three >>"$tmp/pusher/a.txt"; git -C "$tmp/pusher" commit -qam three
git -C "$tmp/pusher" push -q origin main 2>/dev/null
git -C "$R" pull -q --ff-only
live manual "$MAIN"
git -C "$Q" pull -q --ff-only
: >"$CALLS"
out=$(check "$Q")
has "N5 main after a pull: deploy SKIP" "^SKIP +Deploy: therapy-flow-v2: no commit of this session to deploy" "$out"
expect "N5 main after a pull: ssh not called" "" "$(grep -E '^ssh ' "$CALLS")"
hasnt "N5 main after a pull: no Deploy NOTE" '^NOTE +Deploy' "$out"
hasnt "N5 main after a pull: no deploy command" 'nadavai-deploy deploy' "$out"
has "N5 main after a pull: CLOSE yes" '^CLOSE: yes$' "$out"
git -C "$Q" checkout -q -b fresh origin/main 2>/dev/null
out=$(check "$Q")
has "N5 fresh branch from main: deploy SKIP" "^SKIP +Deploy: therapy-flow-v2: no commit of this session to deploy" "$out"
hasnt "N5 fresh branch from main: no deploy command" 'nadavai-deploy deploy' "$out"
has "N5 fresh branch from main: CLOSE yes" '^CLOSE: yes$' "$out"
git -C "$Q" checkout -q main; git -C "$Q" branch -q -D fresh
git -C "$R" checkout -q -b fresh origin/main 2>/dev/null
echo four >>"$R/a.txt"; git -C "$R" commit -qam four; git -C "$R" push -q origin HEAD:main 2>/dev/null
OWNC=$(git -C "$R" rev-parse HEAD)
out=$(check "$R")
has "own commit not live: OPEN" "^OPEN +Deploy: therapy-flow-v2: this session's commit ${OWNC:0:7} is in origin/main but not live" "$out"
has "own commit not live: deploy command" "nadavai-deploy deploy therapy-flow-v2 $OWNC" "$out"
live manual "$OWNC"
git -C "$tmp/pusher" pull -q --ff-only; echo five >>"$tmp/pusher/a.txt"; git -C "$tmp/pusher" commit -qam five
git -C "$tmp/pusher" push -q origin main 2>/dev/null
out=$(check "$R")
has "own commit live, main ahead: OK" "^OK +Deploy: therapy-flow-v2: production serves this session's commit ${OWNC:0:7}" "$out"
has "main ahead by others: NOTE" "^NOTE +Deploy: origin/main is 1 commit\(s\) ahead of live" "$out"
has "main ahead by others: CLOSE yes" '^CLOSE: yes$' "$out"
live held "$MAIN"
out=$(check "$R")
has "deploy held: SKIP" "^SKIP +Deploy: .*deploys are held" "$out"
has "deploy held: CLOSE yes" '^CLOSE: yes$' "$out"
git -C "$R" checkout -q main; git -C "$R" pull -q --ff-only; git -C "$R" branch -q -D fresh

# --- H1: ssh down or hanging, a failed fetch: UNCHECKED and CLOSE unknown, within the timeout ---
landed own1
printf '' >"$tmp/fake/ssh.out"; printf 255 >"$tmp/fake/ssh.rc"
out=$(check "$R")
has "ssh down: UNCHECKED" '^UNCHECKED +Deploy: therapy-flow-v2: not checked: ssh nadavai-vm' "$out"
has "ssh down: CLOSE unknown" '^CLOSE: unknown \(1 not checked: Deploy\)$' "$out"
live manual "$(git -C "$R" rev-parse origin/main)"; : >"$tmp/fake/ssh.hang"
start=$(date +%s)
out=$(CLOSE_CHECK_TIMEOUT=1 check "$R")
took=$(( $(date +%s) - start ))
rm -f -- "${tmp:?}/fake/ssh.hang"
has "ssh hangs: UNCHECKED timed out" '^UNCHECKED +Deploy: therapy-flow-v2: not checked: ssh nadavai-vm: timed out after 1 s' "$out"
has "ssh hangs: CLOSE unknown" '^CLOSE: unknown' "$out"
if [ "$took" -lt 8 ]; then PASS=$((PASS+1)); else echo "FAIL: hanging ssh took ${took}s (the process group was not stopped)"; FAIL=$((FAIL+1)); fi
printf 'manual\nrc=0\nnadavai-deploy: usage: nadavai-deploy pages-live <repo>\nrc=2\n' >"$tmp/fake/ssh.out"
out=$(check "$R")
has "unknown to deploy service: SKIP" '^SKIP +Deploy: therapy-flow-v2: not handled by the deploy service' "$out"
# nothing of this session's in main: no ssh at all, so an unreachable VM leaves the answer yes
back_to_main own1
printf '' >"$tmp/fake/ssh.out"; printf 255 >"$tmp/fake/ssh.rc"; : >"$CALLS"
out=$(check "$Q")
has "nothing of its own: Deploy SKIP" '^SKIP +Deploy: therapy-flow-v2: no commit of this session to deploy' "$out"
expect "nothing of its own: ssh not called" "" "$(grep -E '^ssh ' "$CALLS")"
has "nothing of its own: CLOSE yes with ssh down" '^CLOSE: yes$' "$out"
live manual "$(git -C "$R" rev-parse origin/main)"
# N10: a total deadline: a hanging gh is cut at it, later network checks are UNCHECKED, the CLOSE line prints
git -C "$R" checkout -q -b dl; echo dl >"$R/dl.txt"; git -C "$R" add dl.txt; git -C "$R" commit -qm dl
: >"$tmp/fake/gh.hang"
start=$(date +%s)
out=$(CLOSE_CHECK_DEADLINE=2 check "$R")
took=$(( $(date +%s) - start ))
rm -f -- "${tmp:?}/fake/gh.hang"
has "N10 gh cut at the deadline" '^UNCHECKED +Main: dl is not in origin/main; its PR not checked: timed out after' "$out"
has "N10 ssh after the deadline: UNCHECKED" '^UNCHECKED +Deploy: therapy-flow-v2: not checked: ssh nadavai-vm: deadline reached' "$out"
has "N10 CLOSE line printed" '^CLOSE: ' "$(tail -1 <<<"$out")"
if [ "$took" -lt 9 ]; then PASS=$((PASS+1)); else echo "FAIL: N10 deadline 2 s took ${took}s"; FAIL=$((FAIL+1)); fi
git -C "$R" checkout -q main; git -C "$R" branch -q -D dl
git -C "$R" remote set-url origin "$tmp/missing.git"
out=$(check "$R")
has "fetch fails: UNCHECKED" '^UNCHECKED +Fetch: not fetched' "$out"
has "N9 fetch reason: the first fatal line" '^UNCHECKED +Fetch: not fetched: fatal: .*does not appear to be a git repository' "$out"
hasnt "N9 fetch reason: not the last stderr line" 'repository exists' "$out"
has "fetch fails: CLOSE unknown" '^CLOSE: unknown' "$out"
git -C "$R" remote set-url origin "$tmp/origin.git"

# --- C6-1: landed work HEAD no longer shows: a merged PR of a branch it left (kept or deleted), a commit on main ---
clone_tf() { git clone -q "$tmp/origin.git" "$tmp/$1/therapy-flow-v2" 2>/dev/null; printf '%s' "$tmp/$1/therapy-flow-v2"; }
A=$(clone_tf a1)
git -C "$A" checkout -q -b feat1; echo a >"$A/a1.txt"; git -C "$A" add a1.txt; git -C "$A" commit -qm feat1
git -C "$A" push -q -u origin feat1 2>/dev/null; F1=$(git -C "$A" rev-parse HEAD)
git -C "$tmp/pusher" pull -q --ff-only; echo a >"$tmp/pusher/a1.txt"; git -C "$tmp/pusher" add a1.txt
git -C "$tmp/pusher" commit -qm "feat1 (#20)"; git -C "$tmp/pusher" push -q origin main 2>/dev/null
SQ1=$(git -C "$tmp/pusher" rev-parse HEAD); live manual "$(git -C "$tmp/pusher" rev-parse HEAD~1)"
gh_says "[$(pr 20 MERGED main "$F1" "$SQ1")]"
git -C "$A" switch -q main; git -C "$A" pull -q --ff-only
out=$(check "$A")
has "C6-1 A1 squash-merged, back on main: Deploy OPEN" "^OPEN +Deploy: therapy-flow-v2: this session's commit ${SQ1:0:7} is in origin/main but not live" "$out"
has "C6-1 A1: the deploy command" 'ssh nadavai-vm nadavai-deploy deploy therapy-flow-v2 ' "$out"
out=$(check --no-fetch "$A")
has "C6-1 A1 no-fetch: Deploy UNCHECKED, not SKIP" '^UNCHECKED +Deploy: therapy-flow-v2: HEAD is in origin/main; whether this session landed work it left: PRs of feat1 not checked: --no-fetch' "$out"
git -C "$A" branch -q -D feat1
: >"$CALLS"
out=$(check "$A")
has "C6-1 A2 branch deleted (gh pr merge -d): Deploy OPEN" "^OPEN +Deploy: therapy-flow-v2: this session's commit ${SQ1:0:7} is in origin/main but not live" "$out"
has "C6-1 A2: gh asked by the branch name from the reflog" '^gh pr list --head feat1 ' "$(cat "$CALLS")"
gh_says 'not json'
out=$(check "$A")
has "C6-1 gh fails: Deploy UNCHECKED" '^UNCHECKED +Deploy: therapy-flow-v2: HEAD is in origin/main; whether this session landed work it left: PR of feat1 not checked' "$out"
hasnt "C6-1 gh fails: never yes" '^CLOSE: yes' "$out"
gh_says "[$(pr 20 MERGED main "$F1" "$SQ1")]"; live manual "$SQ1"
out=$(check "$A")
has "C6-1 A2 merge live: Deploy OK" "^OK +Deploy: therapy-flow-v2: production serves this session's commit ${SQ1:0:7}" "$out"
gh_says '[]'
B=$(clone_tf b)
echo b >>"$B/a.txt"; git -C "$B" commit -qam b-direct; git -C "$B" push -q origin main 2>/dev/null
BC=$(git -C "$B" rev-parse HEAD); live manual "$(git -C "$B" rev-parse HEAD~1)"
out=$(check "$B")
has "C6-1 B committed on main, not live: Deploy OPEN" "^OPEN +Deploy: therapy-flow-v2: this session's commit ${BC:0:7} is in origin/main but not live" "$out"
live manual "$BC"
out=$(check "$B")
has "C6-1 B live: Deploy OK" "^OK +Deploy: therapy-flow-v2: production serves this session's commit ${BC:0:7}" "$out"
# --- C6-3: a branch whose own commit was dropped (reset --hard origin/main) has nothing of its own in main ---
C=$(clone_tf c)
git -C "$C" checkout -q -b try; echo t >"$C/t.txt"; git -C "$C" add t.txt; git -C "$C" commit -qm try
git -C "$tmp/pusher" pull -q --ff-only; echo c >>"$tmp/pusher/a.txt"; git -C "$tmp/pusher" commit -qam other-c
git -C "$tmp/pusher" push -q origin main 2>/dev/null
git -C "$C" fetch -q; git -C "$C" reset -q --hard origin/main
live manual "$(git -C "$C" rev-parse HEAD~1)"
out=$(check "$C")
has "C6-3 dropped own commit: Deploy SKIP" '^SKIP +Deploy: therapy-flow-v2: no commit of this session to deploy' "$out"
hasnt "C6-3 dropped own commit: no deploy command for others' merges" 'nadavai-deploy deploy' "$out"
git -C "$R" pull -q --ff-only; live manual "$(git -C "$R" rev-parse origin/main)"

# --- H2: another worktree with uncommitted changes is a NOTE, not counted ---
git -C "$R" worktree add -q "$tmp/wt2" -b side 2>/dev/null
echo x >"$tmp/wt2/side.txt"
out=$(check "$R")
has "worktree: NOTE" '^NOTE +Worktrees: 1 other worktree\(s\) with uncommitted, unpushed or unmerged work, not counted' "$out"
has "worktree: path listed" "^ +$tmp/wt2 \(side\): 1 uncommitted file\(s\)$" "$out"
has "worktree: CLOSE yes" '^CLOSE: yes$' "$out"
rm -f -- "${tmp:?}/wt2/side.txt"
out=$(check --no-fetch "$R")
has "worktree clean: OK" '^OK +Worktrees: no other worktree with uncommitted, unpushed or unmerged work \(1 other' "$out"

# --- N1: a branch checked out in another worktree is that worktree's: not in Branches, named under Worktrees ---
git -C "$R" worktree add -q "$tmp/wt4" -b othersession 2>/dev/null
echo o >"$tmp/wt4/o.txt"; git -C "$tmp/wt4" add o.txt; git -C "$tmp/wt4" commit -qm o
out=$(check "$R")
hasnt "N1 other worktree's branch: not in Branches" '^ +othersession: ' "$out"
has "N1 Branches OK" '^OK +Branches: no other local branch' "$out"
has "N1 named under Worktrees" "^ +$tmp/wt4 \(othersession\): 1 commit\(s\) on no remote, not in origin/main$" "$out"
has "N1 CLOSE yes" '^CLOSE: yes$' "$out"
# N3: from the main checkout, a worktree whose branch is pushed but not in main is still named
git -C "$tmp/wt4" push -q -u origin othersession 2>/dev/null
out=$(check "$R")
has "N3 pushed, unmerged worktree named" "^ +$tmp/wt4 \(othersession\): not in origin/main$" "$out"
# N3: several dirs: one block each, one CLOSE line; a dir given is not repeated in another block's NOTE
out=$(check --no-fetch "$R" "$tmp/wt4")
expect "N3 two dirs: two repo blocks" 2 "$(grep -c "^== $tmp/" <<<"$out")"
expect "N3 two dirs: one CLOSE line, the last" "1 CLOSE" "$(grep -c '^CLOSE:' <<<"$out") $(tail -1 <<<"$out" | cut -d: -f1)"
has "N3 two dirs: the worktree's own Main line" '^UNCHECKED +Main: othersession is not in origin/main; its PR not checked: --no-fetch' "$out"
hasnt "N3 two dirs: the given worktree is not in the NOTE" "^ +$tmp/wt4 \(" "$out"
has "N3 two dirs: the verdict names each repo" '^CLOSE: unknown \(.*Main \(wt4\)' "$out"
git -C "$R" worktree remove --force "$tmp/wt4"; git -C "$R" branch -q -D othersession

# --- N2: a repo with no remote is local-only: no fetch; Branch, Main, Branches and Deploy SKIP ---
L="$tmp/w/localonly"; git init -q "$L"; echo l >"$L/l.txt"; git -C "$L" add l.txt; git -C "$L" commit -qm l
git -C "$L" checkout -q -b side2; echo s >"$L/s.txt"; git -C "$L" add s.txt; git -C "$L" commit -qm s
git -C "$L" checkout -q main
: >"$CALLS"
out=$(check "$L")
has "N2 local-only: Branch SKIP" '^SKIP +Branch: main: local-only repo, no remote' "$out"
has "N2 local-only: Main SKIP" '^SKIP +Main: main: local-only repo, no remote' "$out"
has "N2 local-only: Branches SKIP" '^SKIP +Branches: local-only repo, no remote' "$out"
has "N2 local-only: Deploy SKIP" '^SKIP +Deploy: local-only repo, no remote' "$out"
expect "N2 local-only: no fetch" "" "$(grep -E '^git .* fetch' "$CALLS")"
has "N2 local-only, all committed: CLOSE yes" '^CLOSE: yes$' "$out"
echo d >>"$L/l.txt"
out=$(check "$L")
has "N2 local-only: uncommitted still OPEN" '^OPEN +Working tree: 1 uncommitted' "$out"
has "N2 local-only: CLOSE no" '^CLOSE: no \(1 open\)$' "$out"

# --- C6-5: a repo whose remote was removed is not local-only: its push state is unknown ---
G="$tmp/w/removedremote"; git clone -q "$tmp/origin.git" "$G" 2>/dev/null
echo g >>"$G/a.txt"; git -C "$G" commit -qam g; git -C "$G" remote remove origin
out=$(check --no-fetch "$G")
has "C6-5 removed remote: Branch UNCHECKED" '^UNCHECKED +Branch: main: the remote was removed: push state unknown' "$out"
hasnt "C6-5 removed remote: never yes" '^CLOSE: yes' "$out"

# --- N6: origin's default branch comes from origin/HEAD; with no main ref at all Main is UNCHECKED ---
git init -q --bare "$tmp/dev.git"; D="$tmp/w/devrepo"; git clone -q "$tmp/dev.git" "$D" 2>/dev/null
git -C "$D" checkout -q -b develop; echo d >"$D/d.txt"; git -C "$D" add d.txt; git -C "$D" commit -qm d
git -C "$D" push -q -u origin develop 2>/dev/null; git -C "$tmp/dev.git" symbolic-ref HEAD refs/heads/develop
git -C "$D" remote set-head origin -a >/dev/null 2>&1
git -C "$D" checkout -q -b feat/d; echo e >"$D/e.txt"; git -C "$D" add e.txt; git -C "$D" commit -qm e
git -C "$D" push -q -u origin feat/d 2>/dev/null
gh_says '[]'
out=$(check "$D")
has "N6 main from origin/HEAD" '^OPEN +Main: feat/d is not in origin/develop and has no open PR' "$out"
git -C "$D" config remote.origin.followRemoteHEAD never; git -C "$D" remote set-head origin -d
out=$(check "$D")
has "N6 no main ref: UNCHECKED" '^UNCHECKED +Main: no main ref found' "$out"
hasnt "N6 no main ref: never yes" '^CLOSE: yes' "$out"

# --- outside git ---
out=$(check --no-fetch "$tmp/plain"); rc=$?
expect "outside git: exit 0" 0 "$rc"
expect "outside git: one Repo SKIP (N4)" 1 "$(grep -cE '^SKIP +Repo: .* is not in a git repo: pass each repo' <<<"$out")"
has "outside git: drafts still checked" '^OK +Client messages' "$out"
has "outside git: timers still checked" '^OK +Timers' "$out"
has "outside git: CLOSE yes, no git repo checked (N4)" '^CLOSE: yes \(no git repo checked\)$' "$out"
out=$(check --no-fetch "$tmp/plain" "$L")
has "N4 a dir outside git next to a repo: SKIP Repo" '^SKIP +Repo: ' "$out"
hasnt "N4 a dir outside git next to a repo: a plain verdict" 'no git repo checked' "$out"

# --- client-message drafts: recent counts, old does not ---
echo old >"$CLOSE_CHECK_DRAFTS/old.txt"; touch -d '3 days ago' "$CLOSE_CHECK_DRAFTS/old.txt"
out=$(check --no-fetch "$tmp/plain")
has "old draft: OK" '^OK +Client messages: no draft changed in the last 24 h \(1 older' "$out"
echo new >"$CLOSE_CHECK_DRAFTS/client-today.txt"
out=$(check --no-fetch "$tmp/plain")
has "new draft: OPEN" '^OPEN +Client messages: 1 draft\(s\) changed in the last 24 h' "$out"
has "new draft: named" '^ +client-today.txt$' "$out"
rm -f -- "${CLOSE_CHECK_DRAFTS:?}/client-today.txt"

# --- timers: a fresh one-shot counts, an old one-shot and a recurring one do not ---
U="$tmp/units"; mkdir -p "$U"; : >"$U/once-new.timer"; : >"$U/once-old.timer"; : >"$U/daily.timer"
touch -d '5 days ago' "$U/once-old.timer"
printf '[{"unit":"once-new.timer","next":1900000000000000},{"unit":"once-old.timer","next":1900000000000000},{"unit":"daily.timer","next":1900000000000000}]' >"$tmp/fake/timers.json"
cat >"$tmp/fake/show.txt" <<EOF
Id=once-new.timer
Transient=no
FragmentPath=$U/once-new.timer
TimersCalendar={ OnCalendar=2030-03-17 09:30:00 ; next_elapse=Sun 2030-03-17 09:30:00 IST }

Id=once-old.timer
Transient=no
FragmentPath=$U/once-old.timer
TimersCalendar={ OnCalendar=2030-03-17 09:30:00 ; next_elapse=Sun 2030-03-17 09:30:00 IST }

Id=daily.timer
Transient=no
FragmentPath=$U/daily.timer
TimersCalendar={ OnCalendar=*-*-* 05:30:00 ; next_elapse=Mon 2030-03-18 05:30:00 IST }
TimersMonotonic={ OnBootUSec=30s ; next_elapse=30s }
EOF
out=$(check --no-fetch "$tmp/plain")
has "timer: fresh one-shot OPEN" '^OPEN +Timers: 1 one-shot user timer' "$out"
has "timer: fresh one named" '^ +once-new.timer at ' "$out"
has "timer: recurring and old not counted" '^OK +Timers: 1 recurring user timer\(s\); 1 older one-shot\(s\), not counted' "$out"
printf '[]' >"$tmp/fake/timers.json"

# --- L6: at jobs are a NOTE (atq shows no age), not counted ---
printf '7\tWed Nov 11 09:30:00 2026 a test\n' >"$tmp/fake/atq.out"
out=$(check --no-fetch "$tmp/plain")
has "at job: NOTE" '^NOTE +at: 1 at job\(s\) queued, not counted' "$out"
has "at job: CLOSE yes" '^CLOSE: yes \(no git repo checked\)$' "$out"
: >"$tmp/fake/atq.out"

# --- nadavai: clean, uncommitted file, installed plugin behind HEAD, no upstream (L5) ---
N="$tmp/nadavai"; git clone -q "$tmp/origin.git" "$N" 2>/dev/null
git clone -q "$tmp/origin.git" "$CLAUDE_CONFIG_DIR/plugins/marketplaces/nadavai" 2>/dev/null
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai clean: OK" '^OK +nadavai: clean, pushed and installed' "$out"
echo x >"$N/stray.txt"
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai dirty: OPEN" '^OPEN +nadavai: 1 uncommitted file' "$out"
rm -f -- "${N:?}/stray.txt"
git -C "$CLAUDE_CONFIG_DIR/plugins/marketplaces/nadavai" reset -q --hard HEAD~1
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai not installed: OPEN" '^OPEN +nadavai: installed plugin is at [0-9a-f]{7}, repo at [0-9a-f]{7}' "$out"
hasnt "home drafts not read" "$HOME/.local/state" "$out"
git -C "$N" branch -q --unset-upstream
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai no upstream: UNCHECKED" '^UNCHECKED +nadavai: no upstream, or git rev-list failed' "$out"
hasnt "nadavai no upstream: never 'pushed'" '^OK +nadavai: clean, pushed' "$out"

# --- json and usage ---
out=$("$TOOL" --no-fetch --json "$tmp/plain")
expect "json: close yes" yes "$(jq -r '.close' <<<"$out" 2>/dev/null)"
expect "N4 json: the dir that is not a repo" "$tmp/plain" "$(jq -r '.not_repos[0]' <<<"$out" 2>/dev/null)"
landed own2
out=$("$TOOL" --no-fetch --json "$R")
expect "json: close unknown" "unknown 1" "$(jq -r '"\(.close) \(.unchecked)"' <<<"$out" 2>/dev/null)"
"$TOOL" --bogus >/dev/null 2>&1; expect "usage error exit 2" 2 "$?"
# C6-4: a dir that does not exist is UNCHECKED for that dir; the others are still checked; --json stays valid
out=$(check --no-fetch "$tmp/plain" "$tmp/does-not-exist"); rc=$?
expect "C6-4 missing dir: exit 0" 0 "$rc"
has "C6-4 missing dir: UNCHECKED" "^UNCHECKED +Repo: $tmp/does-not-exist: no such directory" "$out"
has "C6-4 missing dir: the other dir still checked" "^SKIP +Repo: $tmp/plain is not in a git repo" "$out"
has "C6-4 missing dir: CLOSE unknown" '^CLOSE: unknown \(1 not checked: Repo\)$' "$out"
out=$("$TOOL" --no-fetch --json "$tmp/does-not-exist")
expect "C6-4 json valid: close unknown, dir named" "unknown $tmp/does-not-exist" "$(jq -r '"\(.close) \(.missing[0])"' <<<"$out" 2>/dev/null)"

echo "session-close-check: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
