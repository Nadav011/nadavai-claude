#!/usr/bin/env bash
# Pull the latest repo state and refresh the installed nadavai plugin and links.
#
#   ./update.sh          nadavai only (marketplace + plugin + symlinks)
#   ./update.sh --all    also refresh every other marketplace and dependency plugin
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$REPO/lib/common.sh"

ALL=0
[ "${1:-}" = "--all" ] && ALL=1

step "Repo"
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  warn "uncommitted changes in $REPO; skipping git pull"
else
  git -C "$REPO" pull --ff-only
fi

step "Marketplace"
if [ "$ALL" = 1 ]; then claude plugin marketplace update; else claude plugin marketplace update nadavai; fi

step "Plugin"
claude plugin update nadavai@nadavai
if [ "$ALL" = 1 ]; then
  while read -r dep; do
    claude plugin update "$dep" || warn "could not update $dep"
  done < <(dependency_ids)
fi

step "Links"
link_rules
link_git
retire_duplicate_skills

step "Done"
log "Restart open Claude Code sessions, or run /reload-plugins, to load the new version."
