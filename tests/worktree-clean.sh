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
unset ORCA_CLI_COMMAND
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
sleep 0.3

mkdir -p "$t/noorca"; printf '#!/bin/sh\nexit 1\n' >"$t/noorca/orca-ide"; chmod +x "$t/noorca/orca-ide"
out=$(PATH=$t/noorca:$PATH "$wc_bin" --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 0 ] && [ -d "$t/wt/clean" ] && echo "$out" | grep -q 'nothing done' && ok "Orca unreachable: nothing done, even with --repo" || bad "without Orca: rc=$rc $out"

out=$("$wc_bin" --repo "$t/main" 2>&1)
[ -d "$t/wt/clean" ] && [ -d "$t/wt/dirty" ] && [ -d "$t/wt/unpushed" ] && ok "default thresholds keep worktrees active today" || bad "a fresh worktree was removed: $out"

out=$("$wc_bin" --repo "$t/main" --dry-run --safe-days 0 --unsaved-days 0 2>&1)
[ -d "$t/wt/clean" ] && [ -d "$t/wt/dirty" ] && ! [ -d "$HOME/Archive" ] && ok "--dry-run changes nothing" || bad "--dry-run changed something: $out"

out=$("$wc_bin" --repo "$t/main" --safe-days 0 --unsaved-days 0 2>&1); rc=$?
[ "$rc" = 0 ] && ok "run exits 0" || bad "run exited $rc: $out"
[ ! -d "$t/wt/clean" ] && ok "clean worktree with a tracked coverage/ dir removed without --force" || bad "clean worktree kept: $out"
[ -d "$t/wt/busy" ] && ok "worktree with a process inside is kept" || bad "busy worktree removed"
[ ! -d "$t/wt/dirty" ] && [ ! -d "$t/wt/unpushed" ] && ok "unsaved worktrees removed after archiving" || bad "unsaved worktrees still there: $out"

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
