#!/usr/bin/env bash
# tests/omc-upstream-news.sh: bin/omc-upstream-news against a made-up upstream repo on disk. Nothing
# here reaches the network or the real home.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

export HOME="$t/home"; mkdir -p "$HOME"
up="$t/upstream"; mkdir -p "$up/skills/taken" "$up/skills/quiet" "$up/skills/other"
g() { git -C "$up" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false "$@"; }
g init -q -b main
echo one >"$up/skills/taken/SKILL.md"; echo one >"$up/skills/quiet/SKILL.md"; echo one >"$up/skills/other/SKILL.md"
g add -A; g commit -q -m base
base=$(g rev-parse HEAD)
vend="$t/VENDORED.md"
printf '%s\n' '| Folder | Upstream | Commit | Local changes |' '|---|---|---|---|' \
  "| taken, quiet | https://github.com/Yeachan-Heo/oh-my-claudecode (\`skills/\`), version 1 | $base | none |" >"$vend"
run() { OMC_UPSTREAM_URL="$up" OMC_UPSTREAM_CLONE="$t/clone" OMC_VENDORED_FILE="$vend" bash "$here/bin/omc-upstream-news" "$@" 2>&1; }
state="$HOME/.local/state/nadavai/omc-upstream-news.txt"

out=$(run); rc=$?
ok "nothing new upstream: it says none twice"   '[ "$rc" = 0 ] && [ "$(grep -c "^  none$" <<<"$out")" = 2 ] && grep -q ", 0 commits later" <<<"$out"'
ok "the report is written to the state file"    'grep -q "0 commits later" "$state"'

echo two >>"$up/skills/taken/SKILL.md"; g commit -q -am "taken changes"
echo two >>"$up/skills/other/SKILL.md"; g commit -q -am "a skill we did not take changes"
mkdir -p "$up/skills/brandnew"; echo one >"$up/skills/brandnew/SKILL.md"; g add -A; g commit -q -m "a new skill"
out=$(run); rc=$?
ok "a skill we took that changed is named with its count" '[ "$rc" = 0 ] && grep -q "^  taken: 1 commits$" <<<"$out"'
ok "a skill we took that did not change is not named"     '! grep -q "quiet:" <<<"$out"'
ok "a skill we did not take is not named as changed"      '! grep -q "other:" <<<"$out"'
ok "a new skill upstream is named"                        'grep -q "^  brandnew$" <<<"$out"'
ok "it counts every commit since the copy"                'grep -q ", 3 commits later" <<<"$out"'

printf '%s\n' '| a | https://example.invalid/x | none |' >"$vend"
out=$(run); rc=$?
ok "no row for the upstream repo fails with a message"    '[ "$rc" = 1 ] && grep -q "no oh-my-claudecode row" <<<"$out"'
printf '%s\n' "| taken | https://github.com/Yeachan-Heo/oh-my-claudecode | $base | none |" >"$vend"
out=$(OMC_UPSTREAM_URL="$t/nowhere" OMC_UPSTREAM_CLONE="$t/clone2" OMC_VENDORED_FILE="$vend" bash "$here/bin/omc-upstream-news" 2>&1); rc=$?
ok "an upstream that cannot be read fails with a message" '[ "$rc" = 1 ] && grep -q "could not clone" <<<"$out"'
out=$(run --nope); rc=$?
ok "an unknown option is refused"                         '[ "$rc" = 2 ]'
ok "the repo's own VENDORED.md has the row the script reads" 'grep -F "github.com/Yeachan-Heo/oh-my-claudecode" "$here/plugins/nadavai/skills/VENDORED.md" | grep "^|" | head -n 1 | grep -qE "\b[0-9a-f]{40}\b"'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
