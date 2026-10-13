# Model routing (set 2026-10-11)

Aliases `haiku`, `sonnet`, `opus` resolve to claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5.

- Fable is never used: not as the main loop, not as a subagent, not as a fallback when Opus is stuck. Why: Nadav ruled it out on 2026-10-13, after finding that settings.base.json had made it the default model for fresh installs. Enforced by `availableModels: ["opus", "sonnet", "haiku"]` in settings.base.json: a request for Fable (main loop, subagent or teammate) falls back to an allowed model instead, because a team lead whose session predated this rule still spawned a Fable teammate on 2026-10-12.
- Main loop: Sonnet 5.5 at xhigh, set by `/model` (global) and by `model` in settings.base.json. Move to Opus 5.5 for architecture, hard debugging and security work. Why: Opus burns the 5-hour quota several times faster.
- Subagents: leave `model` unset so they run on Sonnet 5.5 (`CLAUDE_CODE_SUBAGENT_MODEL`). Pass `haiku` for search, lookups and doc edits (explore, writer). Pass `opus` for planner, architect, critic, debugger, verifier, security-reviewer and code-reviewer, and for an executor on complex work. Why: a hard bug or a completion gate costs more when the model is weaker than it costs in quota; the volume is in executors and forks.
- No forks for routine delegation. A fork inherits the parent model and its full context (median ~290K tokens per request). Why: on 2026-10-06, 97% of subagent requests ran on Opus and froze the session limit.
- Effort: xhigh for Opus and Sonnet, never global max (it scores lower than xhigh on Sonnet 5.5's own benchmarks).
- A new model ships: update `CLAUDE_CODE_SUBAGENT_MODEL` and `modelSettings` in settings.base.json, and the tiers in `~/.config/claude-omc/config.jsonc` (outside this repo).
