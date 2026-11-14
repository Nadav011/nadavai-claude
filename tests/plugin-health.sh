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
ok "a disabled dependency is reported"          'grep -q "BROKEN  good: its dependency off@m is not enabled" <<<"$out"'
printf '%s\n' '{"name":"good"}' >"$cache/good/1.0.0/.claude-plugin/plugin.json"

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
ok "every dependency of nadavai is enabled in the base settings" '! grep -q "BROKEN  nadavai: its dependency" <<<"$out"'

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
printf 'POSTHOG_PERSONAL_API_KEY=not-a-key\n' >"$sec/posthog.env"; rm -f -- "$sec/greenroom-posthog.env"
ok "a value without the phx_ prefix is not sent" '[ "$(h)" = "{}" ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
