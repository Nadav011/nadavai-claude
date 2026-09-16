---
description: Move a session between Claude, Codex and Kimi via a handoff document
argument-hint: "[codex|kimi|claude|in] [--from codex|kimi|claude|auto] [--session <id>] [--raw] [--note \"...\"]"
allowed-tools: Bash, Read
---

Hand this work over to another CLI agent, or pick up work another agent started.

Arguments given: `$ARGUMENTS`

The engine is `${CLAUDE_PLUGIN_ROOT}/scripts/handoff.py` (also installed as `handoff` on PATH).
It reads a real session transcript, compresses it into `.omc/handoffs/<date>-<agent>-<slug>.md`,
and prints the path.

## Outgoing — first word is `codex`, `kimi` or `claude`

The target agent is a full-screen TUI, so never launch it from a tool call; it would hang this
session. Instead:

1. Run the engine with `--no-launch`, passing through every flag the user gave:
   `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/handoff.py" <target> --no-launch <flags>`
   Add `--session "$CLAUDE_SESSION_ID"` so the document describes *this* conversation, not an
   older one — the current session is the one the user means.
2. Read the document back and check it against what actually happened in this conversation.
   Fix any wrong or missing fact directly in the file; the summary model saw only a transcript
   extract, this session has the full picture.
3. Report to the user in Hebrew: the path, the next step the document names, and the single
   command to paste in their terminal:
   `handoff <target> --session <id> --out <path> --no-launch` is already done, so give them
   the launch line instead — `codex "$(cat <path>)"` is wrong (too long); give
   `cd <repo> && handoff <target> --session <id>` which rebuilds and launches, or tell them to
   open the agent and say "read <path> and continue".

## Incoming — first word is `in`, or `--from` names another agent

The work lives in another agent's transcript and continues here.

1. Run the engine with `--no-launch` and the right `--from` (default `auto` for `in`).
2. Read the resulting document.
3. Verify its claims against the repository before acting on them: check that the files it
   names exist and that its "state now" matches `git status --short --branch`. Another agent's
   summary is a claim, not evidence.
4. Tell the user in Hebrew what was picked up and what the next step is, then continue that
   work in this session.

## No arguments

The bare `handoff` command is an interactive picker and needs a real terminal, so do not run
it from a tool call. Instead run
`python3 "${CLAUDE_PLUGIN_ROOT}/scripts/handoff.py" --list` (add `--here` to scope it to this
project), show the user the candidate sessions across all three agents, and ask which one and
which direction they want.

## Notes

- `handoff` with no arguments, run by the user in their own terminal, lists every session from
  every agent in fzf with a preview pane, then asks which agent continues it. That is the path
  to recommend when the user does not already know which session they mean.

- `--raw` skips the summary model: mechanical extraction only, free and instant, but the
  document is larger and the receiving agent reads more.
- Kimi builds its session store only after its first run. If the engine reports no Kimi
  sessions, the incoming direction for Kimi is not available yet; tell the user to run Kimi
  once, or to ask Kimi itself to write the handoff file.
