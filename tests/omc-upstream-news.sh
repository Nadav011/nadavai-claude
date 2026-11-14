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
g config uploadpack.allowFilter true   # so that the file:// clone below is a real blob-less clone
echo one >"$up/skills/taken/SKILL.md"; echo one >"$up/skills/quiet/SKILL.md"; echo one >"$up/skills/other/SKILL.md"
g add -A; g commit -q -m base
base=$(g rev-parse HEAD)
vend="$t/VENDORED.md"
printf '%s\n' '| Folder | Upstream | Commit | Local changes |' '|---|---|---|---|' \
  "| taken, quiet | https://github.com/Yeachan-Heo/oh-my-claudecode (\`skills/\`), version 1 | $base | none |" >"$vend"
# A made-up notify-send that records each call.
fake="$t/fakebin"; mkdir -p "$fake"; printf '#!/bin/sh\necho called >>"%s"\n' "$t/notified" >"$fake/notify-send"; chmod +x "$fake/notify-send"
run() { PATH="$fake:$PATH" OMC_UPSTREAM_TRIES=1 OMC_UPSTREAM_PAUSE=0 OMC_UPSTREAM_URL="file://$up" OMC_UPSTREAM_CLONE="$t/clone" OMC_VENDORED_FILE="$vend" \
  bash "$here/bin/omc-upstream-news" "$@" 2>&1; }
calls() { if [ -f "$t/notified" ]; then wc -l <"$t/notified"; else echo 0; fi; }
state="$HOME/.local/state/nadavai/omc-upstream-news.txt"

out=$(run --notify); rc=$?
ok "the clone is blob-less (a partial clone)"   '[ "$(git -C "$t/clone" config remote.origin.partialclonefilter)" = "blob:none" ] && [ "$(git -C "$t/clone" rev-list --objects --missing=print main | grep -c "^?")" -gt 0 ]'
ok "nothing changed: no notification"           '[ "$(calls)" = 0 ]'
missing() { git -C "$t/clone" rev-list --objects --missing=print main | grep -c "^?"; }
m1=$(missing)
ok "nothing new upstream: it says none twice"   '[ "$rc" = 0 ] && [ "$(grep -c "^  none$" <<<"$out")" = 2 ] && grep -q ", 0 commits later" <<<"$out"'
ok "the report is written to the state file"    'grep -q "0 commits later" "$state"'

echo two >>"$up/skills/taken/SKILL.md"; g commit -q -am "taken changes"
echo two >>"$up/skills/other/SKILL.md"; g commit -q -am "a skill we did not take changes"
mkdir -p "$up/skills/brandnew"; echo one >"$up/skills/brandnew/SKILL.md"; g add -A; g commit -q -m "a new skill"
out=$(run --notify); rc=$?
ok "changed and new skills: one notification"   '[ "$(calls)" = 1 ]'
ok "a later fetch stays blob-less (the new files' contents are not downloaded)" '[ "$(missing)" -gt "$m1" ]'
ok "a skill we took that changed is named with its count" '[ "$rc" = 0 ] && grep -q "^  taken: 1 commits$" <<<"$out"'
ok "a skill we took that did not change is not named"     '! grep -q "quiet:" <<<"$out"'
ok "a skill we did not take is not named as changed"      '! grep -q "other:" <<<"$out"'
ok "a new skill upstream is named"                        'grep -q "^  brandnew$" <<<"$out"'
ok "it counts every commit since the copy"                'grep -q ", 3 commits later" <<<"$out"'

echo more >>"$up/README"; g add -A; g commit -q -m "a commit outside skills"
out=$(run --notify); rc=$?
ok "a later commit outside skills: counted, and no second notification" 'grep -q ", 4 commits later" <<<"$out" && [ "$(calls)" = 1 ]'

# Upstream that cannot be read, or that lost its shape, fails and keeps the last report.
keep=$(cat "$state")
out=$(PATH="$fake:$PATH" OMC_UPSTREAM_TRIES=2 OMC_UPSTREAM_PAUSE=0 OMC_UPSTREAM_URL="file://$t/nowhere" OMC_UPSTREAM_CLONE="$t/clone" OMC_VENDORED_FILE="$vend" bash "$here/bin/omc-upstream-news" 2>&1); rc=$?
ok "a fetch that fails on an existing clone fails with a message" '[ "$rc" = 1 ] && grep -q "could not read .* (tried 2 times)" <<<"$out"'
ok "and the last report is left as it was"      '[ "$(cat "$state")" = "$keep" ]'
ok "a failed run without --notify sends nothing" '[ "$(calls)" = 1 ]'
out=$(PATH="$fake:$PATH" OMC_UPSTREAM_TRIES=1 OMC_UPSTREAM_PAUSE=0 OMC_UPSTREAM_URL="file://$t/nowhere" OMC_UPSTREAM_CLONE="$t/clone" OMC_VENDORED_FILE="$vend" bash "$here/bin/omc-upstream-news" --notify 2>&1); rc=$?
ok "a failed run started by the timer notifies that no report was made" '[ "$rc" = 1 ] && [ "$(calls)" = 2 ]'
g mv skills moved; g commit -q -m "the skills folder moves"
out=$(run); rc=$?
ok "upstream without a skills folder fails, it does not say none" '[ "$rc" = 1 ] && grep -q "no skills/ folder any more" <<<"$out" && [ "$(cat "$state")" = "$keep" ]'
g mv moved skills; g commit -q -m "back"
other=$(g commit-tree -m orphan "$(g rev-parse "HEAD^{tree}")")
printf '%s\n' "| taken | https://github.com/Yeachan-Heo/oh-my-claudecode | $other | none |" >"$vend"
out=$(run); rc=$?
ok "a commit that is not in main's history fails" '[ "$rc" = 1 ] && grep -q "not in the history" <<<"$out"'
printf '%s\n' "|  | https://github.com/Yeachan-Heo/oh-my-claudecode | $base | none |" >"$vend"
out=$(run); rc=$?
ok "a row with no folder names fails"           '[ "$rc" = 1 ] && grep -q "no oh-my-claudecode row" <<<"$out"'

printf '%s\n' '| a | https://example.invalid/x | none |' >"$vend"
out=$(run); rc=$?
ok "no row for the upstream repo fails with a message"    '[ "$rc" = 1 ] && grep -q "no oh-my-claudecode row" <<<"$out"'
printf '%s\n' "| taken | https://github.com/Yeachan-Heo/oh-my-claudecode | $base | none |" >"$vend"
out=$(OMC_UPSTREAM_TRIES=1 OMC_UPSTREAM_PAUSE=0 OMC_UPSTREAM_URL="file://$t/nowhere" OMC_UPSTREAM_CLONE="$t/clone2" OMC_VENDORED_FILE="$vend" bash "$here/bin/omc-upstream-news" 2>&1); rc=$?
ok "an upstream that cannot be cloned fails with a message" '[ "$rc" = 1 ] && grep -q "could not read" <<<"$out"'
out=$(run --nope); rc=$?
ok "the service does not record a failed run as a success" '[ -f "$here/systemd/user/omc-upstream-news.service" ] && ! grep -qE "^[[:space:]]*SuccessExitStatus" "$here/systemd/user/omc-upstream-news.service"'
ok "an unknown option is refused"                         '[ "$rc" = 2 ]'
real_row=$(grep -F "github.com/Yeachan-Heo/oh-my-claudecode" "$here/plugins/nadavai/skills/VENDORED.md" | grep "^|" | head -n 1)
ok "the repo's own VENDORED.md row has a commit" 'grep -qE "\b[0-9a-f]{40}\b" <<<"$real_row"'
ok "and folder names in its first column, each a skill folder of ours" \
  '( names=$(cut -d"|" -f2 <<<"$real_row" | tr "," "\n" | sed "s/[[:space:]]//g" | grep -v "^$"); [ -n "$names" ] && while read -r n; do [ -d "$here/plugins/nadavai/skills/$n" ] || exit 1; done <<<"$names" )'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
