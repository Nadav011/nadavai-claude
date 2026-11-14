#!/usr/bin/env bash
# tests/settings-policy.sh: apply_model_policy (lib/common.sh) on a made-up home with two account
# profiles. It sets the policy env vars of settings.base.json in every profile, keeps the env vars
# and the effort entries a profile already has, and drops a policy var that base no longer names.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

home="$t/home"
a="$home/.config/orca/claude-profiles/a/home/settings.json"
b="$home/.config/orca/claude-profiles/b/home/settings.json"
mkdir -p "$home/.claude" "$(dirname "$a")" "$(dirname "$b")"
# Profile a: its own token, its own Opus effort, no policy vars yet. Profile b: an old value of one.
printf '%s\n' '{"env":{"BRIGHTDATA_API_TOKEN":"keep-me"},"modelSettings":{"claude-opus-5-5":{"effortLevel":"medium"}}}' >"$a"
printf '%s\n' '{"env":{"OMC_QUIET":"0","VITEST_MAX_THREADS":"3"}}' >"$b"
printf '%s\n' '{}' >"$home/.claude/settings.json"

run_policy() { HOME="$home" CLAUDE_CONFIG_DIR="$(dirname "$a")" REPO="$1" \
  bash -c 'set -uo pipefail; source "$REPO/lib/common.sh"; apply_model_policy' 2>&1; }

# 1. The real base file.
run_policy "$here" >/dev/null
quiet=$(jq -r '.env.OMC_QUIET' "$here/settings/settings.base.json")
ok "base names a quiet level for the OMC reminders" '[ "$quiet" = 1 ] || [ "$quiet" = 2 ]'
for f in "$a" "$b" "$home/.claude/settings.json"; do
  ok "OMC_QUIET set in ${f#"$home"/}" '[ "$(jq -r .env.OMC_QUIET "$f")" = "$quiet" ]'
  ok "autocompact value set in ${f#"$home"/}" '[ "$(jq -r .env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE "$f")" = "$(jq -r .env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE "$here/settings/settings.base.json")" ]'
done
ok "a profile's own env var stays"            '[ "$(jq -r .env.BRIGHTDATA_API_TOKEN "$a")" = keep-me ]'
ok "a per-machine cap is not reset from base" '[ "$(jq -r .env.VITEST_MAX_THREADS "$b")" = 3 ]'
ok "a profile's own effort entry stays"       '[ "$(jq -r ".modelSettings[\"claude-opus-5-5\"].effortLevel" "$a")" = medium ]'
ok "a missing effort entry is added"          '[ "$(jq -r ".modelSettings[\"claude-opus-5-5\"].effortLevel" "$b")" = "$(jq -r ".modelSettings[\"claude-opus-5-5\"].effortLevel" "$here/settings/settings.base.json")" ]'
ok "the model is the base's"                  '[ "$(jq -r .model "$b")" = "$(jq -r .model "$here/settings/settings.base.json")" ]'
ok "the advisor model is the base's"          '[ "$(jq -r .advisorModel "$a")" = "$(jq -r .advisorModel "$here/settings/settings.base.json")" ] && [ "$(jq -r .advisorModel "$a")" = fable ]'

# An account-synced plugin that base turns off is written as off in a profile that has no entry
# for it, and an ordinary plugin that base turns off is not added to a profile that never had it.
synced=$(jq -r '[.enabledPlugins | to_entries[] | select(.value == false and (.key | endswith("@synced"))) | .key][0] // empty' "$here/settings/settings.base.json")
plain=$(jq -r '[.enabledPlugins | to_entries[] | select(.value == false and (.key | endswith("@synced") | not)) | .key][0] // empty' "$here/settings/settings.base.json")
ok "base turns off at least one account-synced plugin" '[ -n "$synced" ]'
for f in "$a" "$b"; do
  ok "the synced plugin is off in ${f#"$home"/}" '[ "$(jq -r --arg p "$synced" ".enabledPlugins[\$p]" "$f")" = false ]'
  ok "an ordinary off plugin is not added to ${f#"$home"/}" '[ -z "$plain" ] || [ "$(jq -r --arg p "$plain" ".enabledPlugins | has(\$p)" "$f")" = false ]'
done
ok "the two unused MCP servers are denied" '[ "$(jq -r "[.deniedMcpServers[].serverName] | map(select(. == \"plugin:supabase:supabase\" or . == \"plugin:context7:context7\")) | length" "$a")" = 2 ]'

# 2. A second run changes nothing.
before=$(cat "$a" "$b")
run_policy "$here" >/dev/null
ok "a second run leaves the files as they are" '[ "$before" = "$(cat "$a" "$b")" ]'

# 3. A base that no longer names the var: it leaves every profile, and the other vars stay.
repo2="$t/repo2"
mkdir -p "$repo2/lib" "$repo2/settings"
cp "$here/lib/common.sh" "$repo2/lib/common.sh"
jq 'del(.env.OMC_QUIET)' "$here/settings/settings.base.json" >"$repo2/settings/settings.base.json"
run_policy "$repo2" >/dev/null
for f in "$a" "$b"; do
  ok "OMC_QUIET dropped from ${f#"$home"/}" '[ "$(jq -r ".env | has(\"OMC_QUIET\")" "$f")" = false ]'
done
ok "the profile's own env var is still there" '[ "$(jq -r .env.BRIGHTDATA_API_TOKEN "$a")" = keep-me ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
