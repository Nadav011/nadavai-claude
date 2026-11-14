#!/usr/bin/env bash
# tests/session-digest.sh: bin/session-digest on a transcript fixture that holds every record kind
# it has to tell apart: typed, re-sent, typed mid-turn and delivered, the same words typed again on
# another day, a dialog answer with a typed note, a reason typed while rejecting a tool call, a
# command, a goal, other sessions' messages (plain and meta), compaction, tool output, a subagent
# reply, harness notes, hook and notification text, and a pasted key.
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$here/bin/session-digest"
FIX="$here/tests/fixtures/session-digest/sample.jsonl"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
count() { grep -c -- "$1" <<<"$all"; }

summary=$("$BIN" "$FIX" --out "$t/all" | tail -1)
all=$(cat "$t"/all/part-*.md)
# shellcheck disable=SC2034  # read inside the eval of ok()
want="13 typed, 1 dialog answers, 8 commands, 1 goals, 2 replies, 1 before a dialog, 4 from other sessions, 1 compactions, 1 part(s)"
ok "counts: got '$summary'" '[ "$summary" = "$want" ]'

# What he typed is kept once per message.
ok "prompt re-sent after 12 s: once" '[ "$(count "build the cash report page")" = 1 ]'
ok "repeat within seconds once"   '[ "$(count "ping the courier")" = 1 ]'
ok "typed mid-turn, again 107 s later, again another day: three messages" '[ "$(count "also add an export button")" = 3 ]'
ok "queued, never delivered, typed again another day: both kept" '[ "$(count "check the printer")" = 2 ]'
ok "mid-turn marked"              'grep -q "typed while the session was working" <<<"$all"'
ok "rejection reason kept"        'grep -q "do not deploy before the owner sees it" <<<"$all" && grep -q "reason for rejecting a tool call" <<<"$all"'
ok "image noted"                  'grep -q "did we finish everything?" <<<"$all" && grep -q "\[image\]" <<<"$all"'

# Dialogs: his pick, the options he was offered, the note he typed, and the session's text before it.
ok "dialog answer"                'grep -q -- "-> shekels only" <<<"$all"'
ok "dialog options"               'grep -q "offered: shekels only | shekels and dollars" <<<"$all"'
ok "dialog note"                  'grep -q "note he typed: and tell the accountant about it" <<<"$all"'
ok "text before the dialog"       'grep -q "^=== Q1 " <<<"$all" && grep -q "Two ways to show the totals" <<<"$all"'

ok "command with args"            'grep -q "^/model opus$" <<<"$all"'
ok "queued command"               'grep -q "^/nadavai:my-status$" <<<"$all"'
ok "goal once"                    '[ "$(count "every report screen works end to end")" = 1 ]'
ok "peer is not typed"            'grep -q "^=== X1 .*not the owner" <<<"$all" && grep -q "hold the deploy" <<<"$all"'
ok "a parent session's brief is not typed" 'grep -B2 "look at the parent brief" <<<"$all" | grep -q "^=== X[0-9]* .*not the owner"'
ok "the app's usage-limit resume text is not typed" '! grep -q "I hit my usage limit" <<<"$all"'
ok "meta peer kept as peer"       'grep -q "the tax session finished its part" <<<"$all"'
ok "peer message from the queue"  'grep -q "the design session needs the logo file" <<<"$all" && ! grep -B3 "needs the logo file" <<<"$all" | grep -q "owner typed"'
ok "compaction mark"              'grep -q "CONTEXT COMPACTED #1" <<<"$all"'
ok "final replies"                'grep -q "The report page is built." <<<"$all" && grep -q "has no test" <<<"$all"'
ok "text of a tool turn is not a reply" '! grep -q "reading the code" <<<"$all"'

# Nothing that he did not type is filed as typed, and no secret is copied.
ok "nothing leaked: $(grep -o "[A-Z]* MUST NOT APPEAR" <<<"$all" | head -3 | tr "\n" " ")" '! grep -q "MUST NOT APPEAR" <<<"$all"'
ok "key redacted"                 '! grep -q "sk-ant-abcdef" <<<"$all" && grep -q "the server key is \[redacted\]" <<<"$all"'
ok "password redacted, the word alone kept" '! grep -q "hunter2secret" <<<"$all" && grep -q "the password screen is slow" <<<"$all"'
ok "real-world secret forms: $(grep -o "Xk9mQ2vv\|hunter3pass\|pg-secret-77\|letmein99\|AIzaSyA1234" <<<"$all" | tr "\n" " ")" '! grep -q "Xk9mQ2vv\|hunter3pass\|pg-secret-77\|letmein99\|AIzaSyA1234" <<<"$all"'
ok "a Hebrew word after the word stays" 'grep -q "הסיסמה נדרשה בכל כניסה" <<<"$all"'
# The six old rules are left as they are, so a sentence that only mentions a password still loses
# its next word, and the rule added for "הסיסמה שלי היא X" does not take the word after that one.
ok "an ordinary sentence: one word hidden, as before" 'grep -qF "הסיסמה שלי [redacted] עובדת" <<<"$all" && grep -qF "is [redacted] protected" <<<"$all"'
# The added rules ask for a digit where there is no joining word, so a name in a sentence stays.
for stays in 'הסיסמה - WiFi של הבית' 'סיסמת האדמין Supabase לא עובדת' 'הסיסמה שגויה: Error' 'primary_key=id' \
  'search?key=react-query-devtools-panel'; do
  ok "stays: $stays" 'grep -qF -- "$stays" <<<"$all"'
done
# What the old rules hid, and the forms the added rules hide: a value after "שלי היא" or a colon,
# in quotes, after Bearer, in a URL, after סיסמת, under an env name in capitals, under name: value.
for goes in Zx7mypass Qw8zzTop qwe123rty live-tok-99887766 cs-55aa66bb AbCdEf0123456789xyzQ eyJhbGciOiJIUzI1NiJ9 \
  lowTok123456abcd hashTok111222333 RefTok12AbCd PASSWORD=4321 PROD=4455 שלוםעולם ecret99 spaced2pass Xy12AbCd 7391 \
  שלום2024 Qwerty88 Colon55pass yaml77pass 5150 3344 Dash9pass Hunter22 Hunter33 ADMIN=1234 ACCOUNT=12345 TOKENS=8192 6677 wıthout \
  ÉMIN=1234 2MAX=1234 MAX_PASSWORD=1234 קז-Qwerty חשאיתמאוד Gg77quote Pre3fix99 Not-Today-2024 jsonpass77 sq55pass yaml66key \
  tg-12345-abc abcdefghijklmnop1234 Mail77pass bearerTOK1234567890 lowBearer1234567890 oauth1234567890abcdef sig9876543210fedcba \
  Mgr55pass Wifi44pass Srv66pass Dash77pass Zo88pass New99pass Arrow55pass Upper55pass Qwertyab Nw44pass Lettersonly Emdash66pass \
  Endash66pass Mgr77pass Zot77pass plainsecret9 dashkey99 Sq55secret abcdefgh12345678; do
  ok "hidden: $goes" '! grep -qF -- "$goes" <<<"$all"'
done
# The added rules never show what the old rules hid: the six old rules are the same text as before.
ok "the index says what a gap can stand for" 'grep -q "\[redacted\] stands for one word" "$t/all/index.md"'
# A line typed in shell mode is named by its program only, and only by a program this machine
# knows: arguments, a leading NAME=value and a lone word that is no program are never copied.
ok "a shell line is named by its program" '[ "$(grep -c "^! git …$" <<<"$all")" = 2 ] && grep -q "^! curl …$" <<<"$all" && [ "$(grep -c "^! …$" <<<"$all")" = 2 ]'
ok "and nothing else of it is copied" '! grep -q "shellTOK9876543210abc\|ShellPass77\|Shell9pass\|Shell8pass\|push origin\|/usr/bin/env" <<<"$all"'
# A long line costs what a short one costs: two of these patterns once took seconds on 20,000 characters.
slow=$(python3 -I - "$BIN" <<'PY'
import importlib.machinery, importlib.util, sys, time
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("sd", sys.argv[1])
spec = importlib.util.spec_from_loader("sd", loader); sd = importlib.util.module_from_spec(spec); loader.exec_module(sd)
worst = 0.0
for line in ("הסיסמה היא" + " " * 20000, "DB_PASSWORD=" + "," * 20000 + "a", "הסיסמה שלי " * 2000, "password is " + "x" * 20000,
             "סיסמת " + "א " * 10000, "TOKEN=" * 3000, "sudo " + " " * 20000 + "password", "?key=a" * 14000, "#code=xyz" * 9000,
             "הסיסמה [redacted] " * 1500, "שלי [redacted] " * 1500 + "x", "הסיסמה לשרת" + " " * 20000 + ":",
             "סיסמה א" + ":" * 40000, "הסיסמה ב-" + "abc:" * 10000, "password =[redacted] " * 1500, "password א" + ":" * 40000):
    start = time.perf_counter(); sd.redact(line); worst = max(worst, time.perf_counter() - start)
print("slow" if worst > 1.5 else "fast")
PY
)
ok "no pattern slows down on a long line" '[ "$slow" = fast ]'

ok "index: first message"         'grep -q "first message the owner typed: build the cash report page" "$t/all/index.md"'
ok "index: last command"          'grep -q "last command the owner ran: /nadavai:my-review from tuesday" "$t/all/index.md"'
ok "index: bad line counted"      'grep -q "1 unreadable line" "$t/all/index.md"'

owner=$("$BIN" "$FIX" --out "$t/owner" --owner-only | tail -1)
ok "owner-only counts: got '$owner'" '[ "$owner" = "13 typed, 1 dialog answers, 8 commands, 1 goals, 1 compactions, 1 part(s)" ]'
ok "owner-only has no session side" '! grep -q "^=== [RQX][0-9]" "$t"/owner/part-*.md && grep -q "^=== U1 " "$t"/owner/part-*.md'

since=$("$BIN" "$FIX" --out "$t/since" --since 2026-11-02 | tail -1)
ok "since: got '$since'"          '[ "$since" = "3 typed, 0 dialog answers, 1 commands, 0 goals, 1 replies, 0 before a dialog, 0 from other sessions, 1 compactions, 1 part(s)" ]'
ok "since noted"                  'grep -q "entries before 2026-11-02 were left out" "$t/since/index.md"'

"$BIN" "$FIX" --out "$t/small" --part-kb 1 --max-report-chars 20 >/dev/null
ok "split into parts"             '[ "$(ls "$t"/small/part-*.md | wc -l)" -gt 1 ]'
ok "cut is announced"             'grep -q "cut here: " "$t"/small/part-*.md'

# A bad argument fails before the output folder is touched.
ok "bad date fails"               '! "$BIN" "$FIX" --out "$t/all" --since 2.11 2>/dev/null'
ok "earlier digest survives it"   '[ -f "$t/all/part-01.md" ]'
ok "unknown id fails"             '! "$BIN" no-such-session-id --out "$t/none" 2>/dev/null && [ ! -e "$t/none" ]'

# A session resumed under another account profile exists twice under one id: the newest copy is read.
id=11111111-2222-3333-4444-555555555555
mkdir -p "$t/home/.claude/projects/p" "$t/home/.config/orca/claude-profiles/x/home/projects/p"
head -4 "$FIX" >"$t/home/.config/orca/claude-profiles/x/home/projects/p/$id.jsonl"
touch -d '2026-11-01' "$t/home/.config/orca/claude-profiles/x/home/projects/p/$id.jsonl"
cp "$FIX" "$t/home/.claude/projects/p/$id.jsonl"
# shellcheck disable=SC2034
copies=$(HOME="$t/home" CLAUDE_CONFIG_DIR='' "$BIN" 11111111 --out "$t/copies" 2>/dev/null | tail -1)
ok "newest copy of one id"        '[ "$copies" = "$summary" ]'
ok "an older copy with nothing new is said so" 'grep -q "1 other file(s) of this session hold nothing typed that this one lacks" "$t/copies/index.md"'
# The older copy went its own way after the split: what only it holds is named, not dropped silently.
printf '%s\n' '{"type":"user","origin":{"kind":"human"},"timestamp":"2026-10-30T07:00:00.000Z","message":{"role":"user","content":"add the tips report too"}}' \
  >>"$t/home/.config/orca/claude-profiles/x/home/projects/p/$id.jsonl"
touch -d '2026-11-01' "$t/home/.config/orca/claude-profiles/x/home/projects/p/$id.jsonl"
HOME="$t/home" CLAUDE_CONFIG_DIR='' "$BIN" 11111111 --out "$t/branch" >/dev/null 2>"$t/branch.err"
ok "a branch in an older copy is named in the index" 'grep -q "NOT IN THIS DIGEST: another file of this session holds 1 typed message" "$t/branch/index.md"'
ok "and on stderr"                'grep -q "1 typed message(s) are only in another file" "$t/branch.err"'
cp "$FIX" "$t/home/.claude/projects/p/11111111-9999-3333-4444-555555555555.jsonl"
# A path names the file to read; the other files of that session are still compared with it.
HOME="$t/home" CLAUDE_CONFIG_DIR='' "$BIN" "$t/home/.claude/projects/p/$id.jsonl" --out "$t/bypath" >/dev/null 2>&1
ok "a path argument still names what only another file holds" 'grep -q "NOT IN THIS DIGEST: another file of this session holds 1 typed message" "$t/bypath/index.md"'
ok "two different ids fail"       '! HOME="$t/home" CLAUDE_CONFIG_DIR="" "$BIN" 11111111 --out "$t/two" 2>/dev/null'

echo "session-digest: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
