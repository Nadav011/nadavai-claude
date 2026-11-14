# Review providers: commands, config and known traps

Read before running `omc ask` for a review. Which provider a review gets, and how many rounds, is in
`rules/working-style.md`, Second model; this file holds only the mechanics.

- Codex: `omc ask codex` (model and effort in `~/.codex/config.toml`).
- Gemini: `omc ask antigravity` (`~/.gemini/antigravity-cli/settings.json`). `omc ask gemini` is the old CLI and
  fails.
- Grok: `omc ask grok` (`~/.grok/config.toml`). It can exit 0 on a quota or balance error, so read the artifact's
  raw output before counting its answer.
- `omc ask` starts Codex, Grok and Antigravity with their approvals off, so every review prompt says "read-only"
  explicitly.
- A provider known to be out of quota (a reset date in memory that has not passed, or a failed try in this
  session) is skipped without another try, and when one cannot run (quota, not installed, error, timeout), use
  another in its place.
- A fresh Opus is a new `nadavai:reviewer` subagent with `model: opus` (`rules/model-routing.md`).
