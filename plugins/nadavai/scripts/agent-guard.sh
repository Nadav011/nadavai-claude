#!/usr/bin/env bash
# PreToolUse hook (Agent, Bash): two opt-in guards. Deny only, never updatedInput
# (it replaces the whole tool input).
#   Agent: subagent_type "fork" unless the description carries [fork]. A fork inherits
#          the parent's model and its full context (median ~290K tokens per request).
#   Bash:  a sleep of 120 s or more in the foreground. It blocks the agent; long local
#          commands go to run_in_background, CI waits to ci-wait.
# Silent (exit 0, no output) for everything else.
set -u
input=$(cat)

# Fast path: most calls carry neither word, and this runs before every Bash call.
case "$input" in
  *'"fork"'*|*sleep*) ;;
  *) exit 0 ;;
esac
command -v jq >/dev/null 2>&1 || exit 0

deny() {
  jq -cn --arg r "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)
case "$tool" in
  Agent)
    [ "$(jq -r '.tool_input.subagent_type // empty' <<<"$input")" = fork ] || exit 0
    [[ $(jq -r '.tool_input.description // empty' <<<"$input") == *"[fork]"* ]] && exit 0
    deny 'A fork inherits your model and your whole context (median ~290K tokens per request). Use a named subagent_type with only the context it needs. If a fork is really what you want, put [fork] in the description.'
    ;;
  Bash)
    [ "$(jq -r '.tool_input.run_in_background // false' <<<"$input")" = true ] && exit 0
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    cmd=${cmd//$'\n'/;}
    # sleep at a command position: line start, after ; & | ( { or do/then/else.
    re='(^|[;&|({]|[[:space:]](do|then|else))[[:space:]]*sleep[[:space:]]+([0-9]+(\.[0-9]+)?)([smhd]?)([[:space:];&|)}]|$)'
    rest=$cmd
    while [[ $rest =~ $re ]]; do
      n=${BASH_REMATCH[3]%%.*}; unit=${BASH_REMATCH[5]}
      case "$unit" in m) n=$((n * 60)) ;; h) n=$((n * 3600)) ;; d) n=$((n * 86400)) ;; esac
      if [ "$n" -ge 120 ]; then
        deny "sleep ${BASH_REMATCH[3]}${unit} blocks you for $n s. Run the long command with run_in_background: true and continue when the completion notice arrives; for NadavAI CI use ci-wait <repo> <sha|branch> in the background."
      fi
      rest=${rest#*"${BASH_REMATCH[0]}"}
    done
    ;;
esac
exit 0
