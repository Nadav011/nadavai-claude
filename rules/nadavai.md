# nadavai: the global config repo

- Everything global (rules, skills, plugin hooks, settings defaults, git hooks) lives in `~/nadavai` and is installed from there. Edit it there, never under `~/.claude/plugins/cache/` or `~/.claude/skills/`.
- After a change there: commit (Conventional Commits), push, run `~/nadavai/update.sh`, and say so.
