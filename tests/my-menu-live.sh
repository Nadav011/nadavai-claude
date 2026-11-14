#!/usr/bin/env bash
# tests/my-menu-live.sh: the Ctrl+P prompt list (mods/my-menu) in a real Claude Code terminal.
# The mod's own tests (claude plugin test) cannot stand in for the engine on two things: the focus
# ring that the keys move, and the engine's answer when the list asks whether the band above the
# prompt still holds the keyboard (which is how Esc closes it). This script starts Claude Code in a
# private tmux server, presses the keys and reads the screen. Nothing is sent to a model: the list
# only writes into the prompt box, and the box is cleared before the session is closed.
#
#   tests/my-menu-live.sh        exit 0 when every check passes, or when tmux or claude is missing
#   MY_MENU_LIVE_CWD=<dir>       the folder the session starts in (default: this checkout). Claude
#                                Code asks about a folder it has not been opened in before, so a git
#                                worktree of this repo is run from a folder it already knows.
#
# It runs the mod and the prompts of this checkout (--plugin-dir), with the key bindings that are
# installed for the session's profile: Left, Right and Ctrl+P are checked only where update.sh has
# bound them, and say so otherwise. Takes about a minute. Not part of update.sh.
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
command -v tmux >/dev/null && command -v claude >/dev/null || { echo "note: tmux or claude is missing; nothing checked"; exit 0; }
sock="my-menu-live-$$"
tm() { tmux -f /dev/null -L "$sock" "$@"; }
# The server is stopped at the end, and its socket file with it: tmux leaves the file behind.
sockfile="${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)/$sock"
trap 'tm kill-server 2>/dev/null; [ -S "$sockfile" ] && rm -f -- "$sockfile"' EXIT
PASS=0; FAIL=0; UNBOUND=''
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
key() { tm send-keys -t t "$@"; sleep 0.8; }
# The prompt box's line is its mark, one cell that is not a plain space, then the text.
plain() { tm capture-pane -p -t t; }
# The texts drawn highlighted (reverse video), in order: the group that is marked, then the row.
marks() {
  tm capture-pane -e -p -t t | python3 -I -c '
import re, sys
for line in sys.stdin:
    on, shown = False, ""
    for part in re.split(r"(\x1b\[[0-9;]*m)", line.rstrip("\n")):
        if not part.startswith("\x1b["):
            if on:
                shown += part
            continue
        codes = [c or "0" for c in part[2:-1].split(";")]
        i = 0
        while i < len(codes):
            code = codes[i]
            if code in ("38", "48"):  # a colour: skip its own numbers
                i += 3 if codes[i + 1 : i + 2] == ["5"] else 5
                continue
            if code == "7":
                on = True
            elif code in ("0", "27"):
                on = False
            i += 1
    if shown.strip():
        print(shown.strip())
'
}
group() { marks | sed -n 1p; }
row() { marks | sed -n 2p; }
is_open() { plain | grep -q 'Esc סוגר'; }
bound() { # bound <Context> <key> <action> : the session's key bindings have it
  jq -e --arg c "$1" --arg k "$2" --arg v "$3" '[.bindings[] | select(.context == $c) | .bindings[$k] == $v] | any' \
    "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/keybindings.json" >/dev/null 2>&1
}

cwd=${MY_MENU_LIVE_CWD:-$here}
tm new-session -d -s t -x 150 -y 46 -c "$cwd" \
  "claude --model haiku --strict-mcp-config --plugin-dir '$here/mods/my-menu' --plugin-dir '$here/plugins/nadavai'"
for _ in $(seq 30); do
  sleep 2
  plain | grep -q 'trust' && { echo "FAIL: Claude Code asks whether to trust $cwd; open it there once and answer, or name a known folder in MY_MENU_LIVE_CWD"; exit 1; }
  plain | grep -q '^❯' && break
done
ok "the session started"                         'plain | grep -q "^❯"'
sleep 3

# 1. Closed: nothing of the list is on screen.
ok "closed: nothing on screen"                   '! plain | grep -q "הפרומטים שלי"'

# 2. The engine's own focus chord (Ctrl+X, Tab) opens it on the first group, top row highlighted.
tm send-keys -t t C-x; sleep 0.3; key Tab; sleep 1
ok "the focus opens the list"                    'is_open'
ok "first group marked ($(group))"               '[ "$(group)" = "באמצע עבודה" ]'
ok "top row highlighted ($(row))"                'row | grep -q "^1\. תמשיך עד הסוף בלי לעצור"'
ok "all seven groups are named"                  'plain | grep -q "באמצע עבודה .*משימה חדשה .*בודקים .*להבין ולהחליט .*להראות, לשלוח ולשמור .*משהו לא טוב .*goal"'

# 3. Down and Up move the highlight.
key Down
ok "Down: second row ($(row))"                   'row | grep -q "^2\. לנעול את הסשן על היעד"'
key Up
ok "Up: first row again"                         'row | grep -q "^1\. "'

# 4. Tab turns to the next group, with its top row highlighted; Shift+Tab turns back.
key Down; key Tab
ok "Tab: second group ($(group))"                '[ "$(group)" = "משימה חדשה" ]'
ok "Tab: its top row is highlighted ($(row))"    'row | grep -q "^1\. תמשיך את הסשן ההוא עד הסוף"'
key BTab
ok "Shift+Tab: first group again"                '[ "$(group)" = "באמצע עבודה" ]'

# 5. Left and Right, where the install bound them (the list reads right to left: Left is forward).
if bound AbovePromptSelect left abovePrompt:next && bound AbovePromptSelect right abovePrompt:previous; then
  key Left
  ok "Left: second group ($(group))"             '[ "$(group)" = "משימה חדשה" ]'
  key Left; key Left; key Left; key Left; key Left; key Left
  ok "Left past the last group: the first"       '[ "$(group)" = "באמצע עבודה" ]'
  key Right
  ok "Right from the first group: the last ($(group))" '[ "$(group)" = "goal" ]'
  key Left
else
  echo "note: Left and Right are not bound for the list in this profile (update.sh binds them); checked with Tab only"
  UNBOUND="$UNBOUND Left/Right"
fi

# 6. A digit jumps to the row of that number.
key 4
ok "a digit jumps to its row ($(row))"           'row | grep -q "^4\. "'

# 7. The list stays open past the ten seconds one hook may take, and Esc still closes it.
sleep 12
ok "still open after twelve seconds"             'is_open'
key Escape; sleep 1.5
ok "Esc closes the list"                         '! is_open'
tm send-keys -t t -l 'abc'; sleep 0.8
ok "after Esc the keyboard is back in the box"   'plain | grep -q "^❯.abc"'
key C-u

# 8. Enter puts the highlighted prompt in the box, closes the list, and typing goes on after it.
tm send-keys -t t -l 'רק מאתמול'; sleep 0.5
tm send-keys -t t C-x; sleep 0.3; key Tab; sleep 1
key Down; key Down; key Down; key Down
ok "fifth row highlighted ($(row))"              'row | grep -q "^5\. מה מצבנו"'
key Enter; sleep 1.5
ok "Enter closes the list"                       '! is_open'
ok "the box holds the prompt and his words"      'plain | grep -q "^❯./nadavai:my-status רק מאתמול"'
tm send-keys -t t -l ' ועוד'; sleep 0.8
ok "typing goes on after the prompt"             'plain | grep -q "^❯./nadavai:my-status רק מאתמול ועוד"'
key C-u

# 9. The goal group, the last one. A form that needs a subject writes nothing over an empty box
# and says what to type; the stores form, which needs none, writes a /goal line.
tm send-keys -t t C-x; sleep 0.3; key Tab; sleep 1
key BTab
ok "Shift+Tab from the first group: goal ($(group))" '[ "$(group)" = "goal" ]'
ok "its top row is the general goal ($(row))"    'row | grep -q "^1\. לנעול את הסשן על היעד"'
key Down
ok "second row: another session, as a goal ($(row))" 'row | grep -q "^2\. תמשיך את הסשן ההוא עד הסוף .*goal:"'
key Enter; sleep 1.5
ok "no subject: the list closes"                 '! is_open'
ok "no subject: he is told what to type"         'plain | grep -q "קודם כותבים בתיבה איזה סשן להמשיך"'
ok "no subject: the box stays empty"             '! plain | grep -q "^❯./"'
tm send-keys -t t C-x; sleep 0.3; key Tab; sleep 1
# A group he comes back to keeps the highlight where he left it, so the row is reached by its digit.
key BTab; key 6
ok "sixth row: the stores, as a goal ($(row))"   'row | grep -q "^6\. מה מצב האפליקציות בחנויות"'
key Enter; sleep 1.5
ok "the box holds a goal line for the stores"    'plain | grep -q "^❯./goal היעד: להביא עד הגשה לבדיקה בשתי החנויות"'
# The line fills several rows of the box, and Ctrl+U clears one row of it at a time.
for _ in $(seq 30); do plain | grep -q "^❯./" || break; tm send-keys -t t C-u; sleep 0.3; done
ok "the goal line is cleared, nothing was sent"  '! plain | grep -q "^❯./"'

# 10. His key, where the install bound it: Ctrl+P opens, Ctrl+P again closes.
if bound Chat ctrl+p abovePrompt:focus; then
  key C-p; sleep 1
  ok "Ctrl+P opens the list"                     'is_open'
  if bound AbovePromptSelect ctrl+p abovePrompt:leave; then
    key C-p; sleep 1.5
    ok "Ctrl+P again closes it"                  '! is_open'
  else
    key Escape; sleep 1.5
  fi
else
  echo "note: Ctrl+P is not bound to the list in this profile (update.sh binds it); checked with Ctrl+X Tab only"
  UNBOUND="$UNBOUND Ctrl+P"
fi

ok "the box is empty at the end"                 '! plain | grep -q "^❯./"'
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
# The Claude Code version this passed on: update.sh names a newer one until this runs on it. A run
# in which a key was not bound says so in the mark, so update.sh keeps naming the version until the
# keys themselves were pressed on it.
mark=$(claude --version 2>/dev/null | head -1)
[ -z "$UNBOUND" ] || mark="$mark, without$UNBOUND (not bound in that profile)"
mkdir -p "$HOME/.cache/nadavai" && printf '%s\n' "$mark" > "$HOME/.cache/nadavai/my-menu-live.passed"
