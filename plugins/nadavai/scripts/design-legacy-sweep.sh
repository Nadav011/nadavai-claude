#!/usr/bin/env bash
# Legacy design-system sweep for /ux-setup step 0 (nadav-design skill).
#   design-legacy-sweep.sh          list every file name and file content that smells of an older design/skill/memory system
#   design-legacy-sweep.sh --verify same, minus the files the new setup itself creates; empty output = clean
# Patterns and the allow-list live here, once, so the skill never carries regexes in prose.
set -u
D="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$D" || exit 1
NAME_RE='design|ui-ux|uiux|taste|impeccable|superdesign|stitch|pro-?max|brandkit|mockup|wireframe|style-?guide|tokens?\.(json|md)|prd|spec-design|nadav-(design|qa|fidelity)|ux-doctrine|polish-journey|previsual|live-design|decision-page|prompt-spec|\.claude/|\.agents/|\.cursor/|\.codex/|\.omc/skills|\.omc/plans'
TEXT_RE='impeccable|superdesign|ui-ux-pro-max|taste-skill|gpt-taste|design-taste|redesign-existing|nadav-design|nadav-qa|ux-doctrine|polish-journey|live-design-lab|mockup-to-app|DESIGN-CONSTITUTION|design system rules|design tokens'
# Files the new setup creates or edits on purpose; ignored only with --verify.
ALLOW_RE='^(DESIGN\.md|PRODUCT\.md|design/[^/]+/DESIGN\.md|docs/specs/|docs/ui-audit/|e2e/dod/|playwright\.dod\.config\.ts|\.claude/rules/ui\.md|\.claude/settings\.json|\.mcp\.json|\.omc/archive/|\.omc/design-runs/|\.github/workflows/ui\.yml|\.github/PULL_REQUEST_TEMPLATE\.md|lighthouserc\.json|package\.json|CLAUDE\.md|AGENTS\.md|STATUS\.md|BACKLOG\.md|.*/base\.css|.*styleguide.*|app/accessibility/|app/privacy/)'
verify=0; [ "${1:-}" = "--verify" ] && verify=1
names="$(git ls-files -co --exclude-standard | grep -viE '^(node_modules|\.next|dist|build|public/fonts)/' | grep -iE "$NAME_RE" || true)"
texts="$(grep -rilE "$TEXT_RE" --include='*.md' --include='*.json' --include='*.mdc' --include='*.txt' --include='*.html' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=state --exclude-dir=logs --exclude-dir=handoffs --exclude-dir=artifacts --exclude-dir=reports --exclude-dir=test-results --exclude-dir=playwright-report . 2>/dev/null | sed 's|^\./||' || true)"
all="$(printf '%s\n%s\n' "$names" "$texts" | sed '/^$/d' | sort -u)"
if [ "$verify" = 1 ]; then all="$(printf '%s\n' "$all" | grep -vE "$ALLOW_RE" || true)"; fi
printf '%s\n' "$all" | sed '/^$/d'
