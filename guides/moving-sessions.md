# Moving a session to another agent

Moved from `rules/working-style.md` on 2026-11-07 to cut always-loaded context; a one-line pointer
stays there.

- Continuing an existing conversation in a different agent: `cs pick` to choose a session and a target, or `cs resume <id> -i <agent>` when the session is known. It reads the source agent's own transcript, so nothing has to be re-explained.
- Into the session already open ("bring the last Codex conversation in here"): `cs ls` to find it, then `cs resume <id> -i claude --debug-prompt --no-tui`, which prints the handoff instead of launching anything, and read that output. Without `--debug-prompt` the same command starts a new session, which is not what was asked. Add `--preset minimal` when the full one is too long.
- `cs` is the `continues` CLI, installed by nadavai. It covers 16 agents and 240 handoff paths, so never write a handoff script instead.
- Codex can also pull from Claude Code natively with its own `/import`, which brings settings, skills and MCP servers along with the chats. Prefer it for that one direction.
- `cs` is `continues`; Claude Squad is `csq`.
