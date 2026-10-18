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

is_agy=0
case "$input" in *'"toolCall"'*) is_agy=1 ;; esac

allow() {
  [ "$is_agy" = 1 ] && printf '%s\n' '{"decision":"ask"}'
  exit 0
}

deny() {
  if [ "$is_agy" = 1 ]; then
    jq -cn --arg r "$1" '{decision: "deny", reason: $r}'
  else
    jq -cn --arg r "$1" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  fi
  exit 0
}

# Fast path: most calls carry neither word, and this runs before every Bash/run_command call.
case "$input" in
  *'"fork"'*|*sleep*) ;;
  *) allow ;;
esac
command -v jq >/dev/null 2>&1 || allow

check_sleep() {
  awk '
    function secs(w,  n, u) {
      u = substr(w, length(w)); n = w
      if (u ~ /[smhd]/) n = substr(w, 1, length(w) - 1); else u = "s"
      return n * (u == "m" ? 60 : u == "h" ? 3600 : u == "d" ? 86400 : 1)
    }
    hd != "" { t = $0; sub(/^\t+/, "", t); if (t == hd) hd = ""; next }
    {
      line = $0
      if (match(line, /<<-?[ \t]*["\x27]?[A-Za-z_][A-Za-z0-9_]*/)) {
        hd = substr(line, RSTART, RLENGTH); sub(/^<<-?[ \t]*["\x27]?/, "", hd)
      }
      gsub(/\x27[^\x27]*\x27/, "", line); gsub(/"([^"\\]|\\.)*"/, "", line)
      all = all " ; " line
    }
    END {
      gsub(/[;&|(){}]/, " ; ", all); n = split(all, w, /[ \t]+/)
      best = 0; cmdpos = 1
      for (i = 1; i <= n; i++) {
        if (w[i] == "") continue
        if (cmdpos && w[i] == "sleep") {
          tot = 0; txt = "sleep"
          for (j = i + 1; j <= n && w[j] ~ /^[0-9]*\.?[0-9]+[smhd]?$/; j++) { tot += secs(w[j]); txt = txt " " w[j] }
          if (tot > best) { best = tot; besttxt = txt }
          i = j - 1; cmdpos = 0; continue
        }
        cmdpos = (w[i] == ";" || w[i] == "do" || w[i] == "then" || w[i] == "else")
      }
      if (best >= 120) printf "%d\t%s\n", best, besttxt
    }'
}

if [ "$is_agy" = 1 ]; then
  tool=$(jq -r '.toolCall.name // empty' <<<"$input" 2>/dev/null)
  case "$tool" in
    invoke_subagent)
      has_untagged_fork=$(jq -r '
        [.toolCall.args.Subagents[]? | select(.TypeName == "fork" and ((.Role // "") + " " + (.Prompt // "") | contains("[fork]") | not))] | length
      ' <<<"$input" 2>/dev/null)
      [ "${has_untagged_fork:-0}" -gt 0 ] && deny 'A fork inherits your model and your whole context. Use a named subagent with only the context it needs. If a fork is really what you want, put [fork] in the Role or Prompt.'
      ;;
    run_command)
      [ "$(jq -r '.toolCall.args.IsDaemon // false' <<<"$input")" = true ] && allow
      found=$(jq -r '.toolCall.args.CommandLine // empty' <<<"$input" | check_sleep)
      if [ -n "$found" ]; then
        deny "${found#*$'\t'} blocks you for ${found%%$'\t'*} s. Run the long command in the background and continue when the completion notice arrives; for NadavAI CI use ci-wait <repo> <sha|branch>."
      fi
      ;;
  esac
  allow
fi

tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)
case "$tool" in
  Agent)
    [ "$(jq -r '.tool_input.subagent_type // empty' <<<"$input")" = fork ] || allow
    [[ $(jq -r '.tool_input.description // empty' <<<"$input") == *"[fork]"* ]] && allow
    deny 'A fork inherits your model and your whole context (median ~290K tokens per request). Use a named subagent_type with only the context it needs. If a fork is really what you want, put [fork] in the description.'
    ;;
  Bash)
    [ "$(jq -r '.tool_input.run_in_background // false' <<<"$input")" = true ] && allow
    found=$(jq -r '.tool_input.command // empty' <<<"$input" | check_sleep)
    if [ -n "$found" ]; then
      deny "${found#*$'\t'} blocks you for ${found%%$'\t'*} s. Run the long command with run_in_background: true and continue when the completion notice arrives; for NadavAI CI use ci-wait <repo> <sha|branch> in the background."
    fi
    ;;
esac
allow
