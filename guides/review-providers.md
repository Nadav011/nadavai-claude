# Review providers: commands, config and known traps

Read before running `omc ask` for a review. Which provider a review gets, and how many rounds, is in
`rules/working-style.md`, Second model; this file holds only the mechanics.

- Codex: `omc ask codex` (model and effort in `~/.codex/config.toml`).
- Gemini 4 Argon: `omc ask antigravity` (`~/.gemini/antigravity-cli/settings.json`, set to "Gemini 4 Argon (High)"
  on 2026-11-14). `omc ask gemini` is the old CLI and fails. Its individual quota ran out on 2026-11-03 and
  2026-11-13 (a 429; the reset came about six days later on 2026-11-03 and about four hours later on
  2026-11-13): then Grok takes the review. `agy models` also lists a Gemini 4 Hydrogen family; it was not tried
  here, so try it on one review whose result is compared with Argon's, outside the count of that review,
  before relying on it.
- Grok: `omc ask grok` (`~/.grok/config.toml`). It can exit 0 on a quota or balance error, so read the artifact's
  raw output before counting its answer.
- `omc ask` starts Codex, Grok and Antigravity with their approvals off, so every review prompt says "read-only"
  explicitly.
- A provider known to be out of quota (a reset date in memory that has not passed, or a failed try in this
  session) is skipped without another try, and when one cannot run (quota, not installed, error, timeout), use
  another in its place.
- A fresh Opus is a new `nadavai:reviewer` subagent with `model: opus` (`rules/model-routing.md`).
- From a subagent or a Workflow agent, start `omc ask` with `run_in_background` and wait in slices of at most
  140 s (`rules/model-routing.md`, Waiting), then read its artifact.
