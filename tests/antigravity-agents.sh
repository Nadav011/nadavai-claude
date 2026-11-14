#!/usr/bin/env bash
# tests/antigravity-agents.sh: the subagents the installer gives Antigravity are nadavai's own and
# intent's, in frontmatter Antigravity accepts, and the files of the retired oh-my-claudecode
# plugin are gone from an installed copy. Run: bash tests/antigravity-agents.sh
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); printf 'FAIL: %s\n' "$1"; fi; }

# shellcheck source=../lib/common.sh
REPO="$here" CFG="$tmp/cfg" . "$here/lib/common.sh"

out="$tmp/out"; intent="$tmp/intent"; mkdir -p "$out" "$intent"
# An installed copy as the old mirror left it: OMC's executor over ours, OMC's planner, our
# reviewer as the plugin ships it, and a file that is nobody's.
printf '%s\n' '---' 'name: executor' 'description: Focused task executor (OMC)' 'model: sonnet' '---' 'OMC executor body' >"$out/executor.md"
printf '%s\n' '---' 'name: planner' 'model: opus' '---' 'OMC planner body' >"$out/planner.md"
cp "$here/plugins/nadavai/agents/reviewer.md" "$out/reviewer.md"
printf 'keep me\n' >"$out/someone-else.md"
printf '%s\n' '---' 'name: vigil' 'description: Quality specialist' 'tools: Read, Glob' '---' 'vigil body' >"$intent/vigil.md"
printf '%s\n' '---' 'name: wren' 'description: Experience designer' 'model: haiku' '---' 'wren body' >"$intent/wren.md"

adapt_antigravity_agents "$out" "$here/plugins/nadavai/agents" "$intent"
ok "the helper succeeds" '[ $? -eq 0 ]'

fm() { awk 'NR==1{next} /^---$/{exit} {print}' "$1"; }
ok "executor is nadavai's, not OMC's"            'grep -q "You implement one unit of work" "$out/executor.md" && ! grep -q "OMC executor body" "$out/executor.md"'
ok "executor: opus becomes pro"                  'fm "$out/executor.md" | grep -qx "model: pro"'
ok "executor may edit"                           'fm "$out/executor.md" | grep -qx "  - replace_file_content"'
ok "reviewer: no Claude-only frontmatter key"    '! fm "$out/reviewer.md" | grep -q "disallowedTools"'
ok "reviewer: opus becomes pro"                  'fm "$out/reviewer.md" | grep -qx "model: pro"'
ok "reviewer cannot edit a file"                 '! fm "$out/reviewer.md" | grep -q "replace_file_content"'
ok "reviewer can write its report and run checks" 'fm "$out/reviewer.md" | grep -qx "  - write_to_file" && fm "$out/reviewer.md" | grep -qx "  - run_command"'
ok "reviewer keeps its body"                     'grep -q "You review work you did not write" "$out/reviewer.md"'
ok "OMC's planner is removed"                    '[ ! -e "$out/planner.md" ]'
ok "a file that is nobody's stays"               '[ "$(cat "$out/someone-else.md")" = "keep me" ]'
ok "intent's vigil is read-only"                 'fm "$out/vigil.md" | grep -qx "  - view_file" && ! fm "$out/vigil.md" | grep -q "write_to_file"'
ok "intent's wren: haiku becomes flash"          'fm "$out/wren.md" | grep -qx "model: flash"'
ok "every own agent of the repo is written"      '( n=0; for f in "$here"/plugins/nadavai/agents/*.md; do [ -f "$out/$(basename "$f")" ] || exit 1; n=$((n+1)); done; [ "$n" -ge 2 ] )'

# A retired name that nadavai later takes for an agent of its own is written, not removed.
own2="$tmp/own2"; out2="$tmp/out2"; mkdir -p "$own2" "$out2"
printf '%s\n' '---' 'name: planner' 'description: ours' '---' 'our planner' >"$own2/planner.md"
adapt_antigravity_agents "$out2" "$own2" "$tmp/no-intent"
ok "an own agent with a retired name is kept"    'grep -q "our planner" "$out2/planner.md" && fm "$out2/planner.md" | grep -qx "model: inherit"'

# Nothing in the installer reads the retired plugin's marketplace clone any more.
ok "common.sh reads nothing from marketplaces/omc" '! grep -q "marketplaces/omc" "$here/lib/common.sh"'
adapter="$(sed -n '/ANTIGRAVITY ADAPTER START/,/ANTIGRAVITY ADAPTER END/p' "$here/lib/common.sh")"
ok "the adapter header is found"                 '[ -n "$adapter" ] && grep -q "Custom subagents" <<<"$adapter"'
ok "the adapter header names no OMC agent or skill" '! grep -qE "\\b(planner|verifier|code-reviewer|debugger|architect|critic|security-reviewer|explore|designer|writer|qa-tester|ralplan|ai-slop-cleaner)\\b" <<<"$adapter"'
ok "the adapter header names our two agents"     'grep -q "\`executor\` and \`reviewer\` from nadavai" <<<"$adapter"'
ok "wondelai's marketplace is not registered by setup.sh or base" '! grep -q "wondelai" "$here/setup.sh" && [ "$(jq -r ".extraKnownMarketplaces | has(\"wondelai-skills\")" "$here/settings/settings.base.json")" = false ]'

printf 'antigravity-agents: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
