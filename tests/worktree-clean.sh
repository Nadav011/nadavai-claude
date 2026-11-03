#!/usr/bin/env bash
# Tests for bin/worktree-clean on throwaway repos, with HOME in a temp dir and a fake `orca` on
# PATH, so no real worktree, archive or Orca state is touched.
#   tests/worktree-clean.sh [path to worktree-clean, default ../bin/worktree-clean]
set -u
wc_bin=$(realpath "${1:-$(dirname "$0")/../bin/worktree-clean}")
t=$(mktemp -d) || exit 1
sleeper=
trap '[ -n "$sleeper" ] && kill "$sleeper" 2>/dev/null; rm -rf -- "$t"' EXIT
export HOME=$t/home GIT_CONFIG_GLOBAL=$t/gitconfig GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME" "$t/fakebin"
printf '#!/bin/sh\necho "{\\"result\\":{\\"worktrees\\":[]}}"\n' >"$t/fakebin/orca-ide"; chmod +x "$t/fakebin/orca-ide"
export PATH=$t/fakebin:$PATH
unset ORCA_CLI_COMMAND XDG_CONFIG_HOME CODEX_HOME
git config --global user.email t@t; git config --global user.name t; git config --global init.defaultBranch main
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

git init -q --bare "$t/remote.git"
git clone -q "$t/remote.git" "$t/main" 2>/dev/null
cd "$t/main" || exit 1
mkdir -p docs/coverage build; echo report >docs/coverage/index.md; echo tracked >build/keep.txt
printf 'node_modules/\ndist/\n.env.local\n*.secret\n' >.gitignore
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
# owner lists in config/worktree-clean.json: by repo name, by worktree name, by path; plus the user's own file
git clone -q "$t/remote.git" "$t/therapy-flow-v2" 2>/dev/null
git -C "$t/therapy-flow-v2" worktree add -q --detach "$t/tfwt/done" origin/main 2>/dev/null
git -C "$t/therapy-flow-v2" worktree add -q --detach "$t/tfwt/gone" origin/main 2>/dev/null; rm -rf -- "${t:?}/tfwt/gone"
git clone -q "$t/remote.git" "$t/sportchat-web" 2>/dev/null
for n in v4-system v4-lane v4-done; do git -C "$t/sportchat-web" worktree add -q --detach "$t/scwt/$n" origin/main 2>/dev/null; done
(cd "$t/scwt/v4-lane" && echo l >l.txt && git add l.txt && git commit -qm lane && git push -q origin HEAD:refs/heads/v4-lane 2>/dev/null && git fetch -q origin)
git worktree add -q -b tf513 "$HOME/Desktop/tf-513-x" main 2>/dev/null
mkdir -p "$HOME/.config/nadavai"; echo '{"repos": {"main": {"neverTouch": ["keepme"]}}}' >"$HOME/.config/nadavai/worktree-clean.json"
wt keepme
# a Claude (Orca profile), Codex (session in a subfolder) or Grok transcript of the path changed lately; an old one does not count
for n in talk-claude talk-codex talk-grok stale; do wt "$n"; done
top() { git -C "$t/wt/$1" rev-parse --show-toplevel; }
enc() { printf '%s' "$1" | tr -c 'A-Za-z0-9' '-'; }
d=$HOME/.config/orca/claude-profiles/p1/home/projects/$(enc "$(top talk-claude)"); mkdir -p "$d"; echo '{}' >"$d/s.jsonl"
mkdir -p "$HOME/.codex/sessions/2026/11/03"; printf '{"type":"session_meta","payload":{"cwd":"%s/sub"}}\n{}\n' "$(top talk-codex)" >"$HOME/.codex/sessions/2026/11/03/rollout-t.jsonl"
d=$HOME/.grok/sessions/$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$(top talk-grok)")/s1; mkdir -p "$d"; echo '{}' >"$d/updates.jsonl"
d=$HOME/.claude/projects/$(enc "$(top stale)"); mkdir -p "$d"; echo '{}' >"$d/s.jsonl"; touch -d '10 days ago' "$d/s.jsonl" "$d"
sleep 0.3

mkdir -p "$t/noorca"; printf '#!/bin/sh\nexit 1\n' >"$t/noorca/orca-ide"; chmod +x "$t/noorca/orca-ide"
out=$(PATH=$t/noorca:$PATH "$wc_bin" --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 0 ] && [ -d "$t/wt/clean" ] && echo "$out" | grep -q 'nothing done' && ok "Orca unreachable: nothing done, even with --repo" || bad "without Orca: rc=$rc $out"

out=$("$wc_bin" --repo "$t/main" 2>&1)
[ -d "$t/wt/clean" ] && [ -d "$t/wt/dirty" ] && [ -d "$t/wt/unpushed" ] && ok "default thresholds keep worktrees active today" || bad "a fresh worktree was removed: $out"

wt gone2; rm -rf -- "${t:?}/wt/gone2"
rm -f -- "${t:?}/home/.cache/worktree-clean.lock"
repos=(--repo "$t/main" --repo "$t/therapy-flow-v2" --repo "$t/sportchat-web")
fp() { for r in "$t/main" "$t/therapy-flow-v2" "$t/sportchat-web"; do (cd "$r/.git" && find . -printf '%p %s %T@\n' | LC_ALL=C sort); done | sha1sum; }
before=$(fp)
out=$("$wc_bin" "${repos[@]}" --dry-run --safe-days 0 --unsaved-days 0 2>&1)
[ -d "$t/wt/clean" ] && [ -d "$t/wt/dirty" ] && ! [ -d "$HOME/Archive" ] && ok "--dry-run changes nothing" || bad "--dry-run changed something: $out"
[ "$(fp)" = "$before" ] && ok "--dry-run writes nothing into any repo (objects, refs, reflogs, indexes)" || bad "--dry-run wrote into a repo"
[ ! -e "$HOME/.cache/worktree-clean.lock" ] && ok "--dry-run creates no lock" || bad "--dry-run created the lock"
echo "$out" | grep -q "^would-prune $t/main: Removing worktrees/gone2" && ! echo "$out" | grep -q "prune $t/therapy-flow-v2" \
  && ok "--dry-run shows what prune would remove (git prints it on stderr)" || bad "prune output missing: $out"
echo "$out" | grep -q "^keep:owner-list (therapy-flow-v2: whole repo.* $t/tfwt/done$" && echo "$out" | grep -q "^keep:session-active (claude transcript .* $t/wt/talk-claude$" \
  && ok "--dry-run lists skipped worktrees with the reason" || bad "skip reasons missing: $out"

out=$("$wc_bin" "${repos[@]}" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 0 ] && ok "run exits 0" || bad "run exited $rc: $out"
[ ! -d "$t/wt/clean" ] && ok "clean worktree with a tracked coverage/ dir removed without --force" || bad "clean worktree kept: $out"
[ -d "$t/wt/busy" ] && ok "worktree with a process inside is kept" || bad "busy worktree removed"
[ ! -d "$t/wt/dirty" ] && [ ! -d "$t/wt/unpushed" ] && ok "unsaved worktrees removed after archiving" || bad "unsaved worktrees still there: $out"
[ -d "$t/tfwt/done" ] && [ -e "$t/therapy-flow-v2/.git/worktrees/gone" ] && ok "owner list: therapy-flow-v2 neither removed nor pruned" || bad "therapy-flow-v2 touched: $out"
[ -d "$t/scwt/v4-system" ] && [ ! -d "$t/scwt/v4-done" ] && ok "owner list: sportchat v4-system kept by name, a landed v4 lane removed" || bad "sportchat name rule: $out"
[ -d "$t/scwt/v4-lane" ] && echo "$out" | grep -q "^keep:owner-list (sportchat-web: v4-\* with HEAD not in origin/main) $t/scwt/v4-lane$" \
  && ok "owner list: sportchat v4 lane whose HEAD is not in origin/main kept" || bad "unlanded v4 lane: $out"
[ -d "$HOME/Desktop/tf-513-x" ] && [ -d "$t/wt/keepme" ] && ok "owner list: ~/Desktop/tf-513-* path and the user's own list kept" || bad "path or user list: $out"
[ -d "$t/wt/talk-claude" ] && [ -d "$t/wt/talk-codex" ] && [ -d "$t/wt/talk-grok" ] && [ ! -d "$t/wt/stale" ] \
  && ok "recent Claude/Codex/Grok transcript keeps a worktree, a 10-day-old one does not" || bad "transcript activity: $out"
[ ! -e "$t/main/.git/worktrees/gone2" ] && grep -q 'Removing worktrees/gone2' "$HOME/Archive/worktree-clean/$(date +%F)/log.json" \
  && ok "prune ran and its output is in the log" || bad "prune not logged"

stamp=$(date +%F)
ref=$(git -C "$t/main" for-each-ref --format='%(refname)' "refs/worktree-clean/$stamp/" | grep -v /heads/ | grep dirty)
if [ -n "$ref" ] && [ "$(git -C "$t/main" show "$ref:new.txt")" = new ] && git -C "$t/main" show "$ref:docs/coverage/index.md" | grep -q edit; then
  ok "snapshot ref holds the untracked file and the uncommitted edit"
else bad "snapshot ref missing or incomplete ($ref)"; fi
git -C "$t/main" for-each-ref "refs/worktree-clean/$stamp/heads/" | grep -q unpushed && ok "HEAD with a local-only commit is pinned" || bad "unpushed HEAD not pinned"
arch=$HOME/Archive/worktree-clean/$stamp
tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst 2>/dev/null | grep -qx .env.local && ok "ignored .env.local archived" || bad "ignored .env.local not in archive"
tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst 2>/dev/null | grep -qx build/x.secret && ok "ignored file inside a tracked build/ archived" || bad "build/x.secret not in archive"
tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst 2>/dev/null | grep -qx dist/.env.production && ! tar --zstd -tf "$arch"/*dirty*.ignored.tar.zst | grep -qx dist/app.js && ok "secret inside an ignored dist/ archived, build output not" || bad "dist/ secret handling wrong"
[ -f "$t/wt/nested/sub/work.txt" ] && ok "worktree with changes in a nested repo is kept" || bad "nested-repo worktree removed"
[ "$(stat -c %a "$arch"/*dirty*.ignored.tar.zst)" = 600 ] && ok "archive is chmod 600" || bad "archive mode is not 600"
ls "$arch"/*unpushed*.bundle >/dev/null 2>&1 && git -C "$t/main" bundle verify -q "$arch"/*unpushed*.bundle 2>/dev/null && ok "bundle of the local-only commit verifies" || bad "no valid bundle for the unpushed worktree"
[ -f "$arch/README.md" ] && [ -f "$arch/log.json" ] && ok "README and log written" || bad "README or log missing"
exit $fail
