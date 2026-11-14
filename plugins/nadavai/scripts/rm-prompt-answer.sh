#!/usr/bin/env bash
# PermissionRequest hook (Bash, Monitor): answers Claude Code's removal-check prompt at once.
#
# Claude Code checks rm and rmdir commands whose target could be /, the home directory, the working
# directory or a top-level directory ("critical paths"), and commands it cannot read well enough to
# rule such a removal out. No permission mode auto-approves them. In bypassPermissions mode the
# terminal shows a prompt with a two-minute countdown and then denies, so an unattended session
# stands still for up to two minutes each time (154 such stops from 2026-10-15 to 2026-11-03, 61 of
# them answered by Nadav by hand; 11 in the week to 2026-11-14). The documentation lets a
# PermissionRequest hook answer that prompt (code.claude.com/docs/en/permission-modes,
# "Critical-path removals in each permission mode").
#
# This hook answers "deny" with the rewrite the documentation gives, so the session goes on at once
# and the check itself stays on. It never approves: the check fired because it could not show the
# removal is safe. Nadav, 2026-11-14: "לפתור שלא יהיה יותר את העציורת האלה של קלוד".
#
# Measured on 2026-11-14 in four live sessions in bypass mode: 0.16 to 0.42 s from the call to the
# denial. One ran in a terminal that Orca created, with Orca's own permission hook live; one had a
# second permission hook that stayed silent for 60 s. Claude Code acts on the first decision and
# does not wait for the other permission hooks.
#
# Only in bypassPermissions mode: there a shell-command prompt comes from this check, because this
# setup has no ask rules. The input carries no reason, so the hook cannot tell a removal stop from
# a prompt of another kind: an ask rule added later, or a removal on a mounted drive, gets the same
# denial. In every other mode a prompt is the person's to answer, so the hook stays silent (in plan
# mode the prompt then waits with no time limit). Silent also for every other tool, and when jq is
# missing. With the hook in place a person no longer sees this prompt in bypass mode, so nobody
# approves one at the terminal: a removal of a path that is itself protected is reported as blocked,
# with its command, for Nadav to run. The log below keeps the start of each denied command; the file
# is private, and the transcript holds the same text.
set -u
input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
# Claude Code always names the event; another agent that reads this hooks.json (Codex) does not send
# this pair, so its approvals are left alone.
[ "$(jq -r '.hook_event_name // empty' <<<"$input" 2>/dev/null)" = PermissionRequest ] || exit 0
[ "$(jq -r '.permission_mode // empty' <<<"$input" 2>/dev/null)" = bypassPermissions ] || exit 0
tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)
case "$tool" in
  Bash|Monitor) ;;
  *) exit 0 ;;
esac
cmd=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)

if [[ $cmd =~ (^|[^[:alnum:]_.-])(rm|rmdir)([^[:alnum:]_.-]|$) ]]; then
  kind="rm"
  msg='Claude Code'"'"'s removal check stopped this command before it ran, and nothing was removed. It stops an rm or rmdir whose target could turn out to be /, the home directory, the working directory or one of its parents, or a top-level directory: $HOME or ~ followed by a variable or a substitution, an unguarded variable followed by / or a glob, a variable set from $(pwd) or a similar command, a target that is only a command substitution, or a glob such as dir/*/*. Write each target as a literal absolute path below the directory you mean and run it again. If the path has to be computed, first run the command that computes it on its own, read the path it prints, and then remove that literal path in a second command. Do not move the removal into a script file, eval or another wrapper to get around the check. If a literal absolute path is stopped again, the path itself is protected (the working directory or one of its parents, the home directory, a top-level directory, or a mounted drive under /mnt, /media or /run/media): do not retry it and do not remove it another way; list it as blocked in your report with the exact command, for Nadav to run in his shell.'
else
  kind="parse"
  msg='Claude Code could not read this command well enough to rule out a removal (nested quoting, eval, sh -c, or a heredoc followed by more commands), so it was not run. Write file contents with the Write tool and run the steps as separate plain commands. If the command already was one plain command, a prompt of another kind was answered here: name it in your report.'
fi

# One line per answer: time, session, tool, which message, the command's length and its first 160
# characters on one line. guard-stats and the weekly check read it to see what the hook answered.
log=${XDG_CACHE_HOME:-$HOME/.cache}/nadavai/rm-prompt-answer.log
head=${cmd:0:160}; head=${head//[$'\t\r\n']/ }
( umask 077; mkdir -p "${log%/*}" 2>/dev/null &&
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(jq -r '.session_id // "-"' <<<"$input" 2>/dev/null)" "$tool" "$kind" "${#cmd}" "$head" >>"$log" ) 2>/dev/null

jq -cn --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "deny", message: $m}}}'
exit 0
