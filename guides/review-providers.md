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
- A provider that reviews a change of an app is started in a new folder that holds only the material under
  review (the diff with the changed files, the criteria, the question), not in the app's repo: it runs in the
  current directory with its approvals and its sandbox off, and an app's repo holds live env files. Start it
  with the session's tokens removed from its environment (the providers sign in from their own config files;
  tried with Grok on 2026-11-14): `env -u GITHUB_PERSONAL_ACCESS_TOKEN -u BRIGHTDATA_API_TOKEN
  -u ORCA_AGENT_HOOK_TOKEN -u ORCA_AGENT_LAUNCH_TOKEN -u CLAUDE_CODE_MESSAGING_TOKEN omc ask ...`. Outside a git
  repo the artifact is written under `~/.omc/artifacts/ask/`, and the command prints its path. The folder lowers
  what the provider reads; it is not a wall, because a provider with its sandbox off can still open a path the
  prompt names, so the prompt names no path outside the folder.
- This config repo holds no secret in its tracked files and is public; a provider may read it in a worktree
  under `~/nadavai-worktrees/`, never in `~/nadavai` itself, whose files are live and whose ignored `.omc/`
  holds session state.
- A provider known to be out of quota is skipped without another try, only while its reset time is still
  ahead. Read `~/.cache/nadavai/provider-quota` before `omc ask` (one line per provider: its `omc ask` name,
  the time it is out until, the error text and who saw it): a line whose time has passed is no reason to skip,
  and is deleted by whoever reads it. Write or replace a line only from a quota error the provider itself
  answered, with the reset time that error gave. The file is per machine and is shared by every session and
  Orca profile on it, which a memory is not. When a provider cannot run (quota, not installed, error,
  timeout), use another in its place.
- A fresh Opus is a new `nadavai:reviewer` subagent with `model: opus` (`rules/model-routing.md`).
- From a subagent or a Workflow agent, start `omc ask` with `run_in_background` and wait in slices of at most
  140 s (`rules/model-routing.md`, Waiting), then read its artifact.
