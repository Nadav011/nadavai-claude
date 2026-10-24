#!/usr/bin/env bash
# Sourced by shell/nadavai.sh in an interactive shell of the Claude desktop app's Terminal panel
# (TERM_PROGRAM=claude-desktop), so the panel's + opens a tab that starts with a menu: the agents
# to open, and the Claude and Codex accounts ccswap holds, each with a short command.
#
# The menu prints and returns; it never waits for a key. Why: Claude types its own commands into
# these tabs right after the startup files finish, and a read here would swallow them.

# label|command, in menu order. Only agents whose command is on PATH get a number.
_nv_agent_list='Codex|codex
Grok|grok
Antigravity|agy
Gemini|gemini
OpenCode|opencode
Claude|claude'

# Reads `ccswap list --json` on stdin; prints one line per account, then a tab, the alias name
# and its command (empty for a header line).
read -r -d '' _nv_accounts_py <<'PY'
import json, sys

try:
    d = json.load(sys.stdin)
except Exception:
    print('  (ccswap could not list accounts)\t\t')
    sys.exit()


def win(name, w):
    if not isinstance(w, dict) or 'pct' not in w:
        return name + ' -'
    if w['pct'] >= 100:
        return '\033[31m' + name + ' blocked until ' + str(w.get('clock', '?')) + '\033[0m'
    return name + ' ' + str(round(w['pct'])) + '%'


claude = (d.get('claude') or {}).get('accounts') or []
codex = (d.get('codex') or {}).get('accounts') or []
if claude:
    print('\033[1mClaude accounts:\033[0m\t\t')
for a in claude:
    u = a.get('usage') or {}
    mark = '●' if a.get('active') else '○'
    if a.get('usageStatus') == 'ok':
        use = win('5h', u.get('fiveHour')) + ' · ' + win('7d', u.get('sevenDay'))
    else:
        use = str(a.get('usageStatus', ''))
    n = 's' + str(a['number'])
    print('  ' + n + ' ' + mark + ' ' + a['email'] + '  ' + use + '\t' + n + '\tccswap switch ' + a['email'])
if codex:
    print('\033[1mCodex accounts:\033[0m\t\t')
for a in codex:
    mark = '●' if a.get('active') else '○'
    n = 'x' + str(a['number'])
    print('  ' + n + ' ' + mark + ' ' + a['email'] + '  ' + str(a.get('label', '')) + '\t' + n + '\tccswap codex switch ' + a['email'])
PY

nv_menu() {
  local n=0 label cmd line agents=""
  while IFS='|' read -r label cmd; do
    command -v "$cmd" >/dev/null 2>&1 || continue
    n=$((n + 1))
    # shellcheck disable=SC2139  # expanded now on purpose: the alias holds this agent's command
    alias "$n=$cmd"
    agents+="  $n $label"
  done <<< "$_nv_agent_list"
  printf '\033[1mAgents:\033[0m%s\n' "${agents:-  (none on PATH)}"

  if command -v ccswap >/dev/null 2>&1; then
    # One line per account; each line also carries the alias it defines, after a tab.
    while IFS=$'\t' read -r line name target; do
      [ -n "$line" ] || continue
      printf '%s\n' "$line"
      # shellcheck disable=SC2139
      [ -n "$name" ] && alias "$name=$target && nv_menu"
    done < <(ccswap list --json 2>/dev/null | python3 -I -c "$_nv_accounts_py")
  fi
  printf '\033[2mA number opens an agent here; s<N> or x<N> switches account; menu shows this again.\033[0m\n'
}

alias menu=nv_menu
nv_menu
