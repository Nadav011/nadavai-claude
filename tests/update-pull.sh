#!/usr/bin/env bash
# tests/update-pull.sh: pull_repo (lib/common.sh), the first step of update.sh, on made-up
# repositories. An uncommitted file in the checkout must not hold it back (the plugin is installed
# from GitHub, rules and settings from the checkout), the file must stay exactly as it was, and
# when the checkout cannot be brought up to date the script must stop instead of installing.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

# The git settings of the real machines, which make a plain `git pull` stash and re-apply.
printf '[user]\n\tname = t\n\temail = t@example.invalid\n[pull]\n\trebase = true\n[rebase]\n\tautostash = true\n[init]\n\tdefaultBranch = main\n' >"$t/gitconfig"
export GIT_CONFIG_GLOBAL="$t/gitconfig" GIT_CONFIG_NOSYSTEM=1
g() { git -C "$1" "${@:2}" >/dev/null 2>&1; }

fresh() { # an origin with one commit, a checkout of it, then one more commit upstream that changes a.txt
  rm -rf -- "${t:?}/origin.git" "${t:?}/src" "${t:?}/co"
  git init -q --bare "$t/origin.git"
  git clone -q "$t/origin.git" "$t/src" 2>/dev/null
  mkdir -p "$t/src/lib"; cp "$here/lib/common.sh" "$t/src/lib/common.sh"
  echo one >"$t/src/a.txt"; echo one >"$t/src/b.txt"
  g "$t/src" add -A; g "$t/src" commit -m first; g "$t/src" push origin HEAD:main
  git clone -q "$t/origin.git" "$t/co" 2>/dev/null
  echo two >"$t/src/a.txt"; g "$t/src" commit -am second; g "$t/src" push origin HEAD:main
  want=$(git -C "$t/src" rev-parse HEAD); had=$(git -C "$t/co" rev-parse HEAD)
}
run() { REPO="$t/co" HOME="$t" bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; pull_repo; echo reached-the-end' 2>&1; }
head_of() { git -C "$t/co" rev-parse HEAD; }

fresh; out=$(run); rc=$?
ok "a clean checkout is pulled"                              '[ "$rc" = 0 ] && [ "$(head_of)" = "$want" ]'

fresh; echo mine >"$t/co/b.txt"; echo new >"$t/co/untracked.txt"
out=$(run); rc=$?
ok "a checkout with an unsaved change in another file is pulled too" '[ "$rc" = 0 ] && [ "$(head_of)" = "$want" ] && grep -q "reached-the-end" <<<"$out"'
ok "the unsaved change and the untracked file stay as they were" '[ "$(cat "$t/co/b.txt")" = mine ] && [ "$(cat "$t/co/untracked.txt")" = new ]'
ok "nothing was stashed on the way"                          '[ -z "$(git -C "$t/co" stash list)" ]'
ok "it says the changes were left as they are"               'grep -q "left as they are" <<<"$out"'

fresh; echo mine >"$t/co/a.txt"
out=$(run); rc=$?
ok "an unsaved change in a file the new commit also changes stops the script" '[ "$rc" != 0 ] && ! grep -q "reached-the-end" <<<"$out"'
ok "the checkout did not move and the change is intact"      '[ "$(head_of)" = "$had" ] && [ "$(cat "$t/co/a.txt")" = mine ] && [ -z "$(git -C "$t/co" stash list)" ]'
ok "the message says nothing was updated"                    'grep -q "nothing was updated" <<<"$out"'

fresh; g "$t/co" pull --ff-only; echo mine >"$t/co/b.txt"
out=$(run); rc=$?
ok "an up-to-date checkout with an unsaved change is fine"   '[ "$rc" = 0 ] && [ "$(head_of)" = "$want" ] && [ "$(cat "$t/co/b.txt")" = mine ]'

fresh; g "$t/co" remote set-url origin "$t/missing.git"
out=$(run); rc=$?
ok "a clean checkout whose origin cannot be reached stops the script" '[ "$rc" != 0 ] && ! grep -q "reached-the-end" <<<"$out"'
echo mine >"$t/co/b.txt"; out=$(run); rc=$?
ok "and so does one with an unsaved change"                  '[ "$rc" != 0 ] && ! grep -q "reached-the-end" <<<"$out"'

ok "update.sh pulls through pull_repo before the marketplace step" \
  '[ "$(grep -n -m1 "^pull_repo$" "$here/update.sh" | cut -d: -f1)" -lt "$(grep -n -m1 "^step \"Marketplace\"" "$here/update.sh" | cut -d: -f1)" ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
