#!/usr/bin/env bash
# SessionStart hook: print the setup steps still pending for the project in the cwd.
# Plain stdout from a SessionStart hook is added to Claude's context.
#   PROJECT-FACTS.md present            -> re-init pending (guides/project-reinit.md)
#   UI project without DESIGN.md/PRODUCT.md -> design layer pending (guides/design-init.md)
set -u

if [ "${1:-}" = "--antigravity" ]; then
  input="$(cat 2>/dev/null || true)"
  if command -v jq >/dev/null 2>&1; then
    ws="$(jq -r '.workspacePaths[0] // empty' <<<"$input" 2>/dev/null || true)"
    [ -n "$ws" ] && export CLAUDE_PROJECT_DIR="$ws"
  fi
  out="$("$0")"
  pdir="${CLAUDE_PROJECT_DIR:-$PWD}"
  if ls "$pdir"/.claude/rules/*.md >/dev/null 2>&1; then
    rules_summary="PROJECT PATH-SCOPED RULES (.claude/rules/): before reading or editing files matching a rule's paths, call view_file on that rule file:"
    for rf in "$pdir"/.claude/rules/*.md; do
      [ -f "$rf" ] || continue
      globs="$(awk '/^---$/{f=!f; next} f && /^[[:space:]]*-[[:space:]]*/{gsub(/^[[:space:]]*-[[:space:]]*"?|"?[[:space:]]*$/, ""); printf "%s, ", $0}' "$rf" | sed 's/, $//')"
      rules_summary+=$'\n'"  - $rf (${globs:-always})"
    done
    out="${out:+$out$'\n'}$rules_summary"
  fi
  if [ -n "$out" ] && command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$out" '{injectSteps:[{systemMessage:{systemMessage:$m}}]}'
  else
    printf '{}\n'
  fi
  exit 0
fi

D="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -d "$D" ] || exit 0
# Grok loads this hook from the plugin and from ~/.grok/hooks. One report per session.
if [ -n "${GROK_SESSION_ID:-}" ]; then
  stamp="${XDG_RUNTIME_DIR:-/tmp}/nadavai-project-check-${GROK_SESSION_ID}"
  mkdir -p "$(dirname "$stamp")" 2>/dev/null || true
  if [ -e "$stamp" ]; then exit 0; fi
  : >"$stamp" 2>/dev/null || true
fi

# Only real projects: a git repo with a package manifest. Keeps the home directory and scratch folders quiet.
is_project=0
if [ "$(git -C "$D" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$D" && pwd -P)" ] \
   && { [ -f "$D/package.json" ] || [ -f "$D/pyproject.toml" ] || [ -f "$D/pubspec.yaml" ] || [ -f "$D/Package.swift" ]; }; then is_project=1; fi

if [ "$is_project" = 1 ] && [ ! -f "$D/CLAUDE.md" ] && [ ! -f "$D/PROJECT-FACTS.md" ]; then
  printf '%s\n' "CLAUDE.MD MISSING: this project has no CLAUDE.md. Tell Nadav once, in Hebrew, to run /init in this session (Claude Code's own command, which writes the project's CLAUDE.md); afterwards make AGENTS.md a symlink to CLAUDE.md (for Codex) and commit."
fi
if [ "$is_project" = 1 ] && [ -f "$D/CLAUDE.md" ] && [ ! -e "$D/AGENTS.md" ]; then
  printf '%s\n' "AGENTS.MD MISSING: CLAUDE.md exists but AGENTS.md does not. Create it as a symlink to CLAUDE.md (ln -s CLAUDE.md AGENTS.md) so Codex reads the same instructions, and commit."
fi

if [ -f "$D/PROJECT-FACTS.md" ]; then
  printf '%s\n' "PROJECT REINIT PENDING: this project has PROJECT-FACTS.md at its root, so it was cleaned but not re-initialized. Follow ~/nadavai/guides/project-reinit.md now: tell Nadav to run /init (Claude Code's own command, which writes a new CLAUDE.md), then paste the merge prompt from that guide."
fi

if [ -f "$D/package.json" ] && grep -qE '"(react|next|vite|vue|svelte|@angular/core)"' "$D/package.json"; then
  missing=""
  [ -f "$D/DESIGN.md" ] || missing="DESIGN.md"
  [ -f "$D/PRODUCT.md" ] || missing="${missing:+$missing and }PRODUCT.md"
  if [ -n "$missing" ]; then
    printf '%s\n' "DESIGN SETUP PENDING: this UI project has no $missing at its root. Tell Nadav once, in Hebrew, to run /ux-setup (the nadav-design skill; ~/nadavai/guides/design-init.md is the fallback when it is unavailable), after project-reinit if that is pending too."
  fi
  if [ -f "$D/DESIGN.md" ] && [ -f "$D/PRODUCT.md" ] && [ ! -d "$D/e2e/dod" ]; then
    printf '%s\n' "DOD GATE MISSING: DESIGN.md and PRODUCT.md exist but e2e/dod/ does not. Tell Nadav to run /ux-setup (its step 12 installs the gate from ~/nadavai/templates/dod/)."
  fi
  # UI loop position (nadav-design skill), derived from tracked files only (rules in its Hard rules).
  if [ -f "$D/DESIGN.md" ] && [ -f "$D/PRODUCT.md" ]; then
    # The CI step (nadav-design shared/rules.md, "Where checks run"): a lint:ui or DoD step in the repo's
    # .woodpecker/*.yml (a bare routes.mjs --check is not one), or .github/workflows/ui.yml with the DoD score
    # gate line (the nightly's input) plus a nightly *-ui.yml whose `bin/audit <key>-ui` maps <key> to this repo.
    ci_step=0 ci_note=""
    grep -qsE 'lint:ui|playwright\.dod|(pnpm|npm run|yarn|bun run) dod([[:space:]:]|$)' "$D"/.woodpecker/*.yml && ci_step=1
    nightly="${NADAVAI_NIGHTLY_DIR:-$HOME/Projects/nadavai-nightly}"
    if [ "$ci_step" = 0 ] && grep -vE '^[[:space:]]*#' "$D/.github/workflows/ui.yml" 2>/dev/null | grep -qiE 'dod score must be 100|check-dod-score'; then
      if [ -f "$nightly/bin/audit" ]; then
        repo_name="$(basename "$(git -C "$D" remote get-url origin 2>/dev/null)" .git)"
        [ -n "$repo_name" ] || repo_name="$(basename "$D")"
        key="$(grep -m1 '^declare -A REPO=' "$nightly/bin/audit" | grep -oE "\[[a-z0-9]+\]=${repo_name}([[:space:])]|$)" | head -1 | sed -E 's/^\[([a-z0-9]+)\].*/\1/')"
        [ -n "$key" ] && grep -qsE "bin/audit ${key}-ui([[:space:]]|$)" "$nightly"/.woodpecker/*-ui.yml && ci_step=1
      else
        ci_step=1 ci_note="nightly registration could not be verified on this machine (no nadavai-nightly checkout at $nightly); "
      fi
    fi
    missing_ui=""
    [ -f "$D/.claude/rules/ui.md" ] || missing_ui=".claude/rules/ui.md"
    [ -d "$D/e2e/dod" ] || missing_ui="${missing_ui:+$missing_ui, }e2e/dod/"
    [ -f "$D/lighthouserc.json" ] || missing_ui="${missing_ui:+$missing_ui, }lighthouserc.json"
    [ "$ci_step" = 1 ] || missing_ui="${missing_ui:+$missing_ui, }the CI step (a lint:ui or DoD step in .woodpecker/, or .github/workflows/ui.yml with the DoD score gate plus the repo's nightly *-ui.yml)"
    redesign_dir="$HOME/design-redesign/$(basename "$D")"
    ui_state="${ci_note}setup complete"
    if [ -n "$missing_ui" ]; then
      ui_state="${ci_note}setup incomplete: $missing_ui missing"; ui_next="/ux-setup"
    elif [ -f "$redesign_dir/redesign.json" ] && ! grep -qsE '^Status: OWNER-APPROVED answer [0-9]+ commit [0-9a-f]+$' "$redesign_dir/plan/build-plan.md"; then
      ui_state="$ui_state; redesign in progress, build plan not approved ($redesign_dir)"; ui_next="/ux-redesign"
    elif ls "$D"/docs/specs/*.md >/dev/null 2>&1 && grep -qE '^\s*- \[ \]' "$D"/docs/specs/*.md; then ui_next="/ux-screen <first unchecked screen in docs/specs/*.md>"
    elif [ ! -f "$D/docs/ui-audit/PLAN.md" ]; then
      done_screens="$(cat "$D"/docs/specs/*.md 2>/dev/null | grep -cE '^\s*- \[x\]' || true)"
      if [ "${done_screens:-0}" -ge 4 ]; then ui_next="/ux-audit (${done_screens} screens built, no docs/ui-audit/PLAN.md yet)"
      elif ls "$D"/docs/specs/*.md >/dev/null 2>&1; then ui_next="/ux-plan <feature> (all planned screens built; plan the next feature) or /ux-audit"
      else ui_next="/ux-audit for an existing project, /ux-plan <feature> for a new one"; fi
    elif grep -qE '^\s*- \[ \]' "$D/docs/ui-audit/PLAN.md"; then ui_next="/ux-screen <first open item in docs/ui-audit/PLAN.md>"
    elif ! grep -qiE 'UI system.*released [0-9]{4}-[0-9]{2}-[0-9]{2}' "$D/STATUS.md" "$D/BACKLOG.md" 2>/dev/null; then ui_next="/ux-ship"
    else ui_next="/ux-plan <feature> for the next feature; /ux-ship step 8 weekly; /ux-retro after each run"
    fi
    printf '%s\n' "UI LOOP: $ui_state; next: $ui_next. Tell Nadav in one Hebrew line at the start of the session (or /ux-next for the full picture)."
  fi
  # PostHog: every production app reports usage and errors to it (guides/posthog-init.md).
  # Silent once the SDK is in package.json or CLAUDE.md mentions PostHog (connected or "not used").
  if ! grep -qE '"(posthog-js|posthog-node|posthog-react-native|@posthog/[a-z0-9-]+)"' "$D/package.json" \
     && ! grep -qi 'posthog' "$D/CLAUDE.md" 2>/dev/null; then
    printf '%s\n' "POSTHOG PENDING: this UI project has no PostHog SDK in package.json and CLAUDE.md does not mention PostHog. Follow ~/nadavai/guides/posthog-init.md: tell Nadav once, in Hebrew, that the app is not connected to PostHog and ask whether to connect it now or mark it as not used."
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
