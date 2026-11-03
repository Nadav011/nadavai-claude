#!/usr/bin/env bash
# Tests for bin/worktree-clean on throwaway repos, with HOME in a temp dir and a fake `orca` on
# PATH, so no real worktree, archive or Orca state is touched.
#   tests/worktree-clean.sh [path to worktree-clean, default ../bin/worktree-clean]
set -u
wc_bin=$(realpath "${1:-$(dirname "$0")/../bin/worktree-clean}")
t=$(mktemp -d) || exit 1
sleeper=
trap '[ -n "$sleeper" ] && kill "$sleeper" 2>/dev/null; chmod -R u+rwx -- "$t" 2>/dev/null; rm -rf -- "$t"' EXIT
export HOME=$t/home GIT_CONFIG_GLOBAL=$t/gitconfig GIT_CONFIG_NOSYSTEM=1 WTC_T=$t
mkdir -p "$HOME" "$t/fakebin"
# Fake Orca: lists two worktrees of this host and one of another; ps shows one with a live terminal; rm removes
# and then prunes, as Orca's own removal may, except orca-unsure, which it answers without result.removed.
cat >"$t/fakebin/orca-ide" <<'EOF'
#!/bin/sh
W=$WTC_T/scwt
case "$2" in
  list) printf '{"result":{"worktrees":[{"id":"%s","path":"%s","hostId":"local"},{"id":"%s","path":"%s","hostId":"local"},{"id":"%s","path":"%s","hostId":"remote-1"}]}}\n' \
          "$W/orcawt" "$W/orcawt" "$W/orca-unsure" "$W/orca-unsure" "$W/remote-wt" "$W/remote-wt" ;;
  ps) printf '{"result":{"truncated":false,"worktrees":[{"path":"%s","liveTerminalCount":1,"unverifiableTerminalCount":0,"agents":[],"hasAttachedPty":false,"isPinned":false}]}}\n' "$W/orca-busy" ;;
  rm) p=${4#id:}; echo "$p" >>"$WTC_T/orca-rm.log"
      case "$p" in */orca-unsure) echo '{"ok": true}'; exit 0 ;; esac
      f=; [ "$5" = --force ] && f=--force
      m=$(dirname "$(git -C "$p" rev-parse --path-format=absolute --git-common-dir)")
      git -C "$m" worktree remove $f "$p" && git -C "$m" worktree prune && echo '{"ok": true, "result": {"removed": true}}' ;;
esac
EOF
chmod +x "$t/fakebin/orca-ide"
export PATH=$t/fakebin:$PATH
unset ORCA_CLI_COMMAND XDG_CONFIG_HOME CODEX_HOME
git config --global user.email t@t; git config --global user.name t; git config --global init.defaultBranch main
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
stamp=$(date +%F)
arch=$HOME/Archive/worktree-clean/$stamp

git init -q --bare "$t/remote.git"
git clone -q "$t/remote.git" "$t/main" 2>/dev/null
cd "$t/main" || exit 1
mkdir -p docs/coverage build; echo report >docs/coverage/index.md; echo tracked >build/keep.txt
printf 'node_modules/\ndist/\n.env.local\n*.secret\n.claude/\n' >.gitignore
git add -A; git commit -qm init; git push -q origin main 2>/dev/null
wt() { git worktree add -q -b "$1" "$t/wt/$1" main 2>/dev/null; }
# clean, pushed; has a tracked coverage/ dir and an ignored node_modules
wt clean; mkdir -p "$t/wt/clean/node_modules/x"; (cd "$t/wt/clean" && git push -q origin clean 2>/dev/null)
# uncommitted + untracked work, an ignored .env.local
wt dirty; echo edit >>"$t/wt/dirty/docs/coverage/index.md"; echo new >"$t/wt/dirty/new.txt"; echo SECRET=1 >"$t/wt/dirty/.env.local"
echo k=1 >"$t/wt/dirty/build/x.secret"
mkdir -p "$t/wt/dirty/dist"; echo KEY=1 >"$t/wt/dirty/dist/.env.production"; echo js >"$t/wt/dirty/dist/app.js"
# work inside an untracked nested repository: a snapshot commit cannot hold it
wt nested; git init -q "$t/wt/nested/sub"; echo w >"$t/wt/nested/sub/work.txt"
# a commit on no remote
wt unpushed; (cd "$t/wt/unpushed" && echo c >c.txt && git add c.txt && git commit -qm local)
# something runs inside it
wt busy; (cd "$t/wt/busy" && exec sleep 300) & sleeper=$!
# a protected worktree registered inside an unprotected one, in its git-ignored .claude/worktrees/
wt outer; git worktree add -q -b inner "$t/wt/outer/.claude/worktrees/keepme" main 2>/dev/null
# an unregistered clone in an ignored folder; a merge in progress; a commit only the HEAD reflog still reaches
wt ign-clone; git init -q "$t/wt/ign-clone/.claude/scratch"
wt merging; (cd "$t/wt/merging" && git merge -q --no-ff --no-commit unpushed >/dev/null 2>&1)
wt amended; (cd "$t/wt/amended" && echo a >a.txt && git add a.txt && git commit -qm a1)
c1=$(git -C "$t/wt/amended" rev-parse HEAD); (cd "$t/wt/amended" && echo b >a.txt && git commit -qa --amend -m a2)
# owner lists in config/worktree-clean.json: by repo name, by worktree name, by path; plus the user's own file
git clone -q "$t/remote.git" "$t/therapy-flow-v2" 2>/dev/null
git -C "$t/therapy-flow-v2" worktree add -q --detach "$t/tfwt/done" origin/main 2>/dev/null
git -C "$t/therapy-flow-v2" worktree add -q --detach "$t/tfwt/gone" origin/main 2>/dev/null; rm -rf -- "${t:?}/tfwt/gone"
git clone -q "$t/remote.git" "$t/sportchat-web" 2>/dev/null
for n in v4-system v4-lane v4-done orcawt v4-merge-9 old-free lost-lane orca-busy remote-wt wt-points; do
  git -C "$t/sportchat-web" worktree add -q --detach "$t/scwt/$n" origin/main 2>/dev/null
done
(cd "$t/scwt/v4-lane" && echo l >l.txt && git add l.txt && git commit -qm lane && git push -q origin HEAD:refs/heads/v4-lane 2>/dev/null && git fetch -q origin)
(cd "$t/scwt/lost-lane" && echo x >x.txt && git add x.txt && git commit -qm lost); lost=$(git -C "$t/scwt/lost-lane" rev-parse HEAD)
# stale entries: one an owner rule protects, one not, one whose HEAD (a commit on no remote) no ref reaches
rm -rf -- "${t:?}/scwt/v4-merge-9" "${t:?}/scwt/old-free" "${t:?}/scwt/lost-lane"
# matched on the branch: v4/<job> with a local commit in a folder not named v4-*, a branch part naming a listed
# lane, a v4/<job> lane stopped mid-rebase (detached; the branch is only in rebase-merge/head-name), one detached
# after its branch was deleted (only the reflog names it), and one detached where a branch points at its HEAD
git -C "$t/sportchat-web" worktree add -q -b v4/quick-job "$t/scwt/wt-quick" origin/main 2>/dev/null
(cd "$t/scwt/wt-quick" && echo q >q.txt && git add q.txt && git commit -qm quick)
git -C "$t/sportchat-web" worktree add -q -b lane/v4-system "$t/scwt/lane-sys" origin/main 2>/dev/null
git -C "$t/sportchat-web" worktree add -q -b v4/rebase-job "$t/scwt/wt-rebase" origin/main 2>/dev/null
(cd "$t/scwt/wt-rebase" && echo r >r.txt && git add r.txt && git commit -qm rebase && git rebase -q -x false HEAD~1 >/dev/null 2>&1)
git -C "$t/sportchat-web" worktree add -q -b v4/moved-job "$t/scwt/wt-moved" origin/main 2>/dev/null
(cd "$t/scwt/wt-moved" && echo m >m.txt && git add m.txt && git commit -qm moved && git checkout -q --detach && git branch -q -D v4/moved-job)
(cd "$t/scwt/wt-points" && echo p >p.txt && git add p.txt && git commit -qm points && git branch v4/points-job HEAD)
# a sportchat-web clone without origin/main: a v4-* lane there counts as not landed
git clone -q "$t/remote.git" "$t/nomain/sportchat-web" 2>/dev/null
git -C "$t/nomain/sportchat-web" remote set-head origin -d >/dev/null 2>&1; git -C "$t/nomain/sportchat-web" update-ref -d refs/remotes/origin/main
git -C "$t/nomain/sportchat-web" worktree add -q --detach "$t/nomainwt/v4-x" main 2>/dev/null
git worktree add -q -b tf513 "$HOME/Desktop/tf-513-x" main 2>/dev/null
git worktree add -q -b keepslash "$HOME/Desktop/keep-slash" main 2>/dev/null
git worktree add -q -b hostwt "$HOME/Desktop/host-wt" main 2>/dev/null
# the user's list: a trailing slash on a path, a listed path inside a worktree, and an attempt to un-exclude
# therapy-flow-v2 (it can only add)
user='{"neverTouchPaths": ["~/Desktop/keep-slash/", "~/Desktop/host-wt/planning/513"], "repos": {"main": {"neverTouch": ["keepme"]}, "therapy-flow-v2": {"exclude": false}}}'
mkdir -p "$HOME/.config/nadavai"; echo "$user" >"$HOME/.config/nadavai/worktree-clean.json"
wt keepme
# a Claude (Orca profile, or a session in a subfolder), Codex (in a subfolder) or Grok transcript of the path changed
# lately, or a transcript folder that cannot be read; an old one does not count
for n in talk-claude talk-codex talk-grok talk-sub talk-locked stale; do wt "$n"; done
top() { git -C "$t/wt/$1" rev-parse --show-toplevel; }
enc() { printf '%s' "$1" | tr -c 'A-Za-z0-9' '-'; }
d=$HOME/.config/orca/claude-profiles/p1/home/projects/$(enc "$(top talk-claude)"); mkdir -p "$d"; echo '{}' >"$d/s.jsonl"
mkdir -p "$HOME/.codex/sessions/2026/11/03"; printf '{"type":"session_meta","payload":{"cwd":"%s/sub"}}\n{}\n' "$(top talk-codex)" >"$HOME/.codex/sessions/2026/11/03/rollout-t.jsonl"
d=$HOME/.grok/sessions/$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$(top talk-grok)")/s1; mkdir -p "$d"; echo '{}' >"$d/updates.jsonl"
d=$HOME/.claude/projects/$(enc "$(top stale)"); mkdir -p "$d"; echo '{}' >"$d/s.jsonl"; touch -d '10 days ago' "$d/s.jsonl" "$d"
d=$HOME/.claude/projects/$(enc "$(top talk-sub)/apps/web"); mkdir -p "$d"; echo '{}' >"$d/s.jsonl"
d=$HOME/.claude/projects/$(enc "$(top talk-locked)"); mkdir -p "$d"; echo '{}' >"$d/s.jsonl"; touch -d '10 days ago' "$d/s.jsonl" "$d"; chmod 000 "$d"
sleep 0.3

u=$(dirname "$wc_bin")/../systemd/user
grep -qx 'ExecStart=%h/.local/bin/worktree-clean --report' "$u/worktree-clean.service" && ! grep -q Persistent "$u/worktree-clean.timer" \
  && ok "the weekly unit only reports, and the timer does not catch up missed runs" || bad "systemd units"

mkdir -p "$t/noorca"; printf '#!/bin/sh\nexit 1\n' >"$t/noorca/orca-ide"; chmod +x "$t/noorca/orca-ide"
out=$(PATH=$t/noorca:$PATH "$wc_bin" --apply --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 1 ] && [ -d "$t/wt/clean" ] && echo "$out" | grep -q 'nothing done' && ok "Orca unreachable: nothing done and exit 1, even with --repo" || bad "without Orca: rc=$rc $out"

echo '{"repos": {"main": {"neverTouch": "keepme"}}}' >"$HOME/.config/nadavai/worktree-clean.json"
out=$("$wc_bin" --apply --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 1 ] && [ -d "$t/wt/keepme" ] && [ -d "$t/wt/clean" ] && echo "$out" | grep -q 'owner lists.*nothing done' \
  && ok "malformed owner list (a string where a list belongs): nothing done" || bad "malformed config: rc=$rc $out"
rm -f -- "${t:?}/home/.config/nadavai/worktree-clean.json"; ln -s "$t/nowhere.json" "$HOME/.config/nadavai/worktree-clean.json"
out=$("$wc_bin" --repo "$t/main" --dry-run 2>&1); rc=$?
rm -f -- "${t:?}/home/.config/nadavai/worktree-clean.json"; echo "$user" >"$HOME/.config/nadavai/worktree-clean.json"
[ "$rc" = 1 ] && echo "$out" | grep -q 'owner lists.*nothing done' && ok "a dangling symlink as the user's list: nothing done" || bad "dangling user list: rc=$rc $out"
mkdir -p "$t/tool/bin" "$t/tool/config"; cp "$wc_bin" "$t/tool/bin/"; n=0
for c in '' '{"sessionActiveDays": 0, "repos": {"x": {}}}' '{"sessionActiveDays": 3, "repos": {"x": {"neverTuch": ["a"]}}}' \
         '{"sessionActiveDays": 3, "neverTouchPaths": ["Desktop/x"], "repos": {"x": {}}}' \
         '{"sessionActiveDays": 3, "repos": {"x": {"neverTouch": ["a"]}, "x": {}}}'; do
  rm -f -- "${t:?}/tool/config/worktree-clean.json"; [ -z "$c" ] || echo "$c" >"$t/tool/config/worktree-clean.json"
  "$t/tool/bin/worktree-clean" --repo "$t/main" --dry-run 2>&1 | grep -q 'owner lists.*nothing done' && n=$((n+1))
done
[ "$n" = 5 ] && ok "shipped list missing, sessionActiveDays 0, an unknown key, a relative path or a duplicate key: nothing done" || bad "shipped list checks: $n of 5"
out=$("$wc_bin" --apply --repo "$t/wt/clean" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 1 ] && [ -d "$t/wt/clean" ] && echo "$out" | grep -q 'not a main checkout' && ok "--repo that is a linked worktree: nothing done" || bad "linked --repo: rc=$rc $out"

out=$("$wc_bin" --apply --repo "$t/main" 2>&1)
[ -d "$t/wt/clean" ] && [ -d "$t/wt/dirty" ] && [ -d "$t/wt/unpushed" ] && ok "default thresholds keep worktrees active today" || bad "a fresh worktree was removed: $out"
grep -q "\"path\": \"$t/wt/clean\".*\"result\": \"keep:recent\"" "$arch/log.jsonl" 2>/dev/null \
  && ok "--apply writes the log even when it removes nothing" || bad "no log after an --apply that removed nothing"

wt gone2; rm -rf -- "${t:?}/wt/gone2"
rm -f -- "${t:?}/home/.cache/worktree-clean.lock"
repos=(--repo "$t/main" --repo "$t/therapy-flow-v2" --repo "$t/sportchat-web" --repo "$t/nomain/sportchat-web")
fp() { for r in "$t/main" "$t/therapy-flow-v2" "$t/sportchat-web" "$t/nomain/sportchat-web"; do (cd "$r/.git" && find . -printf '%p %s %T@\n' | LC_ALL=C sort); done | sha1sum; }
files() { find "$HOME/Archive" "$HOME/.cache" -type f 2>/dev/null | LC_ALL=C sort; }
before=$(fp); files >"$t/files-before"
out=$("$wc_bin" "${repos[@]}" --dry-run --safe-days 0 --unsaved-days 0 2>&1)
[ -d "$t/wt/clean" ] && [ -d "$t/wt/dirty" ] && [ "$(files)" = "$(cat "$t/files-before")" ] && ok "--dry-run changes nothing" || bad "--dry-run changed something: $out"
[ "$(fp)" = "$before" ] && ok "--dry-run writes nothing into any repo (objects, refs, reflogs, indexes)" || bad "--dry-run wrote into a repo"
[ ! -e "$HOME/.cache/worktree-clean.lock" ] && ok "--dry-run creates no lock" || bad "--dry-run created the lock"
echo "$out" | grep -q "^would-prune $t/main: .*Removing worktrees/gone2" && ! echo "$out" | grep -q "prune $t/therapy-flow-v2" \
  && echo "$out" | grep -q "Removing worktrees/v4-merge-9: .* (protected: sportchat-web: v4-merge-\*)" \
  && ok "--dry-run shows what prune would remove (git prints it on stderr) and which entries are protected" || bad "prune output missing: $out"
echo "$out" | grep -q "^keep:owner-list (therapy-flow-v2: whole repo.* $t/tfwt/done$" && echo "$out" | grep -q "^keep:session-active (claude transcript .* $t/wt/talk-claude$" \
  && ok "--dry-run lists skipped worktrees with the reason" || bad "skip reasons missing: $out"

# the default (what the timer runs): only REPORT.md, nothing in any repo, no lock, one line on stdout
out=$("$wc_bin" "${repos[@]}" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 0 ] && [ "$(fp)" = "$before" ] && [ ! -e "$HOME/.cache/worktree-clean.lock" ] && [ -d "$t/wt/clean" ] \
  && [ "$(files | LC_ALL=C comm -13 "$t/files-before" -)" = "$arch/REPORT.md" ] && [ "$(echo "$out" | wc -l)" = 1 ] \
  && echo "$out" | grep -q "nothing removed, report: $arch/REPORT.md" \
  && ok "report mode (the default) writes only REPORT.md and one summary line: nothing in any repo, no lock" || bad "report mode: rc=$rc $out"
grep -q "^| $t/wt/clean | main | clean | .* | 0 | 0 | remove it" "$arch/REPORT.md" \
  && grep -q "^| $t/wt/unpushed | main | unpushed | .* | 1 | 0 | save the unsaved work" "$arch/REPORT.md" \
  && grep -q "^| $t/tfwt/done | therapy-flow-v2 | detached | owner-list (therapy-flow-v2: whole repo" "$arch/REPORT.md" \
  && grep -q "^- $t/main: Removing worktrees/gone2" "$arch/REPORT.md" \
  && ok "REPORT.md lists candidates (branch, activity, unique commits, what --apply would do), stale entries, keeps with reasons" || bad "REPORT.md content"

out=$("$wc_bin" --apply "${repos[@]}" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 0 ] && ok "--apply run exits 0" || bad "run exited $rc: $out"
[ ! -d "$t/wt/clean" ] && ok "clean worktree with a tracked coverage/ dir removed without --force" || bad "clean worktree kept: $out"
[ -d "$t/wt/busy" ] && ok "worktree with a process inside is kept" || bad "busy worktree removed"
[ ! -d "$t/wt/dirty" ] && [ ! -d "$t/wt/unpushed" ] && ok "unsaved worktrees removed after archiving" || bad "unsaved worktrees still there: $out"
[ -d "$t/wt/outer/.claude/worktrees/keepme" ] && echo "$out" | grep -q "^keep:contains-worktree ($t/wt/outer/.claude/worktrees/keepme) $t/wt/outer$" \
  && ok "a worktree with another registered worktree inside is kept" || bad "nested worktree: $out"
[ -d "$t/wt/ign-clone/.claude/scratch" ] && echo "$out" | grep -q "^keep:repo-in-ignored-dir (.claude/scratch) $t/wt/ign-clone$" \
  && ok "a worktree with a repo in an ignored folder is kept" || bad "repo in an ignored folder: $out"
[ -d "$t/wt/merging" ] && echo "$out" | grep -q "^keep:operation-in-progress (MERGE_HEAD) $t/wt/merging$" \
  && ok "a worktree with a merge in progress is kept" || bad "operation in progress: $out"
[ ! -d "$t/wt/amended" ] && git -C "$t/main" for-each-ref --format='%(objectname)' "refs/worktree-clean/$stamp/reflog/" | grep -qx "$c1" \
  && ok "a commit only the removed worktree's reflog reached is pinned" || bad "reflog tip not pinned: $out"
[ -d "$t/tfwt/done" ] && [ -e "$t/therapy-flow-v2/.git/worktrees/gone" ] \
  && ok "owner list: therapy-flow-v2 neither removed nor pruned, though the user's list says exclude: false" || bad "therapy-flow-v2 touched: $out"
[ -d "$t/scwt/v4-system" ] && [ ! -d "$t/scwt/v4-done" ] && ok "owner list: sportchat v4-system kept by name, a landed v4 lane removed" || bad "sportchat name rule: $out"
[ -d "$t/scwt/v4-lane" ] && echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4-\* with HEAD not in origin/main) $t/scwt/v4-lane$" \
  && ok "owner list: sportchat v4 lane whose HEAD is not in origin/main kept" || bad "unlanded v4 lane: $out"
[ -d "$t/scwt/lane-sys" ] && [ -d "$t/scwt/wt-quick" ] && echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4/\* with HEAD not in origin/main) $t/scwt/wt-quick$" \
  && ok "owner list: matched on a v4/<job> branch and on a part of the branch name" || bad "branch match: $out"
[ -d "$t/scwt/wt-rebase" ] && echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4/\* with HEAD not in origin/main) $t/scwt/wt-rebase$" \
  && ok "owner list: a lane detached mid-rebase still matches its v4/<job> branch" || bad "mid-rebase lane: $out"
echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4/\* with HEAD not in origin/main) $t/scwt/wt-moved$" \
  && echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4/\* with HEAD not in origin/main) $t/scwt/wt-points$" \
  && ok "owner list: a detached lane matches a branch named in its reflog, or one pointing at its HEAD" || bad "reflog or points-at branch: $out"
[ -d "$t/nomainwt/v4-x" ] && echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4-\* with HEAD not in origin/main) $t/nomainwt/v4-x$" \
  && ok "owner list: without origin/main a v4 lane counts as not landed" || bad "missing origin/main: $out"
[ ! -d "$t/scwt/orcawt" ] && grep -q '^worktree-clean: protected' "$t/sportchat-web/.git/worktrees/v4-merge-9/locked" \
  && [ ! -e "$t/sportchat-web/.git/worktrees/old-free" ] \
  && ok "before Orca's removal (which may prune) a protected stale entry is locked, an unprotected one is not" || bad "stale-entry lock: $out"
[ ! -e "$t/sportchat-web/.git/worktrees/lost-lane" ] && git -C "$t/sportchat-web" for-each-ref --format='%(objectname)' "refs/worktree-clean/$stamp/stale/" | grep -qx "$lost" \
  && ok "before Orca's removal a stale HEAD no ref reaches is pinned" || bad "stale HEAD not pinned: $out"
[ -d "$t/scwt/orca-busy" ] && echo "$out" | grep -q "^keep:orca-live (1 live terminals) $t/scwt/orca-busy$" \
  && ok "a worktree where Orca shows a live terminal is kept" || bad "Orca live terminal: $out"
[ ! -d "$t/scwt/remote-wt" ] && grep -q "/orcawt$" "$t/orca-rm.log" && ! grep -q remote-wt "$t/orca-rm.log" \
  && ok "only this host's Orca entries are removed through Orca" || bad "another host's Orca entry: $out"
[ -d "$HOME/Desktop/tf-513-x" ] && [ -d "$t/wt/keepme" ] && [ -d "$HOME/Desktop/keep-slash" ] \
  && ok "owner list: ~/Desktop/tf-513-* path, the user's own list, and a user path with a trailing slash kept" || bad "path or user list: $out"
[ -d "$HOME/Desktop/host-wt" ] && echo "$out" | grep -q "^keep:owner-list (~/Desktop/host-wt/planning/513 (inside)) $HOME/Desktop/host-wt$" \
  && ok "owner list: a listed path inside a worktree keeps the worktree" || bad "listed path inside: $out"
[ -d "$t/wt/talk-claude" ] && [ -d "$t/wt/talk-codex" ] && [ -d "$t/wt/talk-grok" ] && [ ! -d "$t/wt/stale" ] \
  && ok "recent Claude/Codex/Grok transcript keeps a worktree, a 10-day-old one does not" || bad "transcript activity: $out"
[ -d "$t/wt/talk-sub" ] && [ -d "$t/wt/talk-locked" ] && ok "a Claude session in a subfolder, or an unreadable transcript folder, keeps a worktree" || bad "subfolder or unreadable transcript: $out"
[ -e "$t/main/.git/worktrees/gone2" ] && grep -q 'Removing worktrees/gone2' "$arch/log.jsonl" \
  && ok "prune only reported in the log, never run (it would drop HEAD and reflog)" || bad "prune ran or was not logged"

ref=$(git -C "$t/main" for-each-ref --format='%(refname)' "refs/worktree-clean/$stamp/" | grep -v -e /heads/ -e /reflog/ | grep dirty)
if [ -n "$ref" ] && [ "$(git -C "$t/main" show "$ref:new.txt")" = new ] && git -C "$t/main" show "$ref:docs/coverage/index.md" | grep -q edit; then
  ok "snapshot ref holds the untracked file and the uncommitted edit"
else bad "snapshot ref missing or incomplete ($ref)"; fi
git -C "$t/main" for-each-ref "refs/worktree-clean/$stamp/heads/" | grep -q unpushed && ok "HEAD with a local-only commit is pinned" || bad "unpushed HEAD not pinned"
tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst 2>/dev/null | grep -qx .env.local && ok "ignored .env.local archived" || bad "ignored .env.local not in archive"
tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst 2>/dev/null | grep -qx build/x.secret && ok "ignored file inside a tracked build/ archived" || bad "build/x.secret not in archive"
tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst 2>/dev/null | grep -qx dist/.env.production && ! tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst | grep -qx dist/app.js && ok "secret inside an ignored dist/ archived, build output not" || bad "dist/ secret handling wrong"
[ -f "$t/wt/nested/sub/work.txt" ] && ok "worktree with changes in a nested repo is kept" || bad "nested-repo worktree removed"
[ "$(stat -c %a "$arch"/*dirty*.ignored.tar.zst)" = 600 ] && ok "archive is chmod 600" || bad "archive mode is not 600"
ls "$arch"/*unpushed*.bundle >/dev/null 2>&1 && git -C "$t/main" bundle verify -q "$arch"/*unpushed*.bundle 2>/dev/null && ok "bundle of the local-only commit verifies" || bad "no valid bundle for the unpushed worktree"
[ -f "$arch/README.md" ] && python3 -c 'import json, sys; [json.loads(l) for l in open(sys.argv[1])]' "$arch/log.jsonl" \
  && grep -q "\"path\": \"$t/wt/clean\".*\"result\": \"removing\"" "$arch/log.jsonl" \
  && ok "README and log (JSON Lines, with a removing line before each deletion) written" || bad "README or log missing"

# Orca answers rm without result.removed: not counted as removed
git -C "$t/sportchat-web" worktree add -q --detach "$t/scwt/orca-unsure" origin/main 2>/dev/null
out=$("$wc_bin" --apply --repo "$t/sportchat-web" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 1 ] && [ -d "$t/scwt/orca-unsure" ] && echo "$out" | grep -q "^remove-failed: .* $t/scwt/orca-unsure$" \
  && ok "an Orca reply without result.removed true counts as a failed removal" || bad "Orca removed flag: rc=$rc $out"

# the same path removed again the same day: the earlier pin is never overwritten, the worktree stays
pin=$(git -C "$t/main" for-each-ref --format='%(refname) %(objectname)' "refs/worktree-clean/$stamp/heads/" | grep unpushed)
git worktree add -q -b unpushed2 "$t/wt/unpushed" main 2>/dev/null; (cd "$t/wt/unpushed" && echo d >d.txt && git add d.txt && git commit -qm again)
out=$("$wc_bin" --apply --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 1 ] && [ -d "$t/wt/unpushed" ] && [ "$(git -C "$t/main" for-each-ref --format='%(refname) %(objectname)' "refs/worktree-clean/$stamp/heads/" | grep unpushed)" = "$pin" ] \
  && echo "$out" | grep -q "^error: git update-ref" && ok "a same-day rerun never overwrites a saved ref" || bad "same-day rerun: rc=$rc $out"

# SIGTERM during a removal: the run stops, and the log already says what it was removing
wt sigwt; mkdir -p "$t/wt/sigwt/node_modules/y"
mkdir -p "$t/slow"; printf '#!/bin/sh\nkill -TERM "$PPID"; sleep 5\n' >"$t/slow/ionice"; chmod +x "$t/slow/ionice"
n0=$(wc -l <"$arch/log.jsonl")
out=$(PATH=$t/slow:$PATH "$wc_bin" --apply --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 143 ] && [ -d "$t/wt/sigwt" ] && tail -n +$((n0 + 1)) "$arch/log.jsonl" | grep -q "\"path\": \"$t/wt/sigwt\".*\"result\": \"removing\"" \
  && [ "$(wc -l <"$arch/log.jsonl")" -ge $((n0 + 2)) ] && ok "SIGTERM stops the run and the log still gets written" || bad "SIGTERM: rc=$rc $out"

# a repo whose `git worktree list` fails is logged as an error, and the next repo still runs
mkdir -p "$t/gitwrap"; printf '#!/bin/sh\ncase "$*" in *broken*"worktree list"*) exit 128;; esac\nexec %s "$@"\n' "$(command -v git)" >"$t/gitwrap/git"
chmod +x "$t/gitwrap/git"; git init -q "$t/broken"; wt late
out=$(PATH=$t/gitwrap:$PATH "$wc_bin" --apply --repo "$t/broken" --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 1 ] && [ ! -d "$t/wt/late" ] && grep -q "error: git worktree in $t/broken" "$arch/log.jsonl" \
  && ok "a failing repo is logged as an error and the next one still runs" || bad "per-repo failure: rc=$rc $out"
exit $fail
