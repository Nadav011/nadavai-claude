#!/usr/bin/env bash
# SessionStart hook: print the setup steps still pending for the project in the cwd.
# Plain stdout from a SessionStart hook is added to Claude's context.
#   PROJECT-FACTS.md present            -> re-init pending (rules/project-reinit.md)
#   UI project without DESIGN.md/PRODUCT.md -> design layer pending (rules/design-init.md)
set -u

D="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -d "$D" ] || exit 0

# Only real projects: a git repo with a package manifest. Keeps the home directory and scratch folders quiet.
is_project=0
if [ "$(git -C "$D" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$D" && pwd -P)" ] \
   && { [ -f "$D/package.json" ] || [ -f "$D/pyproject.toml" ] || [ -f "$D/pubspec.yaml" ] || [ -f "$D/Package.swift" ]; }; then is_project=1; fi

if [ "$is_project" = 1 ] && [ ! -f "$D/CLAUDE.md" ] && [ ! -f "$D/PROJECT-FACTS.md" ]; then
  printf '%s\n' "CLAUDE.MD MISSING: this project has no CLAUDE.md. Tell Nadav once, in Hebrew, to run /init and then /oh-my-claudecode:deepinit in this session; afterwards make AGENTS.md a symlink to CLAUDE.md (for Codex) and commit."
fi
if [ "$is_project" = 1 ] && [ -f "$D/CLAUDE.md" ] && [ ! -e "$D/AGENTS.md" ]; then
  printf '%s\n' "AGENTS.MD MISSING: CLAUDE.md exists but AGENTS.md does not. Create it as a symlink to CLAUDE.md (ln -s CLAUDE.md AGENTS.md) so Codex reads the same instructions, and commit."
fi

if [ -f "$D/PROJECT-FACTS.md" ]; then
  printf '%s\n' "PROJECT REINIT PENDING: this project has PROJECT-FACTS.md at its root, so it was cleaned but not re-initialized. Follow ~/.claude/rules/project-reinit.md now: tell Nadav to run /init, then /oh-my-claudecode:deepinit, then paste the step-3 merge prompt from that rule."
fi

if [ -f "$D/package.json" ] && grep -qE '"(react|next|vite|vue|svelte|@angular/core)"' "$D/package.json"; then
  missing=""
  [ -f "$D/DESIGN.md" ] || missing="DESIGN.md"
  [ -f "$D/PRODUCT.md" ] || missing="${missing:+$missing and }PRODUCT.md"
  if [ -n "$missing" ]; then
    printf '%s\n' "DESIGN SETUP PENDING: this UI project has no $missing at its root. Tell Nadav once, in Hebrew, to run /ux-setup (the nadav-design skill; ~/.claude/rules/design-init.md is the fallback when it is unavailable), after project-reinit if that is pending too."
  fi
  if [ -f "$D/DESIGN.md" ] && [ -f "$D/PRODUCT.md" ] && [ ! -d "$D/e2e/dod" ]; then
    printf '%s\n' "DOD GATE MISSING: DESIGN.md and PRODUCT.md exist but e2e/dod/ does not. Tell Nadav to run /ux-setup (its step 12 installs the gate from ~/nadavai/templates/dod/); design-init.md step 6 is the fallback."
  fi
  # UI loop position (nadav-design skill), derived from tracked files only (rules in its Hard rules).
  if [ -f "$D/DESIGN.md" ] && [ -f "$D/PRODUCT.md" ]; then
    if [ ! -f "$D/.claude/rules/ui.md" ] || [ ! -d "$D/e2e/dod" ] || [ ! -f "$D/.github/workflows/ui.yml" ] || [ ! -f "$D/lighthouserc.json" ]; then
      ui_next="/ux-setup (setup artifacts incomplete: ui.md, e2e/dod, ui.yml or lighthouserc.json missing)"
    elif [ ! -f "$D/docs/ui-audit/PLAN.md" ]; then ui_next="/ux-audit for an existing project, /ux-plan <feature> for a new one"
    elif grep -qE '^\s*- \[ \]' "$D/docs/ui-audit/PLAN.md"; then ui_next="/ux-screen <first open item in docs/ui-audit/PLAN.md>"
    elif ! grep -qiE 'UI system.*(released|release [0-9]{4}-[0-9]{2}-[0-9]{2})' "$D/STATUS.md" "$D/BACKLOG.md" 2>/dev/null; then ui_next="/ux-ship"
    else ui_next="/ux-plan <feature> for the next feature; /ux-ship step 8 weekly; /ux-retro after each run"
    fi
    printf '%s\n' "UI LOOP: next: $ui_next. Tell Nadav in one Hebrew line at the start of the session (or /ux-next for the full picture)."
  fi
  # PostHog: every production app reports usage and errors to it (rules/posthog-init.md).
  # Silent once the SDK is in package.json or CLAUDE.md mentions PostHog (connected or "not used").
  if ! grep -qE '"(posthog-js|posthog-node|posthog-react-native|@posthog/[a-z0-9-]+)"' "$D/package.json" \
     && ! grep -qi 'posthog' "$D/CLAUDE.md" 2>/dev/null; then
    printf '%s\n' "POSTHOG PENDING: this UI project has no PostHog SDK in package.json and CLAUDE.md does not mention PostHog. Follow ~/.claude/rules/posthog-init.md: tell Nadav once, in Hebrew, that the app is not connected to PostHog and ask whether to connect it now or mark it as not used."
  fi
fi
# Stack tools that live in the project's .mcp.json (PROJECT-CLEANUP.md, "stack additions").
if [ -f "$D/package.json" ]; then
  if grep -q '"@capacitor/core"' "$D/package.json" && ! grep -q '"maestro"' "$D/.mcp.json" 2>/dev/null; then
    printf '%s\n' "MAESTRO MCP MISSING: this Capacitor app has no maestro server in .mcp.json. Add {\"mcpServers\":{\"maestro\":{\"command\":\"maestro\",\"args\":[\"mcp\"]}}} (merge into the existing file) so mobile flows can run; .mcp.json stays untracked by the global gitignore."
  fi
  if grep -q '"next"' "$D/package.json" && ! grep -q 'next-devtools-mcp' "$D/.mcp.json" 2>/dev/null; then
    printf '%s\n' "NEXT DEVTOOLS MCP MISSING: this Next.js app has no next-devtools-mcp server in .mcp.json. Add {\"mcpServers\":{\"next-devtools\":{\"command\":\"npx\",\"args\":[\"-y\",\"next-devtools-mcp@latest\"]}}} (merge into the existing file)."
  fi
fi
exit 0
