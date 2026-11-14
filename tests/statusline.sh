#!/usr/bin/env bash
# tests/statusline.sh: bin/nadavai-statusline (the status line under our name), statusLine reaching
# every profile through apply_model_policy, and retire_omc_files (lib/common.sh), which removes
# the files the retired oh-my-claudecode plugin left in the config dirs and nothing else.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
plain() { sed 's/\x1b\[[0-9;]*m//g; s/\xc2\xa0/ /g'; }
sl="$here/bin/nadavai-statusline"

# 1. A made-up renderer that prints what the real one prints: non-breaking spaces, colours, the
#    label with an update notice, a second line that asks for a plugin update.
cat >"$t/renderer.mjs" <<'JS'
const nb = (s) => s.replace(/ /g, " ");
console.log(nb("branch:main | profile:home") + "\n" +
  "\x1b[1m" + nb("[OMC#5.8.5L] -> 5.8.6 omc update") + "\x1b[0m" + nb(" | Model: Opus 5.5 | ctx:[##--------]23% | tools:99") + "\n" +
  "\x1b[33m" + nb("[!] omc 5.8.6 - paste: ! claude plugin marketplace update omc && claude plugin update oh-my-claudecode@omc") + "\x1b[0m");
JS
out=$(NADAVAI_STATUSLINE_RENDERER="$t/renderer.mjs" node "$sl" </dev/null 2>&1 | plain); rc=$?
ok "it prints the renderer's line under our label"        '[ "$rc" = 0 ] && grep -qxF "[NadavAI] | Model: Opus 5.5 | ctx:[##--------]23% | tools:99" <<<"$out"'
ok "the other lines of the renderer stay"                 'grep -qxF "branch:main | profile:home" <<<"$out"'
ok "nothing names OMC or asks for a plugin update"        '! grep -q -i "omc\|claude plugin" <<<"$out" && [ "$(wc -l <<<"$out")" = 2 ]'

printf 'console.log("[OMC#5.8.4] | Model: Opus 5.5");\n' >"$t/plain.mjs"
out=$(NADAVAI_STATUSLINE_RENDERER="$t/plain.mjs" node "$sl" </dev/null 2>&1 | plain)
ok "a label with no update notice is renamed too"         '[ "$out" = "[NadavAI] | Model: Opus 5.5" ]'
printf 'console.log("[OMC] run /omc-setup to install properly");\n' >"$t/fail.mjs"
out=$(NADAVAI_STATUSLINE_RENDERER="$t/fail.mjs" node "$sl" </dev/null 2>&1 | plain)
ok "the renderer's failure line does not send him to an OMC command" '[ "$out" = "[NadavAI] the status line could not load its renderer" ]'
printf 'throw new Error("boom");\n' >"$t/throw.mjs"
out=$(NADAVAI_STATUSLINE_RENDERER="$t/throw.mjs" node "$sl" </dev/null 2>/dev/null | plain); rc=$?
ok "a renderer that throws still gives one line and exit 0" '[ "$rc" = 0 ] && [ "$out" = "[NadavAI] status line error" ]'

# 2. No renderer: a Node with no global package beside it (a copy of the node binary in an empty folder).
mkdir -p "$t/node/bin"; cp "$(command -v node)" "$t/node/bin/node"
out=$("$t/node/bin/node" "$sl" </dev/null 2>&1 | plain); rc=$?
ok "with no renderer it says how to get it back"          '[ "$rc" = 0 ] && [ "$out" = "[NadavAI] status line renderer missing: run ~/nadavai/update.sh --npm" ]'

# 3. The real renderer, where the omc CLI is installed (both machines; skipped elsewhere).
real="$(dirname "$(readlink -f "$(command -v node)")")/../lib/node_modules/oh-my-claude-sisyphus/dist/hud/index.js"
if [ -f "$real" ]; then
  printf '%s' '{"model":{"display_name":"Opus 5.5","id":"claude-opus-5-5"},"workspace":{"current_dir":"/tmp"},"cwd":"/tmp","transcript_path":"/nonexistent","context_window":{"context_window_size":200000,"current_usage":{"input_tokens":3000}}}' >"$t/in.json"
  out=$(cd "$t" && node "$sl" <"$t/in.json" 2>/dev/null | plain); rc=$?
  ok "the real renderer runs under our label"             '[ "$rc" = 0 ] && grep -q "^\[NadavAI\] | Model: Opus 5.5" <<<"$out" && grep -q "ctx:" <<<"$out"'
  ok "and its output names neither OMC nor a plugin update" '! grep -q "OMC\|omc update\|claude plugin" <<<"$out"'
else
  echo "note: the omc CLI is not installed beside this Node; the real-renderer checks were skipped"
fi

# 4. statusLine is a policy key: every profile gets the base's, and the base's runs our file.
home="$t/home"; pa="$home/.config/orca/claude-profiles/a/home"; pb="$home/.config/orca/claude-profiles/b/home"
mkdir -p "$home/.claude/hud/lib" "$pa" "$pb/.omc/cache-occupancy"
old='{"statusLine":{"type":"command","command":"node ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hud/omc-hud.mjs"}}'
printf '%s\n' "$old" >"$home/.claude/settings.json"; printf '%s\n' "$old" >"$pa/settings.json"; printf '%s\n' '{}' >"$pb/settings.json"
for f in omc-hud.mjs omc-hud-cache.sh find-node.sh lib/config-dir.mjs lib/config-dir.sh; do echo x >"$home/.claude/hud/$f"; done
ln -s "$home/.claude/hud" "$pa/hud"; ln -s "$home/.claude/hud" "$pb/hud"
for d in "$home/.claude" "$pa" "$pb"; do echo '{"claudeMdEnabled":false}' >"$d/.omc-config.json"; echo '{}' >"$d/.omc-version.json"; done
mkdir -p "$home/.claude/.omc"; echo '{"latestVersion":"9.9.9"}' >"$home/.claude/.omc/update-check.json"; echo keep >"$home/.claude/.omc/other.json"
echo '{}' >"$pb/.omc/update-state.json"; echo keep >"$pb/.omc/cache-occupancy/x"
mkdir -p "$home/.omc/plans" "$home/proj/.omc"; echo plan >"$home/.omc/plans/p.md"; echo work >"$home/proj/.omc/notes.md"
sh_run() { HOME="$home" CLAUDE_CONFIG_DIR="$pa" REPO="$here" bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; '"$1" 2>&1; }

out=$(sh_run retire_omc_files); rc=$?
ok "while a settings file still runs the old wrapper, the wrapper stays" '[ "$rc" = 0 ] && [ -f "$home/.claude/hud/omc-hud.mjs" ] && [ -L "$pa/hud" ] && grep -q "stays until update.sh has run" <<<"$out"'

sh_run apply_model_policy >/dev/null
want=$(jq -c .statusLine "$here/settings/settings.base.json")
ok "the base's status line runs bin/nadavai-statusline"   'grep -q "bin/nadavai-statusline" <<<"$want" && ! grep -q "omc-hud" <<<"$want"'
for f in "$home/.claude/settings.json" "$pa/settings.json" "$pb/settings.json"; do
  ok "statusLine is the base's in ${f#"$home"/}"          '[ "$(jq -c .statusLine "$f")" = "$want" ]'
done
cmd=$(jq -r .statusLine.command "$here/settings/settings.base.json")
out=$(cd "$t" && NADAVAI_HOME="$here" NADAVAI_STATUSLINE_RENDERER="$t/plain.mjs" sh -c "$cmd" </dev/null 2>&1 | plain)
ok "the base's command line itself runs, from a shell"    '[ "$out" = "[NadavAI] | Model: Opus 5.5" ]'

echo mine >"$home/.claude/hud/mine.txt"   # a file of someone else in the folder
out=$(sh_run retire_omc_files); rc=$?
ok "then the wrapper's five files and the profiles' links go" '[ "$rc" = 0 ] && [ ! -e "$home/.claude/hud/omc-hud.mjs" ] && [ ! -e "$home/.claude/hud/lib" ] && [ ! -L "$pa/hud" ] && [ ! -L "$pb/hud" ]'
ok "a file in hud/ that is not OMC's stays"               '[ "$(cat "$home/.claude/hud/mine.txt")" = mine ]'
ok "OMC's config, version and update-check files go"      '[ ! -e "$home/.claude/.omc-config.json" ] && [ ! -e "$pa/.omc-version.json" ] && [ ! -e "$home/.claude/.omc/update-check.json" ] && [ ! -e "$pb/.omc/update-state.json" ]'
ok "everything else under a config dir .omc stays"        '[ "$(cat "$home/.claude/.omc/other.json")" = keep ] && [ "$(cat "$pb/.omc/cache-occupancy/x")" = keep ]'
ok "the home .omc and a project .omc are not touched"            '[ "$(cat "$home/.omc/plans/p.md")" = plan ] && [ "$(cat "$home/proj/.omc/notes.md")" = work ]'
out=$(sh_run retire_omc_files); rc=$?
ok "a second run removes nothing and says nothing"        '[ "$rc" = 0 ] && [ -z "$out" ]'
ln -s "$t/elsewhere" "$pa/hud"
sh_run retire_omc_files >/dev/null
ok "a hud link that points somewhere else is left alone"  '[ -L "$pa/hud" ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
