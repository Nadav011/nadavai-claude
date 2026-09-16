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
fi
exit 0
