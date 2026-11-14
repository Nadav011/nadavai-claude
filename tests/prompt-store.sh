#!/usr/bin/env bash
# tests/prompt-store.sh: the /my-* prompts (plugins/nadavai/skills/my*) stay runnable.
# They are thin on purpose: several hand the job to an oh-my-claudecode skill or to a tool in bin/,
# and OMC renames skills between versions. This fails when a prompt points at something that is gone.
#
#   tests/prompt-store.sh        exit 0 when every prompt, menu row, engine skill and tool lines up
#   OMC_SKILLS=<dir>             the installed OMC skills folder (default: the active install, else the newest cached)
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
skills="$here/plugins/nadavai/skills"
menu="$skills/my/SKILL.md"
# The copy Claude Code runs is the one in installed_plugins.json; the cache can also hold older ones.
active=$(jq -r '.plugins | to_entries[] | select(.key | startswith("oh-my-claudecode@")) | .value[0].installPath' \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json" 2>/dev/null | head -1)
omc=${OMC_SKILLS:-${active:+$active/skills}}
[ -n "$omc" ] && [ -d "$omc" ] \
  || omc=${OMC_SKILLS:-$(find "$HOME"/.claude/plugins/cache/*/oh-my-claudecode -maxdepth 2 -name skills -type d 2>/dev/null | sort -V | tail -1)}
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

# Engine skills: present in the installed OMC, and open to the model (a user-only skill cannot be
# invoked through the Skill tool).
engines=$(grep -ho 'oh-my-claudecode:[a-z-]*' "$skills"/my*/SKILL.md | sort -u)
if [ -z "$omc" ] || [ ! -d "$omc" ]; then
  echo "note: oh-my-claudecode is not installed here; engine skills not checked: $(echo $engines)"
else
  for e in $engines; do
    f="$omc/${e#oh-my-claudecode:}/SKILL.md"
    if [ ! -f "$f" ]; then bad "$e is not in $omc"
    elif grep -qx 'disable-model-invocation: true' "$f"; then bad "$e is user-only, a prompt cannot invoke it"
    else ok; fi
  done
fi

# Tools the prompts depend on: each prompt names its tool exactly, and the tool exists. A prompt that
# stops naming its tool (a typo, a rename) is a prompt that falls back to the session's memory.
while read -r prompt tool; do
  grep -qE "(^|[^a-z-])$tool([^a-z-]|\$)" "$skills/$prompt/SKILL.md" && ok || bad "$prompt no longer names $tool"
  [ -x "$here/bin/$tool" ] && ok || bad "bin/$tool, which $prompt runs, is missing"
done <<'PAIRS'
my-review session-digest
my-map session-digest
my-done session-digest
my-done session-close-check
my-other session-digest
my-other cs
my-resume resume-all
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
my-show orca-cli
my-machine nadavai:machine-checkup
my-machine SendMessage
my-client client-messages/SKILL.md
my-client AskUserQuestion
my-save SendMessage
my-agents ListAgents
my-ship production-change.md
LITERALS
grep -q 'nadavai:reviewer' "$skills"/my-review/SKILL.md && [ -f "$here/plugins/nadavai/agents/reviewer.md" ] && ok \
  || bad "my-review needs the nadavai:reviewer agent"

echo "prompt-store: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
