#!/usr/bin/env bash
# tests/my-menu.sh: the Ctrl+P menu of the /my-* prompts (mods/my-menu) and how it is installed.
# Three parts: lib/keybind.mjs adds the key and loses nothing that is in a keybindings.json,
# link_my_menu reaches every account profile of a made-up home, and the menu's order names the
# prompts that exist. With `claude` on PATH it also validates the mod and runs the mod's own tests.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
KB="$here/lib/keybind.mjs"
MOD="$here/mods/my-menu"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
bind() { node "$KB" "$1" Chat 'ctrl+p=command:my-menu' 'ctrl+shift+p=command:my-menu'; }
# shellcheck disable=SC2329  # called inside the eval of ok()
has() { jq -e --arg k "$2" --arg v "$3" '.bindings[] | select(.context == "Chat") | .bindings[$k] == $v' "$1" >/dev/null 2>&1; }
# The file Orca writes into each account profile.
orca='{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+alt+g": "command:orca-agent-view"
      }
    }
  ]
}'

# 1. No file yet: it is made, private, with both keys.
f="$t/new/keybindings.json"; mkdir -p "$t/new"
bind "$f" >/dev/null
ok "new file: ctrl+p bound"        'has "$f" "ctrl+p" "command:my-menu"'
ok "new file: ctrl+shift+p bound"  'has "$f" "ctrl+shift+p" "command:my-menu"'
ok "new file: mode 600"            '[ "$(stat -c %a "$f")" = 600 ]'

# 2. Orca's file: its key stays, ours are added, the mode stays.
f="$t/orca.json"; printf '%s\n' "$orca" > "$f"; chmod 600 "$f"
bind "$f" >/dev/null
ok "orca file: its key kept"       'has "$f" "ctrl+alt+g" "command:orca-agent-view"'
ok "orca file: ctrl+p added"       'has "$f" "ctrl+p" "command:my-menu"'
ok "orca file: one Chat block"     '[ "$(jq "[.bindings[] | select(.context == \"Chat\")] | length" "$f")" = 1 ]'
ok "orca file: mode kept"          '[ "$(stat -c %a "$f")" = 600 ]'

# 3. A second run changes nothing and says nothing.
before=$(sha256sum < "$f"); out=$(bind "$f")
ok "second run: file unchanged"    '[ "$(sha256sum < "$f")" = "$before" ]'
ok "second run: silent"            '[ -z "$out" ]'
ok "no temporary file left"        '[ -z "$(find "$t" -name "*.nadavai-tmp")" ]'

# 4. A key he bound to something else wins, in any spelling; the other key is still added.
f="$t/own.json"
printf '%s\n' '{"bindings":[{"context":"Chat","bindings":{"Ctrl+P":"chat:stash"}}]}' > "$f"
out=$(bind "$f")
ok "own key kept"                  'has "$f" "Ctrl+P" "chat:stash"'
ok "own key not doubled"           '[ "$(jq -r ".bindings[0].bindings | keys | map(ascii_downcase) | map(select(. == \"ctrl+p\")) | length" "$f")" = 1 ]'
ok "own key named"                 'grep -q "kept Ctrl+P = chat:stash" <<<"$out"'
ok "other key still added"         'has "$f" "ctrl+shift+p" "command:my-menu"'

# 5. Another context only: a Chat block is added beside it.
f="$t/global.json"
printf '%s\n' '{"$schema":"x","bindings":[{"context":"Global","bindings":{"ctrl+t":"app:toggleTodos"}}]}' > "$f"
bind "$f" >/dev/null
ok "other context kept"            '[ "$(jq -r ".bindings[] | select(.context == \"Global\") | .bindings[\"ctrl+t\"]" "$f")" = app:toggleTodos ]'
ok "other top-level key kept"      '[ "$(jq -r ".[\"\$schema\"]" "$f")" = x ]'
ok "chat block added"              'has "$f" "ctrl+p" "command:my-menu"'

# 6. A file that is not JSON, or not the expected shape, is left as it is.
f="$t/broken.json"; printf '{ "bindings": [ oops' > "$f"; before=$(sha256sum < "$f")
out=$(bind "$f"); rc=$?
ok "broken file untouched"         '[ "$(sha256sum < "$f")" = "$before" ] && [ "$rc" = 0 ]'
ok "broken file named"             'grep -q "skipped unreadable" <<<"$out"'
f="$t/shape.json"; printf '%s\n' '{"bindings":{"ctrl+p":"x"}}' > "$f"; before=$(sha256sum < "$f")
bind "$f" >/dev/null
ok "wrong shape untouched"         '[ "$(sha256sum < "$f")" = "$before" ]'

# 7. A wrong call is refused.
node "$KB" "$t/x.json" Chat 2>/dev/null; rc=$?
ok "no pairs: exit 2"              '[ "$rc" = 2 ] && [ ! -e "$t/x.json" ]'

# 8. link_my_menu in a made-up home: one link for all profiles, the key in each profile's file.
home="$t/home"
mkdir -p "$home/.claude" "$home/.config/orca/claude-profiles/a/home" "$home/.config/orca/claude-profiles/b/home"
printf '%s\n' "$orca" > "$home/.config/orca/claude-profiles/a/home/keybindings.json"
run_link() { HOME="$home" CLAUDE_CONFIG_DIR="$home/.config/orca/claude-profiles/a/home" REPO="$here" \
  bash -c 'set -uo pipefail; source "$REPO/lib/common.sh"; link_my_menu' 2>&1; }
run_link >/dev/null
link="$home/.claude/skills/my-menu"
ok "mod linked into the skills folder" '[ -L "$link" ] && [ "$(readlink -f "$link")" = "$(readlink -f "$MOD")" ]'
for f in "$home/.claude/keybindings.json" "$home"/.config/orca/claude-profiles/{a,b}/home/keybindings.json; do
  ok "key bound in ${f#"$home"/}"   'has "$f" "ctrl+p" "command:my-menu"'
done
ok "profile a keeps Orca's key"    'has "$home/.config/orca/claude-profiles/a/home/keybindings.json" "ctrl+alt+g" "command:orca-agent-view"'
again=$(run_link)
ok "second install: nothing bound again" '! grep -q "bound ctrl+p" <<<"$again"'
ok "second install: link kept"     'grep -q "already linked" <<<"$again"'

# 9. The menu's order names every /my-* prompt, and only prompts that exist.
order=$(sed -n '/^const ORDER = \[/,/^\]/p' "$MOD/hooks/register.tsx" | grep -o "'[a-z-]*'" | tr -d "'" | sort)
prompts=$(find "$here/plugins/nadavai/skills" -maxdepth 1 -type d -name 'my-*' -printf '%f\n' | sed 's/^my-//' | sort)
ok "the menu's order matches the prompts (order: ${order//$'\n'/ } | prompts: ${prompts//$'\n'/ })" '[ -n "$order" ] && [ "$order" = "$prompts" ]'
ok "hooks.json names the module"   '[ "$(jq -r ".modules[0]" "$MOD/hooks/hooks.json")" = ./register.tsx ] && [ -f "$MOD/hooks/register.tsx" ]'
ok "the nadavai plugin hooks file has no module (Codex reads it)" '! jq -e "has(\"modules\")" "$here/plugins/nadavai/hooks/hooks.json" >/dev/null'

# 10. The mod itself, as Claude Code reads it.
if command -v claude >/dev/null 2>&1; then
  out=$(claude plugin validate "$MOD" 2>&1)
  ok "claude plugin validate passes" 'grep -q "Validation passed" <<<"$out" && ! grep -q "error TS" <<<"$out"'
  out=$(claude plugin test "$MOD" 2>&1)
  ok "the mod's own tests pass: $(grep -E '^ *[0-9]+ (pass|fail)' <<<"$out" | tr -s ' \n' ' ')" 'grep -Eq "^ *0 fail" <<<"$out" && grep -Eq "^ *[1-9][0-9]* pass" <<<"$out"'
else
  echo "note: claude is not on PATH; the mod was not validated or run"
fi

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
