# nadavai: the global config repo

- Everything global (rules, skills, plugin hooks, settings defaults, git hooks) lives in `~/nadavai` and is installed from there. Edit it there, never under `~/.claude/plugins/cache/`, `~/.claude/skills/`, or `~/.gemini/config/plugins/nadavai/`.
- After a change there: commit (Conventional Commits), push, run `~/nadavai/update.sh`, and say so.
- These rules override the OMC block's "direct writes OK for ~/.claude/**".
- Before a third-party skill, plugin or MCP server is added (vendored here or installed), scan it: `skillspector scan <dir> --no-llm` (`--recursive` for a folder of skills), read every HIGH finding in the file itself, and report what was real. A finding is a lead, not a verdict. Why: 13 outside marketplaces feed this setup and nothing checked their content; on 2026-11-07 the first scan of four Google skills raised two HIGH findings, both false.
- After editing CLAUDE.md, a SKILL.md, hooks or an MCP config here, run `agnix <the paths you touched>` and fix what it reports in them (a vendored skill's own upstream format stays as shipped).
