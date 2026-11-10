# nadavai: the global config repo

- Everything global (rules, skills, plugin hooks, settings defaults, git hooks) lives in `~/nadavai` and is installed from there to every machine and agent. Edit it there, not under `~/.claude/plugins/cache/`, `~/.claude/skills/` or `~/.gemini/config/plugins/nadavai/`; this overrides the OMC block's "direct writes OK for ~/.claude/**". `~/.claude/rules` is a symlink to `~/nadavai/rules`, so that working tree is live: make larger changes in a git worktree, not by switching its branch.
- After a change there: commit (Conventional Commits), push, run `~/nadavai/update.sh`, and say so.
- Before a third-party skill, plugin or MCP server is added (vendored here or installed), scan it: `skillspector scan <dir> --no-llm` (`--recursive` for a folder of skills), read every HIGH finding in the file itself, and report what was real. A finding is a lead, not a verdict.
- After editing CLAUDE.md, a SKILL.md, hooks or an MCP config here, run `agnix <the paths you touched>` and fix what it reports in them. A vendored skill keeps its upstream format.
- An MCP server that is always on costs every request of every session and subagent its tool list, plus a process per session. A server used a few times a month is added per project (`claude mcp add -s local ...`) by the skill that needs it, not to the plugin's `mcp.json`.
