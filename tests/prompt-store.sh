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
    # The hint in brackets is what he sees after the prompt's name in the prompt box. It says
    # whether he has to add words and which (he asked on 2026-11-14 what "[מה השתנה]" had to do
    # with the action).
    grep -qE '^argument-hint: "\[(לא חובה|כותבים כאן): .+\]"$' "$f" && ok || bad "$name: the hint in brackets does not say whether words are needed (לא חובה: / כותבים כאן:)"
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
my-study webget
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
my-machine disk-now
my-machine docker-tidy
my-machine worktree-clean
my-tools orca-update
my-agents heavy-slot
my-ship ci-wait
PAIRS
# The resume prompt wakes other sessions only on his yes, and the rule beside it says the same.
grep -q 'resume-all --environment msi' "$skills/my-resume/SKILL.md" && ok || bad "my-resume no longer covers the other machine"
grep -q 'AskUserQuestion' "$skills/my-resume/SKILL.md" && grep -q 'On his yes, run the same commands with `--send --only' "$skills/my-resume/SKILL.md" && ok \
  || bad "my-resume no longer asks him before it wakes other sessions"
grep -q 'with `--send` only on his yes in a dialog' "$here/rules/working-style.md" && ok \
  || bad "rules/working-style.md no longer says resume-all --send runs only on his yes"
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
my-takeover my-other/SKILL.md
my-takeover my-run/SKILL.md
my-takeover מה נחשב גמור
my-case wacli
my-case action-safety.md
my-case my-client/SKILL.md
my-study AskUserQuestion
my-study ~/.claude/projects/*/memory/
my-plan AskUserQuestion
my-plan guides/documents.md
my-plan guides/review-rounds.md
my-design nadavai:nadav-design
my-design my-show/SKILL.md
my-creative nadavai:social-campaigns
my-creative nadavai:hebrew-content-writer
my-creative my-show/SKILL.md
my-stores nadavai:store-apps
my-tools update.sh
my-tools /nadavai:my-machine
my-sweep AskUserQuestion
my-sweep /nadavai:my-method
LITERALS
# What a prompt hands the work to has to be there: a skill of this plugin it invokes, another
# prompt's file it sends the session to read, a guide it names.
for s in $(grep -ho 'nadavai:[a-z][a-z0-9-]*' "$skills"/my-*/SKILL.md | sort -u | grep -v '^nadavai:my-' | grep -v '^nadavai:reviewer$'); do
  [ -f "$skills/${s#nadavai:}/SKILL.md" ] && ok || bad "a prompt names the skill $s, which is not in plugins/nadavai/skills"
done
for f in $(grep -ho 'plugins/nadavai/skills/my-[a-z-]*/SKILL\.md' "$skills"/my-*/SKILL.md | sort -u); do
  [ -f "$here/$f" ] && ok || bad "a prompt sends the session to $f, which does not exist"
done
for g in $(grep -ho '~/nadavai/guides/[a-z0-9-]*\.md' "$skills"/my-*/SKILL.md | sort -u); do
  [ -f "$here/guides/${g##*/}" ] && ok || bad "a prompt names $g, which is not in guides/"
done
# A rule file a prompt names has to exist: a rule that was renamed or removed is found here
# (rules/nadavai.md, third bullet). The three other names are files that session-digest writes
# and a memory file.
for r in $(grep -ho '`[a-z][a-z0-9-]*\.md`' "$skills"/my-*/SKILL.md "$menu" | tr -d '`' | sort -u); do
  case "$r" in index.md|decisions-made-alone.md|disk-cleanup-keep-list.md) continue ;; esac
  [ -f "$here/rules/$r" ] || [ -f "$here/guides/$r" ] && ok || bad "a prompt names $r, which is in neither rules/ nor guides/"
done
# What a prompt puts between « and » as Nadav's own words has to be something he typed. The
# count of his messages is not part of this repo, so the check runs where that file is.
typed=${PROMPT_STORE_TYPED:-$HOME/.omc/plans/method-review-2026-11-13/prompt-store/corpus-2026-11-14/typed.jsonl}
# The check is kept in a variable, because it runs twice: on his real messages, and on a made-up
# transcript that proves the check itself (below).
read -r -d '' QUOTE_PY <<'PY' || true
import glob, json, os, re, sys
squash = lambda t: re.sub(r"\s+", " ", t).strip()
said = [squash(json.loads(line).get("text", "")) for line in open(sys.argv[1], encoding="utf-8") if line.strip()]

# A record of type "user" with plain text is not always his: Claude Code writes a message from
# another session, a teammate's report, a task notice and a command's output the same way.
NOT_HIS = ("Another Claude session sent a message", "<teammate-message", "<task-notification",
           "<local-command-", "<command-", "<system-reminder", "Message from ")
PROJECTS = os.environ.get("PROMPT_STORE_PROJECTS") or os.path.expanduser("~/.claude/projects")

def typed_in(session, quote):
    """True when the session's transcript holds the quote in a message he typed, queued, or
    wrote as his own answer in a question dialog; False when the transcript is here and holds
    no such message; None when the transcript is not on this machine (Claude Code removes old
    transcripts), which the caller reports as not checked. Not counted: a tool's output, a
    typed or queued text that starts as the records in NOT_HIS do, and an answer that is an
    option the agent wrote. A text another session typed into his terminal with no such
    opening cannot be told from his own."""
    files = glob.glob(os.path.join(PROJECTS, "*", f"{session}*.jsonl"))
    if not files:
        return None
    for path in files:
        for line in open(path, encoding="utf-8", errors="replace"):
            if quote[:20] not in line:
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("isCompactSummary") or r.get("isMeta"):
                continue
            if r.get("type") == "queue-operation" and r.get("operation") == "enqueue":
                queued = str(r.get("content") or "")
                if not queued.lstrip().startswith(NOT_HIS) and quote in squash(queued):
                    return True
            if r.get("type") != "user":
                continue
            content = r.get("message", {}).get("content")
            if isinstance(content, str) and not content.lstrip().startswith(NOT_HIS) and quote in squash(content):
                return True
            # His own words typed into a question dialog: an answer of an AskUserQuestion call
            # that is not one of the options the agent offered there.
            result = r.get("toolUseResult")
            answers = result.get("answers") if isinstance(result, dict) else None
            if isinstance(answers, dict) and any(quote in squash(str(a)) for a in answers.values()):
                offered = " ".join(squash(str(o.get("label", "")) + " " + str(o.get("description", "")))
                                   for q in result.get("questions") or [] if isinstance(q, dict)
                                   for o in q.get("options") or [] if isinstance(o, dict))
                if quote not in offered:
                    return True
    return False

# What he typed after the count was made, kept beside this script with the session of each.
session = ""
for line in open(sys.argv[2], encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith("@"):
        session = line[1:].strip()
        continue
    quote = squash(line)
    found = typed_in(session, quote) if re.fullmatch(r"[0-9a-f]{8}[0-9a-f-]*", session) else False
    if found is False:
        print(f"later-quotes: no typed message in session {session or '(none named)'} holds «{quote[:60]}»")
        continue
    if found is None:
        print(f"note: later-quotes: NOT CHECKED, no transcript of session {session} on this machine: «{quote[:60]}»", file=sys.stderr)
    said.append(quote)
for path in sys.argv[3:]:
    for quote in re.findall(r"«([^»]+)»", open(path, encoding="utf-8").read()):
        q = squash(quote)
        if not any(q in t for t in said):
            print(f"{path.split('/')[-2]}: «{q}»")
PY
if [ -f "$typed" ] && command -v python3 >/dev/null; then
  missing=$(python3 -I -c "$QUOTE_PY" "$typed" "$here/tests/prompt-store.later-quotes.txt" "$skills"/my-*/SKILL.md)
  [ -z "$missing" ] && ok || bad "a prompt quotes words he did not type:
$missing"
else
  echo "note: the count of his messages is not on this machine; the quotes were not checked"
fi
# The check itself, on a made-up transcript: what he typed, queued or wrote as his own answer in a
# dialog is accepted, and what an agent or Claude Code wrote into the same kinds of record is not.
if command -v python3 >/dev/null && fx=$(mktemp -d) && [ -n "$fx" ] && [ -d "$fx" ]; then
  python3 -I - "$fx" <<'PY'
import json, os, sys
fx = sys.argv[1]
os.makedirs(f"{fx}/projects/p"); os.makedirs(f"{fx}/s/my-x")
ask = lambda answer: {"type": "user", "message": {"content": [{"type": "tool_result", "content": "ok"}]},
                      "toolUseResult": {"questions": [{"question": "q", "options": [{"label": "אפשרות שהסוכן הציע בחלון", "description": "הסבר"}]}],
                                        "answers": {"q": answer}}}
rows = [
    {"type": "user", "message": {"content": "משפט ראשון שהוא הקליד בעצמו"}},
    {"type": "queue-operation", "operation": "enqueue", "content": "❯\u00a0משפט שני שהוא שם בתור"},
    ask("תשובה שלישית שהוא כתב בעצמו בחלון"),
    {"type": "queue-operation", "operation": "enqueue", "content": "<task-notification>\n<result>תוצאה שסוכן כתב והגיעה בתור</result>"},
    {"type": "queue-operation", "operation": "enqueue", "content": "Message from the rules session: הודעה שסשן אחר הקליד כאן"},
    {"type": "user", "message": {"content": "<teammate-message teammate_id=\"x\">דוח שסוכן אחר שלח לסשן</teammate-message>"}},
    {"type": "user", "message": {"content": "Another Claude session sent a message: הודעה שהגיעה מסשן אחר"}},
    ask("אפשרות שהסוכן הציע בחלון"),
    {"type": "assistant", "message": {"content": [{"type": "text", "text": "תשובה שהסוכן עצמו כתב"}]}},
]
with open(f"{fx}/projects/p/aaaaaaaa-1111-2222-3333-444444444444.jsonl", "w", encoding="utf-8") as f:
    f.write("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
his = ["משפט ראשון שהוא הקליד בעצמו", "משפט שני שהוא שם בתור", "תשובה שלישית שהוא כתב בעצמו בחלון"]
not_his = ["תוצאה שסוכן כתב והגיעה בתור", "הודעה שסשן אחר הקליד כאן", "דוח שסוכן אחר שלח לסשן",
           "הודעה שהגיעה מסשן אחר", "אפשרות שהסוכן הציע בחלון", "תשובה שהסוכן עצמו כתב"]
open(f"{fx}/later.txt", "w", encoding="utf-8").write("@ aaaaaaaa\n" + "\n".join(his + not_his) + "\n")
open(f"{fx}/typed.jsonl", "w", encoding="utf-8").write(json.dumps({"text": "משהו אחר לגמרי"}, ensure_ascii=False) + "\n")
open(f"{fx}/s/my-x/SKILL.md", "w", encoding="utf-8").write("".join(f"«{q}»\n" for q in his + not_his))
PY
  got=$(PROMPT_STORE_PROJECTS="$fx/projects" python3 -I -c "$QUOTE_PY" "$fx/typed.jsonl" "$fx/later.txt" "$fx/s/my-x/SKILL.md" 2>/dev/null)
  [ "$(grep -c '^later-quotes: no typed message' <<<"$got")" = 6 ] && [ "$(grep -c '^my-x: «' <<<"$got")" = 6 ] \
    && ! grep -q 'הקליד בעצמו\|שם בתור\|כתב בעצמו בחלון' <<<"$got" && ok \
    || bad "the quote check no longer tells his own words from what an agent wrote into the transcript:
$got"
  rm -rf -- "${fx:?}"
else
  echo "note: python3 or a temp folder is missing; the quote check was not checked on its made-up transcript"
fi
# The line those three prompts look for is written by the tool: the two sides stay in step.
grep -qF 'NOT IN THIS DIGEST' "$here/bin/session-digest" && ok \
  || bad "session-digest no longer writes the NOT IN THIS DIGEST line that the prompts read"
grep -q 'nadavai:reviewer' "$skills"/my-review/SKILL.md && [ -f "$here/plugins/nadavai/agents/reviewer.md" ] && ok \
  || bad "my-review needs the nadavai:reviewer agent"

echo "prompt-store: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
