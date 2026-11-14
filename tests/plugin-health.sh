#!/usr/bin/env bash
# tests/plugin-health.sh: bin/plugin-health --static on a made-up config folder, and the PostHog
# headers helper on a made-up secrets folder. Nothing here starts claude or reads the real vault.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

# A made-up home, so that the real profiles, the real vault and the notification state are not read.
export HOME="$t/home"; mkdir -p "$HOME"
export PLUGIN_HEALTH_ROUTES=/dev/null   # the repo's routed files live under the real home; their own test sets a list
cfg="$t/cfg"; cache="$cfg/plugins/cache"
mkplugin() { # name: a plugin with one hook script and one stdio server, both present
  local d="$cache/$1/1.0.0"
  mkdir -p "$d/hooks" "$d/scripts" "$d/bridge" "$d/.claude-plugin"
  printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/guard.mjs"}]}]}}' >"$d/hooks/hooks.json"
  printf '%s\n' '{"mcpServers":{"t":{"command":"node","args":["${CLAUDE_PLUGIN_ROOT}/bridge/server.cjs"]}}}' >"$d/.mcp.json"
  printf '{"name":"%s"}\n' "$1" >"$d/.claude-plugin/plugin.json"
  : >"$d/scripts/guard.mjs"; : >"$d/bridge/server.cjs"
}
registry() { # write installed_plugins.json for the plugin names given
  local first=1 p
  { printf '{"plugins":{'
    for p in "$@"; do
      [ "$first" = 1 ] || printf ','
      first=0
      printf '"%s@m":[{"scope":"user","version":"1.0.0","installPath":"%s"}]' "$p" "$cache/$p/1.0.0"
    done
    printf '}}\n'; } >"$cfg/plugins/installed_plugins.json"
}
run() { CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" --static 2>&1; }

mkplugin good; mkplugin other; mkplugin off
registry good other off
printf '%s\n' '{"enabledPlugins":{"good@m":true,"other@m":true,"off@m":false,"cloud@synced":true}}' >"$cfg/settings.json"
out=$(run); rc=$?
ok "a healthy set passes"                       '[ "$rc" = 0 ] && ! grep -q BROKEN <<<"$out"'
ok "it counts the enabled plugins only"         'grep -q "2 plugins, 2 MCP servers checked, 0 broken" <<<"$out"'

# The case of 2026-11-14: an update that ships without the file the MCP server runs.
rm -f -- "$cache/good/1.0.0/bridge/server.cjs"
out=$(run); rc=$?
ok "a missing server file fails the check"      '[ "$rc" = 1 ]'
ok "it names the plugin, the server and the file" 'grep -q "BROKEN  good: MCP server t runs bridge/server.cjs" <<<"$out"'
: >"$cache/good/1.0.0/bridge/server.cjs"

rm -f -- "$cache/other/1.0.0/scripts/guard.mjs"
out=$(run)
ok "a missing hook script is reported"          'grep -q "BROKEN  other: a hook runs scripts/guard.mjs" <<<"$out"'
: >"$cache/other/1.0.0/scripts/guard.mjs"

# A disabled plugin is not checked, even when it is broken.
rm -f -- "$cache/off/1.0.0/bridge/server.cjs"
out=$(run); rc=$?
ok "a disabled plugin's fault is not reported"  '[ "$rc" = 0 ]'

# A server on the deny list is skipped.
rm -f -- "$cache/good/1.0.0/bridge/server.cjs"
printf '%s\n' '{"enabledPlugins":{"good@m":true,"other@m":true},"deniedMcpServers":[{"serverName":"plugin:good:t"}]}' >"$cfg/settings.json"
out=$(run); rc=$?
ok "a denied server is skipped"                 '[ "$rc" = 0 ]'
: >"$cache/good/1.0.0/bridge/server.cjs"

# A dependency that is off unloads the plugin that needs it.
printf '%s\n' '{"name":"good","dependencies":[{"name":"off","marketplace":"m"}]}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"
printf '%s\n' '{"enabledPlugins":{"good@m":true,"other@m":true,"off@m":false}}' >"$cfg/settings.json"
out=$(run)
ok "a disabled dependency is reported"          'grep -q "BROKEN  good: version 1.0.0 lists the dependency off@m, which is not enabled" <<<"$out"'
printf '%s\n' '{"name":"good"}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"

# A second install of the same plugin (project scope) that still lists a disabled dependency:
# sessions started in that folder load it, so it is checked too.
mkdir -p "$cache/good/0.9.0/.claude-plugin"
printf '%s\n' '{"name":"good","dependencies":[{"name":"off","marketplace":"m"}]}' >"$cache/good/0.9.0/.claude-plugin/plugin.json"
printf '{"plugins":{"good@m":[{"scope":"user","version":"1.0.0","installPath":"%s"},{"scope":"project","version":"0.9.0","installPath":"%s"}]}}\n' "$cache/good/1.0.0" "$cache/good/0.9.0" >"$cfg/plugins/installed_plugins.json"
printf '%s\n' '{"enabledPlugins":{"good@m":true,"off@m":false}}' >"$cfg/settings.json"
out=$(run); rc=$?
ok "a project-scope install with a disabled dependency is reported" '[ "$rc" = 1 ] && grep -q "BROKEN  good: version 0.9.0 lists the dependency off@m" <<<"$out"'
registry good other off

# Hooks declared in plugin.json: a path to a hooks file, and the hooks object itself.
printf '%s\n' '{"name":"good","hooks":"./hooks/extra.json"}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"
printf '%s\n' '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"sh \"${CLAUDE_PLUGIN_ROOT}/scripts/extra.sh\""}]}]}}' >"$cache/good/1.0.0/hooks/extra.json"
printf '%s\n' '{"enabledPlugins":{"good@m":true}}' >"$cfg/settings.json"
out=$(run)
ok "a hook file named in plugin.json is read"    'grep -q "BROKEN  good: a hook runs scripts/extra.sh" <<<"$out"'
printf '%s\n' '{"name":"good","hooks":{"Stop":[{"hooks":[{"type":"command","command":"node ${CLAUDE_PLUGIN_ROOT}/scripts/inline.mjs"}]}]}}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"
out=$(run)
ok "hooks written inside plugin.json are read"   'grep -q "BROKEN  good: a hook runs scripts/inline.mjs" <<<"$out"'
printf '%s\n' '{"name":"good"}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"

# A hook whose script is named in an "args" list (the shape oh-my-claudecode uses).
printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/run.cjs","${CLAUDE_PLUGIN_ROOT}/scripts/enforcer.mjs"]}]}]}}' >"$cache/good/1.0.0/hooks/hooks.json"
: >"$cache/good/1.0.0/scripts/run.cjs"
out=$(run)
ok "a hook script named in an args list is checked" 'grep -q "BROKEN  good: a hook runs scripts/enforcer.mjs" <<<"$out" && ! grep -q "run.cjs" <<<"$out"'
printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/guard.mjs"}]}]}}' >"$cache/good/1.0.0/hooks/hooks.json"

# A plugin file that is there and does not parse is a fault, not an absent file.
printf '{"hooks": {' >"$cache/good/1.0.0/hooks/hooks.json"
out=$(run); rc=$?
ok "a hooks.json that does not parse fails the check" '[ "$rc" = 1 ] && grep -q "BROKEN  good: hooks/hooks.json in version 1.0.0 is not valid JSON" <<<"$out"'
printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}\"/scripts/guard.mjs"}]}]}}' >"$cache/good/1.0.0/hooks/hooks.json"
printf '%s\n' '{"mcpServers":{"t":{"command":null,"args":null,"headersHelper":null}}}' >"$cache/good/1.0.0/.mcp.json"
out=$(run); rc=$?
ok "a server with empty fields does not crash the check" '[ "$rc" = 0 ] && ! grep -q Traceback <<<"$out"'
printf '%s\n' '{"mcpServers":{"t":{"command":"node","args":["${CLAUDE_PLUGIN_ROOT}/bridge/server.cjs"]}}}' >"$cache/good/1.0.0/.mcp.json"

printf '%s\n' '{"name":"good","mcpServers":"./servers.json"}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"
out=$(run); rc=$?
ok "a plugin.json that names a missing MCP servers file fails the check" '[ "$rc" = 1 ] && grep -q "BROKEN  good: plugin.json names servers.json for its MCP servers" <<<"$out"'
printf '%s\n' '{"name":"good"}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"

# Another profile's settings.json is checked too, and only what differs from the active one is said.
prof="$HOME/.config/orca/claude-profiles/abcdef123456/home"; mkdir -p "$prof"; ln -s "$cfg/plugins" "$prof/plugins"
printf '%s\n' '{"enabledPlugins":{"good@m":true,"ghost@m":true}}' >"$prof/settings.json"
out=$(run); rc=$?
ok "a fault in another profile's settings is reported with the profile" '[ "$rc" = 1 ] && grep -q "BROKEN  ghost: enabled in settings.json but not installed (in the settings of abcdef12)" <<<"$out"'
rm -f -- "$cache/good/1.0.0/bridge/server.cjs"
out=$(run)
ok "a fault the active settings already show is said once" '[ "$(grep -c "MCP server t runs bridge/server.cjs" <<<"$out")" = 1 ]'
: >"$cache/good/1.0.0/bridge/server.cjs"
rm -f -- "$prof/settings.json"

# No readable settings.json is a fault, not an empty pass.
mv "$cfg/settings.json" "$cfg/settings.json.away"
out=$(run); rc=$?
ok "a missing settings.json fails the check"     '[ "$rc" = 1 ] && grep -q "missing or unreadable" <<<"$out"'
mv "$cfg/settings.json.away" "$cfg/settings.json"

# The live check: a claude that fails, and one that lists nothing, are faults.
fake="$t/fakebin"; mkdir -p "$fake"
printf '#!/bin/sh\nexit 1\n' >"$fake/claude"; chmod +x "$fake/claude"
out=$(PATH="$fake:$PATH" CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" 2>&1); rc=$?
ok "a failing claude mcp list fails the check"   '[ "$rc" = 1 ] && grep -q "live check failed: .claude mcp list. exited 1" <<<"$out"'
printf '#!/bin/sh\necho "Checking MCP server health"\n' >"$fake/claude"
out=$(PATH="$fake:$PATH" CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" 2>&1); rc=$?
ok "a claude mcp list with no server fails the check" '[ "$rc" = 1 ] && grep -q "listed no server" <<<"$out"'
printf '#!/bin/sh\nprintf "%%s\\n" "plugin:good:t: node x - ✔ Connected" "plugin:other:p: https://x (HTTP) - ! Needs authentication" "plugin:bad:q: node y - ✗ Failed to connect" "plugin:nadavai:posthog: https://mcp.posthog.com/mcp (HTTP) - ! Needs authentication" "plugin:acct:Z: https://z (HTTP) - ! Needs authentication"\n' >"$fake/claude"
out=$(PATH="$fake:$PATH" CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" 2>&1); rc=$?
ok "a server that waits for a sign-in is reported" 'grep -q "MCP server plugin:other:p waits for a sign-in" <<<"$out"'
ok "the vault's server waiting with the vault open is a fault" 'grep -q "BROKEN  MCP server plugin:nadavai:posthog waits for a sign-in" <<<"$out"'
ok "an account plugin's server waiting for a sign-in is a note" 'grep -q "^note    MCP server plugin:acct:Z of an account plugin waits" <<<"$out" && ! grep -q "BROKEN  MCP server plugin:acct:Z" <<<"$out"'
ok "a server that failed is reported"            'grep -q "MCP server plugin:bad:q did not connect" <<<"$out"'
ok "a connected server is not reported"          '! grep -q "plugin:good:t" <<<"$out"'
# While the vault is locked (the store exists, nothing is mounted on secrets), a wait for a sign-in is a note.
lockhome="$t/lockhome"; mkdir -p "$lockhome/.claude/secrets.gocryptfs" "$lockhome/.claude/secrets"
out=$(HOME="$lockhome" PATH="$fake:$PATH" CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" 2>&1)
ok "with the vault locked the vault's server waiting for a sign-in is a note" 'grep -q "^note    MCP server plugin:nadavai:posthog waits for a sign-in while the vault is locked" <<<"$out" && ! grep -q "BROKEN  MCP server plugin:nadavai:posthog" <<<"$out"'
ok "another server waiting for a sign-in is still a fault then" 'grep -q "BROKEN  MCP server plugin:other:p waits for a sign-in" <<<"$out"'
ok "a failed server is still a fault then"       'grep -q "BROKEN  MCP server plugin:bad:q did not connect" <<<"$out"'

# The daily run with no network checks nothing, sends nothing and keeps the last state.
out=$(PLUGIN_HEALTH_NET_HOST=nonexistent.invalid PLUGIN_HEALTH_NET_WAIT=0 PATH="$fake:$PATH" CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" --notify 2>&1); rc=$?
ok "with no network the daily run says so and exits 0" '[ "$rc" = 0 ] && grep -q "^note    no network" <<<"$out" && ! grep -q BROKEN <<<"$out"'
ok "and it writes no state"                      '[ ! -e "$HOME/.local/state/nadavai/plugin-health.txt" ]'

# Enabled but never installed, and an install folder that is gone.
printf '%s\n' '{"enabledPlugins":{"good@m":true,"ghost@m":true}}' >"$cfg/settings.json"
out=$(run)
ok "an enabled plugin that is not installed is reported" 'grep -q "BROKEN  ghost: enabled in settings.json but not installed" <<<"$out"'
ok "an unknown option is refused"               '! CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" --nope >/dev/null 2>&1'

# The repo's own plugin: every file its hooks and MCP servers name exists in this checkout.
real="$t/real"; mkdir -p "$real/plugins"
printf '{"plugins":{"nadavai@nadavai":[{"scope":"user","version":"checkout","installPath":"%s"}]}}\n' "$here/plugins/nadavai" >"$real/plugins/installed_plugins.json"
jq '{enabledPlugins: .enabledPlugins, deniedMcpServers: .deniedMcpServers}' "$here/settings/settings.base.json" >"$real/settings.json"
out=$(CLAUDE_CONFIG_DIR="$real" python3 -I "$here/bin/plugin-health" --static 2>&1)
ok "nadavai's hooks and servers name files that exist" '! grep -q "BROKEN  nadavai: .* runs " <<<"$out"'
ok "every dependency of nadavai is enabled in the base settings" '! grep -q "BROKEN  nadavai: .* lists the dependency" <<<"$out"'
jq '.enabledPlugins["impeccable@impeccable"] = false | {enabledPlugins: .enabledPlugins}' "$here/settings/settings.base.json" >"$real/settings.json"
out=$(CLAUDE_CONFIG_DIR="$real" python3 -I "$here/bin/plugin-health" --static 2>&1)
ok "that check fails when a dependency of nadavai is turned off" 'grep -q "BROKEN  nadavai: .* lists the dependency impeccable@impeccable" <<<"$out"'

# Files our guides read by path from a marketplace folder.
routes="$t/routes.txt"
printf '%s\n' "# a comment" "$t/present.md   # why" "$t/gone.md" >"$routes"; : >"$t/present.md"
printf '%s\n' '{"enabledPlugins":{"good@m":true}}' >"$cfg/settings.json"
out=$(PLUGIN_HEALTH_ROUTES="$routes" CLAUDE_CONFIG_DIR="$cfg" python3 -I "$here/bin/plugin-health" --static 2>&1); rc=$?
ok "a routed file that is gone fails the check"  '[ "$rc" = 1 ] && grep -q "reads $t/gone.md, which is gone" <<<"$out"'
ok "a routed file that exists is not reported"   '! grep -q "present.md" <<<"$out"'
ok "every routed file in the repo list is a SKILL.md path" '! grep -v "^#" "$here/config/routed-skill-files.txt" | grep -v "^$" | grep -qv "/SKILL.md"'

# The PostHog headers helper.
helper="$here/plugins/nadavai/scripts/posthog-mcp-headers.sh"
sec="$t/secrets"; mkdir -p "$sec"
h() { NADAVAI_SECRETS_DIR="$sec" sh "$helper" 2>&1; }
ok "no key file: an empty object, so the OAuth sign-in still applies" '[ "$(h)" = "{}" ]'
printf 'NEXT_PUBLIC_POSTHOG_KEY=phc_public\nPOSTHOG_PERSONAL_API_KEY=phx_abc123DEF\n' >"$sec/greenroom-posthog.env"
ok "the key becomes the Authorization header"   '[ "$(h | jq -r .Authorization)" = "Bearer phx_abc123DEF" ]'
printf 'POSTHOG_PERSONAL_API_KEY="phx_quoted99"\n' >"$sec/posthog.env"
ok "posthog.env comes first, quotes are dropped" '[ "$(h | jq -r .Authorization)" = "Bearer phx_quoted99" ]'
printf 'POSTHOG_PERSONAL_API_KEY=phx_bad"},"x":"y\n' >"$sec/posthog.env"
ok "a value that is not a plain key is not sent" '[ "$(h)" = "{}" ] || [ "$(h | jq -r .Authorization)" = "Bearer phx_abc123DEF" ]'
printf 'export POSTHOG_PERSONAL_API_KEY=phx_exp0rt  # the key\n' >"$sec/posthog.env"
ok "an export prefix and a trailing comment are handled" '[ "$(h | jq -r .Authorization)" = "Bearer phx_exp0rt" ]'
ok "tracing does not print the key"             '! NADAVAI_SECRETS_DIR="$sec" sh -x "$helper" 2>&1 >/dev/null | grep -q "phx_exp0rt"'
printf 'POSTHOG_PERSONAL_API_KEY=phx_a b\n' >"$sec/posthog.env"; rm -f -- "$sec/greenroom-posthog.env"
ok "a key with a space inside is not repaired"  '[ "$(h)" = "{}" ]'
printf 'POSTHOG_PERSONAL_API_KEY=phx_\n' >"$sec/posthog.env"
ok "a bare prefix is not sent"                  '[ "$(h)" = "{}" ]'
printf 'POSTHOG_PERSONAL_API_KEY=not-a-key\n' >"$sec/posthog.env"
ok "a value without the phx_ prefix is not sent" '[ "$(h)" = "{}" ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
