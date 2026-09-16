#!/usr/bin/env bash
# SessionStart hook: print the setup steps still pending for the project in the cwd.
# Plain stdout from a SessionStart hook is added to Claude's context.
#   PROJECT-FACTS.md present            -> re-init pending (rules/project-reinit.md)
#   UI project without DESIGN.md/PRODUCT.md -> design layer pending (rules/design-init.md)
set -u

D="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -d "$D" ] || exit 0

if [ -f "$D/PROJECT-FACTS.md" ]; then
  printf '%s\n' "PROJECT REINIT PENDING: this project has PROJECT-FACTS.md at its root, so it was cleaned but not re-initialized. Follow ~/.claude/rules/project-reinit.md now: tell Nadav to run /init, then /oh-my-claudecode:deepinit, then paste the step-3 merge prompt from that rule."
fi

if [ -f "$D/package.json" ] && grep -qE '"(react|next|vite|vue|svelte|@angular/core)"' "$D/package.json"; then
  missing=""
  [ -f "$D/DESIGN.md" ] || missing="DESIGN.md"
  [ -f "$D/PRODUCT.md" ] || missing="${missing:+$missing and }PRODUCT.md"
  if [ -n "$missing" ]; then
    printf '%s\n' "DESIGN SETUP PENDING: this UI project has no $missing at its root. Follow ~/.claude/rules/design-init.md (after project-reinit if that is pending too): tell Nadav the six impeccable steps run in this session, in order."
  fi
  # PostHog: every production app reports usage and errors to it (rules/posthog-init.md).
  # Silent once the SDK is in package.json or CLAUDE.md mentions PostHog (connected or "not used").
  if ! grep -qE '"(posthog-js|posthog-node|posthog-react-native|@posthog/[a-z0-9-]+)"' "$D/package.json" \
     && ! grep -qi 'posthog' "$D/CLAUDE.md" 2>/dev/null; then
    printf '%s\n' "POSTHOG PENDING: this UI project has no PostHog SDK in package.json and CLAUDE.md does not mention PostHog. Follow ~/.claude/rules/posthog-init.md: tell Nadav once, in Hebrew, that the app is not connected to PostHog and ask whether to connect it now or mark it as not used."
  fi
fi
exit 0
