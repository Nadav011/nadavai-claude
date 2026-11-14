#!/bin/sh
# headersHelper of the PostHog MCP server (plugins/nadavai/mcp.json). Claude Code runs it at every
# connection and sends the JSON object it prints as request headers.
#
# It prints the Authorization header from the personal API key in the vault, so the server works
# in every Orca account profile without a sign-in per profile, and the key stays in the vault
# instead of being copied into each profile's settings.json. With no readable key (the vault is
# locked, or this machine has none) it prints {} and Claude Code falls back to its OAuth sign-in,
# as before. The key goes to stdout only, for Claude Code; nothing is logged.
#
# Why: on 2026-11-14 the server waited for a sign-in in 7 of the LENOVO's 13 settings files, and
# the PostHog plugin that used to bring it was turned off (194 skills, no call in 30 days).
set +x  # never trace: the key would reach stderr if a caller exported xtrace
dir="${NADAVAI_SECRETS_DIR:-$HOME/.claude/secrets}"
key=""
for f in "$dir/posthog.env" "$dir/greenroom-posthog.env"; do
  [ -r "$f" ] || continue
  key=$(sed -n 's/^\(export  *\)\{0,1\}POSTHOG_PERSONAL_API_KEY=//p' "$f" | head -n 1 | sed -e 's/[[:space:]]#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr -d "\"'\r")
  [ -n "$key" ] && break
done
# A PostHog personal key is phx_ followed by letters and digits; anything else is not sent.
case "$key" in
  phx_*[!A-Za-z0-9_]*|""|phx_) printf '{}\n' ;;
  phx_*) printf '{"Authorization":"Bearer %s"}\n' "$key" ;;
  *) printf '{}\n' ;;
esac
