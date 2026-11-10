#!/usr/bin/env bash
# test-session-close-check.sh: runs bin/session-close-check against throwaway git repos under a temp dir
# (a local bare "origin", a clone named therapy-flow-v2 so the deploy check runs) and checks each line
# and the final CLOSE verdict. HOME, NADAVAI_HOME, CLAUDE_CONFIG_DIR and the drafts folder point into the
# temp dir, git reads no global or system config, and ssh, gh, systemctl and atq are fakes that log every
# call, so nothing real is read and nothing goes to the network.
set -uo pipefail
TOOL="$(cd "$(dirname "$0")/../../.." && pwd)/bin/session-close-check"
PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
export HOME="$tmp/home" NADAVAI_HOME="$tmp/no-nadavai" CLAUDE_CONFIG_DIR="$tmp/cfg"
export CLOSE_CHECK_DRAFTS="$tmp/drafts" XDG_CONFIG_HOME="$tmp/home/.config"
unset CLOSE_CHECK_RECENT_HOURS
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL="$tmp/gitconfig"
mkdir -p "$HOME" "$CLAUDE_CONFIG_DIR" "$CLOSE_CHECK_DRAFTS" "$tmp/fake" "$tmp/plain"
git config --file "$GIT_CONFIG_GLOBAL" user.name test
git config --file "$GIT_CONFIG_GLOBAL" user.email test@example.invalid
git config --file "$GIT_CONFIG_GLOBAL" init.defaultBranch main
git config --file "$GIT_CONFIG_GLOBAL" core.hooksPath /dev/null

# --- fakes: every call is logged; answers come from files the cases write ---
CALLS="$tmp/calls.log"; : >"$CALLS"
printf '[]' >"$tmp/fake/gh.json"
printf '[]' >"$tmp/fake/timers.json"; : >"$tmp/fake/show.txt"
for t in ssh gh systemctl atq; do
  cat >"$tmp/fake/$t" <<EOF
#!/usr/bin/env bash
printf '%s %s\n' "$t" "\$*" >>"$CALLS"
case "$t" in
  gh) cat "$tmp/fake/gh.json" ;;
  ssh) cat "$tmp/fake/ssh.out" 2>/dev/null; exit "\$(cat "$tmp/fake/ssh.rc" 2>/dev/null || echo 0)" ;;
  systemctl) case "\$*" in *list-timers*) cat "$tmp/fake/timers.json" ;; *show*) cat "$tmp/fake/show.txt" ;; esac ;;
esac
exit 0
EOF
  chmod +x "$tmp/fake/$t"
done
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
live() {  # hold-status live-sha [rc]: what the fake ssh answers
  printf '%s\nrc=0\ndpl_test %s\nrc=0\n' "$1" "$2" >"$tmp/fake/ssh.out"; printf '%s' "${3:-0}" >"$tmp/fake/ssh.rc"
}

# --- repos: bare origin, a clone named like a Woodpecker repo, one commit on main ---
git init -q --bare "$tmp/origin.git"
R="$tmp/w/therapy-flow-v2"
git clone -q "$tmp/origin.git" "$R" 2>/dev/null
echo one >"$R/a.txt"; git -C "$R" add a.txt; git -C "$R" commit -qm one; git -C "$R" push -q -u origin main 2>/dev/null
MAIN=$(git -C "$R" rev-parse HEAD)
live manual "$MAIN"

# --- --no-fetch: no network call at all, no fetch ---
out=$(check --no-fetch "$R"); rc=$?
expect "no-fetch exit 0" 0 "$rc"
expect "no-fetch: no ssh/gh call" "" "$(grep -E '^(ssh|gh) ' "$CALLS")"
expect "no-fetch: no FETCH_HEAD" no "$([ -e "$R/.git/FETCH_HEAD" ] && echo yes || echo no)"
has "no-fetch: deploy skipped" '^SKIP Deploy: therapy-flow-v2: not checked: --no-fetch' "$out"
has "no-fetch: clean says yes" '^CLOSE: yes$' "$out"

# --- clean repo on main, with fetch: every repo check OK ---
out=$(check "$R")
has "clean: working tree OK" '^OK   Working tree: clean' "$out"
has "clean: stash OK" '^OK   Stash: none' "$out"
has "clean: branch OK" '^OK   Branch: main: pushed to origin/main' "$out"
has "clean: main OK" '^OK   Main: HEAD [0-9a-f]{7} is in origin/main' "$out"
has "clean: deploy OK" '^OK   Deploy: therapy-flow-v2: production serves origin/main' "$out"
has "clean: worktrees OK" '^OK   Worktrees: no other worktree' "$out"
has "clean: CLOSE yes" '^CLOSE: yes$' "$out"
expect "clean: last line is CLOSE" "CLOSE: yes" "$(tail -1 <<<"$out")"
expect "fetch ran (the no-fetch probe can see one)" yes "$([ -e "$R/.git/FETCH_HEAD" ] && echo yes || echo no)"
has "fetch: ssh called" '^ssh .*nadavai-deploy hold-status therapy-flow-v2' "$(cat "$CALLS")"

# --- uncommitted file ---
echo new >"$R/new.txt"
out=$(check --no-fetch "$R")
has "untracked: OPEN" '^OPEN Working tree: 1 uncommitted or untracked file' "$out"
has "untracked: path listed" '^ +new.txt$' "$out"
has "untracked: CLOSE no" '^CLOSE: no \(1 open\)$' "$out"
rm -f -- "${R:?}/new.txt"

# --- unpushed commit ---
echo two >>"$R/a.txt"; git -C "$R" commit -qam two
out=$(check --no-fetch "$R"); rc=$?
expect "unpushed: exit 0 when not closable" 0 "$rc"
has "unpushed: branch OPEN" '^OPEN Branch: main: 1 commit\(s\) not pushed to origin/main' "$out"
has "unpushed: main OPEN" '^OPEN Main: main is not in origin/main' "$out"
has "unpushed: CLOSE no" '^CLOSE: no \(2 open\)$' "$out"
git -C "$R" reset -q --hard origin/main

# --- stash ---
echo dirty >>"$R/a.txt"; git -C "$R" stash push -q -m close-check-test
out=$(check --no-fetch "$R")
has "stash: OPEN" '^OPEN Stash: 1 stash' "$out"
has "stash: CLOSE no" '^CLOSE: no \(1 open\)$' "$out"
git -C "$R" stash drop -q

# --- feature branch: open PR, then merged PR (squash), then no PR ---
git -C "$R" checkout -q -b feat/x; echo f >"$R/f.txt"; git -C "$R" add f.txt; git -C "$R" commit -qm f
git -C "$R" push -q -u origin feat/x 2>/dev/null
FEAT=$(git -C "$R" rev-parse HEAD)
printf '[{"number":7,"isDraft":true,"url":"https://example.invalid/pr/7","state":"OPEN","headRefOid":"%s"}]' "$FEAT" >"$tmp/fake/gh.json"
out=$(check "$R")
has "open PR: OPEN with number" '^OPEN Main: feat/x is not in origin/main; PR #7 open \(draft\): https://example.invalid/pr/7' "$out"
has "open PR: gh asked for the branch" '^gh pr list --head feat/x ' "$(cat "$CALLS")"
printf '[{"number":8,"isDraft":false,"url":"https://example.invalid/pr/8","state":"MERGED","headRefOid":"%s"}]' "$FEAT" >"$tmp/fake/gh.json"
out=$(check "$R")
has "merged PR: OK" '^OK   Main: feat/x merged as PR #8' "$out"
printf '[]' >"$tmp/fake/gh.json"
out=$(check "$R")
has "no PR: OPEN" '^OPEN Main: feat/x is not in origin/main and has no open PR' "$out"
git -C "$R" checkout -q main

# --- deploy: main ahead of live, held, ssh down, not a deploy-service repo ---
git clone -q "$tmp/origin.git" "$tmp/pusher" 2>/dev/null
echo three >>"$tmp/pusher/a.txt"; git -C "$tmp/pusher" commit -qam three; git -C "$tmp/pusher" push -q origin main 2>/dev/null
git -C "$R" pull -q --ff-only
live manual "$MAIN"
out=$(check "$R")
has "deploy behind: OPEN" '^OPEN Deploy: therapy-flow-v2: production serves [0-9a-f]{7}, origin/main is [0-9a-f]{7}: 1 commit\(s\) of origin/main not live' "$out"
live held "$MAIN"
out=$(check "$R")
has "deploy held: SKIP" "^SKIP Deploy: .*deploys are held" "$out"
has "deploy held: CLOSE yes" '^CLOSE: yes$' "$out"
printf '' >"$tmp/fake/ssh.out"; printf 255 >"$tmp/fake/ssh.rc"
out=$(check "$R")
has "ssh down: SKIP" '^SKIP Deploy: therapy-flow-v2: not checked: ssh nadavai-vm' "$out"
printf 'manual\nrc=0\nnadavai-deploy: usage: nadavai-deploy pages-live <repo>\nrc=2\n' >"$tmp/fake/ssh.out"; printf 0 >"$tmp/fake/ssh.rc"
out=$(check "$R")
has "unknown to deploy service: SKIP" '^SKIP Deploy: therapy-flow-v2: not handled by the deploy service' "$out"
live manual "$(git -C "$R" rev-parse origin/main)"

# --- other worktree with uncommitted changes ---
git -C "$R" worktree add -q "$tmp/wt2" -b side 2>/dev/null
echo x >"$tmp/wt2/side.txt"
out=$(check --no-fetch "$R")
has "worktree: OPEN" '^OPEN Worktrees: 1 other worktree' "$out"
has "worktree: path listed" "^ +$tmp/wt2 \(1 file\(s\)\)$" "$out"
rm -f -- "${tmp:?}/wt2/side.txt"
out=$(check --no-fetch "$R")
has "worktree clean: OK" '^OK   Worktrees: no other worktree with uncommitted changes \(1 other' "$out"

# --- outside git ---
out=$(check --no-fetch "$tmp/plain"); rc=$?
expect "outside git: exit 0" 0 "$rc"
expect "outside git: 5 repo checks SKIP" 5 "$(grep -c 'is not in a git repo' <<<"$out")"
has "outside git: drafts still checked" '^OK   Client messages' "$out"
has "outside git: timers still checked" '^OK   Timers' "$out"
has "outside git: CLOSE yes" '^CLOSE: yes$' "$out"

# --- client-message drafts: recent counts, old does not ---
echo old >"$CLOSE_CHECK_DRAFTS/old.txt"; touch -d '3 days ago' "$CLOSE_CHECK_DRAFTS/old.txt"
out=$(check --no-fetch "$tmp/plain")
has "old draft: OK" '^OK   Client messages: no draft changed in the last 24 h \(1 older' "$out"
echo new >"$CLOSE_CHECK_DRAFTS/client-today.txt"
out=$(check --no-fetch "$tmp/plain")
has "new draft: OPEN" '^OPEN Client messages: 1 draft\(s\) changed in the last 24 h' "$out"
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
has "timer: fresh one-shot OPEN" '^OPEN Timers: 1 one-shot user timer' "$out"
has "timer: fresh one named" '^ +once-new.timer at ' "$out"
has "timer: recurring and old not counted" '^OK   Timers: 1 recurring user timer\(s\); 1 older one-shot\(s\), not counted' "$out"
printf '[]' >"$tmp/fake/timers.json"

# --- nadavai: uncommitted file, and installed plugin behind HEAD ---
N="$tmp/nadavai"; git clone -q "$tmp/origin.git" "$N" 2>/dev/null
git clone -q "$tmp/origin.git" "$CLAUDE_CONFIG_DIR/plugins/marketplaces/nadavai" 2>/dev/null
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai clean: OK" '^OK   nadavai: clean, pushed and installed' "$out"
echo x >"$N/stray.txt"
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai dirty: OPEN" '^OPEN nadavai: 1 uncommitted file' "$out"
rm -f -- "${N:?}/stray.txt"
git -C "$CLAUDE_CONFIG_DIR/plugins/marketplaces/nadavai" reset -q --hard HEAD~1
out=$(NADAVAI_HOME="$N" check --no-fetch "$tmp/plain")
has "nadavai not installed: OPEN" '^OPEN nadavai: installed plugin is at [0-9a-f]{7}, repo at [0-9a-f]{7}' "$out"
hasnt "home drafts not read" "$HOME/.local/state" "$out"

# --- json and usage ---
out=$("$TOOL" --no-fetch --json "$tmp/plain")
expect "json: close field" true "$(jq -r '.close' <<<"$out" 2>/dev/null)"
"$TOOL" --bogus >/dev/null 2>&1; expect "usage error exit 2" 2 "$?"
"$TOOL" "$tmp/does-not-exist" >/dev/null 2>&1; expect "missing dir exit 2" 2 "$?"

echo "session-close-check: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
