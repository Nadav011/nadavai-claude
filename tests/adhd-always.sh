#!/usr/bin/env bash
# tests/adhd-always.sh: enable_adhd_always (lib/common.sh) on a made-up home. The i-have-adhd
# plugin reads its always-on file from the config dir a session runs in, so the file has to be
# in ~/.claude and in every Orca profile, and setup.sh and update.sh both have to make it.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

p="$t/.config/orca/claude-profiles"
mkdir -p "$t/.claude" "$p/aaa/home" "$p/bbb/home" "$p/no-home" "$p/locked/home" "$p/zzz/home"
echo keep >"$p/bbb/home/.i-have-adhd-always"
touch -d '2026-01-01 00:00:00' "$p/bbb/home/.i-have-adhd-always"
chmod 555 "$p/locked/home"   # a profile that cannot be written to, sorted before zzz
: >"$p/not-a-profile"
run() { REPO="$here" HOME="$t" bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; enable_adhd_always' 2>&1; }

out=$(run); rc=$?
ok "it ends cleanly"                                   '[ "$rc" = 0 ]'
ok "the file is made in ~/.claude"                     '[ -e "$t/.claude/.i-have-adhd-always" ]'
ok "and in an Orca profile that lacked it"             '[ -e "$p/aaa/home/.i-have-adhd-always" ]'
ok "a file that is already there is left as it is, its time too" \
  '[ "$(cat "$p/bbb/home/.i-have-adhd-always")" = keep ] && [ "$(date -r "$p/bbb/home/.i-have-adhd-always" +%Y)" = 2026 ] && [ "$(date -r "$p/bbb/home/.i-have-adhd-always" +%m%d)" = 0101 ]'
ok "a profile that cannot be written to is a warning that names it" 'grep -q "could not turn i-have-adhd always-on in $p/locked/home" <<<"$out"'
ok "and the profiles after it still get the file"      '[ -e "$p/zzz/home/.i-have-adhd-always" ]'
ok "a profile folder with no home gets nothing made"   '[ ! -e "$p/no-home/home" ]'
chmod 755 "$p/locked/home"; rm -f -- "$p/locked/home/.i-have-adhd-always"; rmdir "$p/locked/home" "$p/locked"
out=$(run); rc=$?
ok "a second run changes nothing and says nothing"     '[ "$rc" = 0 ] && [ -z "$out" ]'
rm -rf -- "${t:?}/.config"; rm -f -- "$t/.claude/.i-have-adhd-always"
out=$(run); rc=$?
ok "a machine with no Orca profiles still gets the file in ~/.claude" '[ "$rc" = 0 ] && [ -e "$t/.claude/.i-have-adhd-always" ]'

ok "setup.sh calls it"  'grep -qx "enable_adhd_always" "$here/setup.sh"'
ok "update.sh calls it" 'grep -qx "enable_adhd_always" "$here/update.sh"'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
