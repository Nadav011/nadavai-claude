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
want="9 typed, 1 dialog answers, 3 commands, 1 goals, 2 replies, 1 before a dialog, 2 from other sessions, 1 compactions, 1 part(s)"
ok "counts: got '$summary'" '[ "$summary" = "$want" ]'

# What he typed is kept once per message.
ok "re-sent prompt once"          '[ "$(count "build the cash report page")" = 1 ]'
ok "repeat within seconds once"   '[ "$(count "ping the courier")" = 1 ]'
ok "queued and delivered once, typed again another day kept" '[ "$(count "also add an export button")" = 2 ]'
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
ok "meta peer kept as peer"       'grep -q "the tax session finished its part" <<<"$all"'
ok "compaction mark"              'grep -q "CONTEXT COMPACTED #1" <<<"$all"'
ok "final replies"                'grep -q "The report page is built." <<<"$all" && grep -q "has no test" <<<"$all"'
ok "text of a tool turn is not a reply" '! grep -q "reading the code" <<<"$all"'

# Nothing that he did not type is filed as typed, and no secret is copied.
ok "nothing leaked: $(grep -o "[A-Z]* MUST NOT APPEAR" <<<"$all" | head -3 | tr "\n" " ")" '! grep -q "MUST NOT APPEAR" <<<"$all"'
ok "key redacted"                 '! grep -q "sk-ant-abcdef" <<<"$all" && grep -q "the server key is \[redacted\]" <<<"$all"'
ok "password redacted, the word alone kept" '! grep -q "hunter2secret" <<<"$all" && grep -q "the password screen is slow" <<<"$all"'

ok "index: first message"         'grep -q "first message the owner typed: build the cash report page" "$t/all/index.md"'
ok "index: last command"          'grep -q "last command the owner ran: /nadavai:my-review from tuesday" "$t/all/index.md"'
ok "index: bad line counted"      'grep -q "1 unreadable line" "$t/all/index.md"'

owner=$("$BIN" "$FIX" --out "$t/owner" --owner-only | tail -1)
ok "owner-only counts: got '$owner'" '[ "$owner" = "9 typed, 1 dialog answers, 3 commands, 1 goals, 1 compactions, 1 part(s)" ]'
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
cp "$FIX" "$t/home/.claude/projects/p/11111111-9999-3333-4444-555555555555.jsonl"
ok "two different ids fail"       '! HOME="$t/home" CLAUDE_CONFIG_DIR="" "$BIN" 11111111 --out "$t/two" 2>/dev/null'

echo "session-digest: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
