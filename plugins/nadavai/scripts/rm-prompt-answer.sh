#!/usr/bin/env bash
# PermissionRequest hook (Bash, Monitor): answers Claude Code's removal-check prompt at once.
#
# Claude Code checks rm and rmdir commands whose target could be /, the home directory, the working
# directory or a top-level directory ("critical paths"), and commands it cannot read well enough to
# rule such a removal out. No permission mode auto-approves them. In bypassPermissions mode the
# terminal shows a prompt with a two-minute countdown and then denies, so an unattended session
# stands still for up to two minutes each time (154 such stops from 2026-10-15 to 2026-11-03, 61 of
# them answered by Nadav by hand). The documentation lets a PermissionRequest hook answer that
# prompt (code.claude.com/docs/en/permission-modes, "Critical-path removals in each permission mode").
#
# This hook answers "deny" with the rewrite, so the session goes on in seconds and the check itself
# stays on. It does not approve: the check fired because it could not show the removal is safe.
# Nadav, 2026-11-14: "לפתור שלא יהיה יותר את העציורת האלה של קלוד".
#
# Only in bypassPermissions mode: there a shell-command prompt comes from this check (there are no
# ask rules in this setup). In every other mode a prompt is the person's to answer, so the hook
# stays silent. Silent also for every other tool, and when jq is missing.
set -u
input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
[ "$(jq -r '.permission_mode // empty' <<<"$input" 2>/dev/null)" = bypassPermissions ] || exit 0
case "$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)" in
  Bash|Monitor) ;;
  *) exit 0 ;;
esac
cmd=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)

# One line per answer, for guard-stats and for checking later that the hook is what answered.
log=${XDG_CACHE_HOME:-$HOME/.cache}/nadavai/rm-prompt-answer.log
mkdir -p "${log%/*}" 2>/dev/null &&
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(jq -r '.session_id // "-"' <<<"$input" 2>/dev/null)" >>"$log" 2>/dev/null

if [[ $cmd =~ (^|[^[:alnum:]_.-])(rm|rmdir)([^[:alnum:]_.-]|$) ]]; then
  msg='Claude Code'"'"'s removal check stopped this command before it ran, and nothing was removed: a target could turn out to be /, the home directory, the working directory or a top-level directory (usually a variable or a substitution that may be empty, or $HOME or ~ as the root of the path). Run it again with every removal target written as a literal absolute path below the directory you mean. If a target has to be computed, put the removal in a script file, write each variable there as "${name:?}", and run that file.'
else
  msg='Claude Code could not read this command well enough to rule out a removal (nested quoting, eval, sh -c, or a heredoc followed by more commands), so it was not run. Write file contents with the Write tool and run the steps as separate plain commands.'
fi
jq -cn --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "deny", message: $m}}}'
exit 0
