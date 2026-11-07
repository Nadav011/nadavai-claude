#!/usr/bin/env bash
# usage: calib.sh <repo> <label> <path> [<path>...]
# Prints: label | lines (ts/tsx/sql) | commits | first | last | calendar weeks | distinct days
set -euo pipefail
repo="$1"; label="$2"; shift 2
cd "$repo"
G="git -c core.fsmonitor=false --no-optional-locks"
lines=$($G ls-files -- "$@" | grep -E '\.(ts|tsx|sql)$' | tr '\n' '\0' | xargs -0 cat 2>/dev/null | wc -l)
dates=$($G log --format=%ad --date=short -- "$@")
commits=$(printf '%s\n' "$dates" | grep -c . || true)
first=$(printf '%s\n' "$dates" | sort | head -1)
last=$(printf '%s\n' "$dates" | sort | tail -1)
days=$(printf '%s\n' "$dates" | sort -u | grep -c . || true)
weeks=$(( ( $(date -d "$last" +%s) - $(date -d "$first" +%s) ) / 604800 + 1 ))
echo "$label | $lines | $commits | $first | $last | $weeks | $days"
