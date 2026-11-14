#!/usr/bin/env bash
# tests/link-shortcuts.sh: link_shortcuts (lib/common.sh) links the tools in bin/ into ~/.local/bin
# and never a folder: Python writes bin/__pycache__ when a test imports a tool, and until
# 2026-11-14 that folder was linked beside the tools. Run: bash tests/link-shortcuts.sh
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
t="$(mktemp -d)"; trap 'rm -rf "$t"' EXIT
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); printf 'FAIL: %s\n' "$1"; fi; }

repo="$t/repo"; home="$t/home"
mkdir -p "$repo/bin/__pycache__" "$repo/lib" "$home/.local/bin" "$home/elsewhere"
cp "$here/lib/common.sh" "$repo/lib/common.sh"
printf '#!/bin/sh\n' >"$repo/bin/cs"; printf '#!/bin/sh\n' >"$repo/bin/a-tool"; echo x >"$repo/bin/__pycache__/a.pyc"
ln -s "$repo/bin/__pycache__" "$home/.local/bin/__pycache__"          # what an earlier run left
ln -s "$home/elsewhere" "$home/.local/bin/other-dir"                   # someone else's link to a folder
run() { REPO="$repo" HOME="$home" bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; link_shortcuts' 2>&1; }

out=$(run); rc=$?
ok "link_shortcuts succeeds"                     '[ "$rc" = 0 ]'
ok "a tool is linked"                            '[ "$(readlink "$home/.local/bin/a-tool")" = "$repo/bin/a-tool" ]'
ok "cs is linked"                                '[ "$(readlink "$home/.local/bin/cs")" = "$repo/bin/cs" ]'
ok "the old link to the cache folder is removed" '[ ! -L "$home/.local/bin/__pycache__" ] && [ ! -e "$home/.local/bin/__pycache__" ] && grep -q "a folder, not a tool" <<<"$out"'
ok "the folder itself is untouched"              '[ -f "$repo/bin/__pycache__/a.pyc" ]'
ok "another link to a folder stays"              '[ "$(readlink "$home/.local/bin/other-dir")" = "$home/elsewhere" ]'
out=$(run); rc=$?
ok "a second run links no folder and says nothing about one" '[ "$rc" = 0 ] && [ ! -e "$home/.local/bin/__pycache__" ] && ! grep -q "a folder, not a tool" <<<"$out"'

printf 'PASS: %d  FAIL: %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
