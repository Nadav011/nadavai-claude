#!/usr/bin/env bash
# tests/prompt-store.sh: the /my-* prompts (plugins/nadavai/skills/my*) stay runnable.
# They are thin on purpose: several hand the job to a tool in bin/. This fails when a prompt points at
# something that is gone, and when a file under plugins/nadavai/, guides/ or bin/ names an oh-my-claudecode
# skill or agent type that tests/omc-names-allow.txt does not list (the plugin is being retired).
#
#   tests/prompt-store.sh        exit 0 when every prompt, menu row and tool lines up and no OMC name is left
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
skills="$here/plugins/nadavai/skills"
menu="$skills/my/SKILL.md"
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

for d in "$skills"/my "$skills"/my-*/; do
  d=${d%/}; name=$(basename "$d"); f="$d/SKILL.md"
  [ -f "$f" ] || { bad "$name has no SKILL.md"; continue; }
  grep -qx "name: $name" "$f" && ok || bad "$name: the name field differs from the folder"
  # Only Nadav starts these, and their descriptions stay out of every session's context.
  grep -qx 'disable-model-invocation: true' "$f" && ok || bad "$name: not marked user-only"
  grep -q '^description: "..*"$' "$f" && ok || bad "$name: no description for the menu"
  if [ "$name" != my ]; then
    grep -qF "\`/nadavai:$name\`" "$menu" && ok || bad "$name is missing from the menu in my/SKILL.md"
    grep -qF '$ARGUMENTS' "$f" && ok || bad "$name ignores the words typed after the command"
  fi
done

# Every row of the menu has a prompt behind it.
while read -r name; do
  [ -f "$skills/$name/SKILL.md" ] && ok || bad "the menu lists /nadavai:$name, which does not exist"
done < <(grep -o '/nadavai:my-[a-z-]*' "$menu" | sed 's#/nadavai:##' | sort -u)

# oh-my-claudecode is being retired (2026-11-14): its skills and agent types will not exist, so a file of
# ours that names one (oh-my-claudecode:<name>) points at nothing. Each such name in plugins/nadavai/,
# guides/ or bin/ must be listed in tests/omc-names-allow.txt as "path | name | reason"; a listed line
# that no longer appears fails too, so the list shrinks with the references. rules/ and settings/ are
# not scanned yet: their OMC names change in the rules pass.
# `.omc/` folders are left out: the plugin's hooks write session state there (ignored by git), in
# whatever folder a session ran, and those files name its agent types.
allow="$here/tests/omc-names-allow.txt"
declare -A allowed=() seen=()
if [ -f "$allow" ]; then
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    path=${line%% | *}; rest=${line#* | }; name=${rest%% | *}; reason=${rest#* | }
    if [ "$rest" = "$line" ] || [ "$reason" = "$rest" ] || [ -z "${reason// /}" ]; then
      bad "omc-names-allow.txt: not path | name | reason: $line"; continue
    fi
    allowed["$path $name"]=1
  done < "$allow"
else
  bad "tests/omc-names-allow.txt is missing"
fi
while read -r path name; do
  [ -n "$path" ] || continue
  seen["$path $name"]=1
  if [ -n "${allowed["$path $name"]-}" ]; then ok
  else bad "$path names $name, which goes away with the plugin (replace it, or list it in tests/omc-names-allow.txt with the reason it stays)"; fi
done < <(cd "$here" && grep -rnoE --exclude-dir=.omc 'oh-my-claudecode:[A-Za-z0-9_*-]*' plugins/nadavai guides bin 2>/dev/null \
  | awk -F: '{print $1, $3 ":" $4}' | sort -u)
for k in "${!allowed[@]}"; do
  [ -n "${seen["$k"]-}" ] && ok || bad "omc-names-allow.txt lists '$k', which no longer appears: remove that line"
done

# Tools the prompts depend on: each prompt names its tool exactly, and the tool exists. A prompt that
# stops naming its tool (a typo, a rename) is a prompt that falls back to the session's memory.
while read -r prompt tool; do
  grep -qE "(^|[^a-z-])$tool([^a-z-]|\$)" "$skills/$prompt/SKILL.md" && ok || bad "$prompt no longer names $tool"
  [ -x "$here/bin/$tool" ] && ok || bad "bin/$tool, which $prompt runs, is missing"
done <<'PAIRS'
my-method token-audit
my-method webget
my-review session-digest
my-map session-digest
my-done session-digest
my-done session-close-check
my-other session-digest
my-other cs
my-resume resume-all
my-connected vault-login-add
my-wrong session-digest
my-missed session-digest
my-cost token-audit
my-cost subagent-context
my-cost executor-quality
my-cost guard-stats
my-fast heavy-slot
my-fast machines-now
my-machine heavy-slot
my-machine machines-now
my-agents heavy-slot
my-ship ci-wait
PAIRS
# Names a prompt cannot work without: a placeholder Claude Code fills in, a tool of the harness, a
# remote command. A typo in one of them is silent at run time.
while read -r prompt literal; do
  grep -qF -- "$literal" "$skills/$prompt/SKILL.md" && ok || bad "$prompt no longer contains $literal"
done <<'LITERALS'
my-review ${CLAUDE_SESSION_ID}
my-review --owner-only
my-map --owner-only
my-done --owner-only
my-review NOT IN THIS DIGEST
my-map NOT IN THIS DIGEST
my-done NOT IN THIS DIGEST
my-map ${CLAUDE_SESSION_ID}
my-done ${CLAUDE_SESSION_ID}
my-other ListAgents
my-other SendMessage
my-resume nadavai-deploy
my-resume resumeFromRunId
my-ask AskUserQuestion
my-wrong ${CLAUDE_SESSION_ID}
my-wrong AskUserQuestion
my-missed ${CLAUDE_SESSION_ID}
my-self agent-browser
my-connected agent-browser
my-run מה נחשב גמור
my-run לנעול את הסשן על היעד
my-show orca-cli
my-machine nadavai:machine-checkup
my-machine SendMessage
my-client client-messages/SKILL.md
my-client AskUserQuestion
my-save SendMessage
my-agents ListAgents
my-method ListAgents
my-method AskUserQuestion
my-method code.claude.com/docs/en/best-practices
my-method without doubles
my-method Review rounds converge
my-ship production-change.md
LITERALS
# The line those three prompts look for is written by the tool: the two sides stay in step.
grep -qF 'NOT IN THIS DIGEST' "$here/bin/session-digest" && ok \
  || bad "session-digest no longer writes the NOT IN THIS DIGEST line that the prompts read"
grep -q 'nadavai:reviewer' "$skills"/my-review/SKILL.md && [ -f "$here/plugins/nadavai/agents/reviewer.md" ] && ok \
  || bad "my-review needs the nadavai:reviewer agent"

echo "prompt-store: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
