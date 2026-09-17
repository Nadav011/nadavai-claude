#!/usr/bin/env bash
# Sourced from ~/.bashrc by setup.sh. Holds the shell side of the Claude
# environment: the bits that must be identical on every machine. Anything
# machine-specific (SDK paths, PATH order, hardware tuning) stays in ~/.bashrc.
#
# Every alias is guarded on its tool existing, so a machine without eza or
# batcat gets the plain command instead of a broken one.

# --- Claude ------------------------------------------------------------------
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
export CLAUDE_NTFY_TOPIC="${CLAUDE_NTFY_TOPIC:-claude-nadav}"
export NADAVAI_HOME="${NADAVAI_HOME:-$HOME/nadavai}"

# --- Build concurrency -------------------------------------------------------
# The same caps as settings.base.json, for shells Claude did not start. Derived
# from the core count rather than hardcoded: an unbounded test or build runner
# is what actually drives a machine into swap, and a number tuned for one
# machine is wrong on the next one.
if [ -z "${NADAVAI_JOBS:-}" ]; then
  _nv_cores="$(nproc 2>/dev/null || echo 4)"
  NADAVAI_JOBS=$(( _nv_cores * 3 / 8 ))       # ~40% of threads, leaves room to work
  [ "$NADAVAI_JOBS" -lt 2 ] && NADAVAI_JOBS=2
  unset _nv_cores
fi
export NADAVAI_JOBS
export MAKEFLAGS="-j$NADAVAI_JOBS"
export CARGO_BUILD_JOBS="$NADAVAI_JOBS"
export VITEST_MAX_THREADS="$NADAVAI_JOBS"
export VITEST_MIN_THREADS=1
export VITEST_MAX_FORKS="$NADAVAI_JOBS"
export RAYON_NUM_THREADS="$NADAVAI_JOBS"
export UV_THREADPOOL_SIZE=8
export NEXT_TELEMETRY_DISABLED=1

# --- Modern CLI --------------------------------------------------------------
command -v batcat  >/dev/null 2>&1 && alias cat='batcat --style=plain'
command -v fdfind  >/dev/null 2>&1 && alias find='fdfind'
command -v lazygit >/dev/null 2>&1 && alias lg='lazygit'
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --icons --group-directories-first'
  alias ll='eza -la --icons --group-directories-first'
  alias la='eza -a --icons --group-directories-first'
  alias lt='eza --tree --level=2 --icons'
fi

# --- Git ---------------------------------------------------------------------
alias g='git'
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline -20'

# --- Agents ------------------------------------------------------------------
# cs is continues (session handoff); csq is Claude Squad, renamed by setup.sh
# so the two stop fighting over the same name.
command -v csq >/dev/null 2>&1 && alias squad='csq'
alias aiup='ai-dev-up --attach'
alias aiup-all='ai-dev-up --attach --stack --chrome'
alias aichrome='ai-dev-chrome'
alias cexplain='claude -p "Explain this error and give the exact fix:"'
