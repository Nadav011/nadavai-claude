# Models, effort and delegation

This file overrides the model tiers and the delegation rules in the OMC block of `~/.claude/CLAUDE.md`. Aliases `haiku`, `sonnet`, `opus` and `fable` resolve to claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5 and claude-fable-5-2.

## Models
- The main session runs the model Nadav picked with `/model`; the default is Fable 5.2. Fable's cache writes and output cost twice Opus's, so Fable runs only where Nadav picked it: no agent passes `fable` to a subagent, teammate, Workflow agent, OMC tier or fallback, and no agent forks a Fable session for routine work (a fork inherits the model and the whole context).
- Subagents: pass `haiku` for search, lookups and doc edits (explore, writer). Pass `opus` for planner, architect, critic, debugger, verifier, security-reviewer and code-reviewer. Leave `model` unset (Sonnet) for the rest.
- Executors, and the implement and fix agents of a Workflow script, run on `opus` for multi-file work, for every fix round after a rejected review or a red CI, and always when the change touches money or payments, auth, permissions or RLS, migrations, deletion or data loss, or messages and sends to real people, judged by the files and actions involved and not by the task title. Sonnet is for small, contained work (one or two files, none of those areas), and its brief says to stop and return if the change reaches one of them. Reviews reject Sonnet executor batches more often than Opus ones; `executor-quality` measures it.
- Effort is set per model in `settings.base.json` (`modelSettings`). Change it for one session with `/effort`, not globally.

## Who does the work
A subagent starts by loading about 80K tokens of fixed context, knows only what its brief says, and returns a summary. Subagents and Workflow agents are most of what this setup spends, so each one has to buy something.
- The main session does the work itself when it already holds the context: a change it can describe exactly, in files it has read, is faster and more reliable done directly than briefed.
- Delegate when it pays: units a plan marks as independent, run in parallel; a broad read-only sweep whose file dumps the main session does not need; a long implementation that would otherwise fill the main context; and review by a context that did not write the work.
- A brief carries the paths, the findings so far and the question, so the agent does not explore again what the caller already read. An executor's brief also carries the acceptance criteria and the checks its reviewer will apply, and the executor reports the output of those checks before handing over.
- Split executor work only along units the plan already marks as independent. `/team` without an explicit N starts 3 teammates; autopilot, ralph and execute use up to 3 parallel agents when the work splits into independent files or modules, and one agent otherwise.
- In a Workflow script, each agent is a fresh 80K start: give one agent a whole unit (implement, then run its own checks) and keep separate agents for independent review, instead of one agent per small phase over the same diff. A run that stopped on a usage limit or "Login expired" resumes with `resumeFromRunId`, which keeps the finished agents' results.

## Reading code
- Definitions, types and a file's symbols come from LSP (the `LSP` tool or OMC `lsp_*`: `goToDefinition`, `hover`, `documentSymbol`); grep is for free text. Every search result stays in the context and is read again by each later request.
- Before a rename, a delete or a signature change, find every use with `rg -w --hidden -g '!.git' <name>` scoped to the repo (`-l` first when the list is long). LSP `findReferences` alone misses uses: tsserver searches only the tsconfig projects it has loaded.

## Waiting
- A subagent's prompt cache lives 5 minutes, so a subagent or Workflow agent does not block longer than that in one call, one wait per turn: `ci-wait <repo> <ref> --slice 140` with Bash timeout 175000, run again on exit 7. agent-guard enforces this, and its deny text carries the recipe for long jobs.

## Measuring
- `token-audit [days]` shows where tokens and money go; run it before and after any change meant to save tokens. `subagent-context` shows subagent start and end sizes, `executor-quality` shows review rejections per executor model, `guard-stats` shows how often the Stop guards fire.
- When a new model ships, update `model`, `modelSettings` and `CLAUDE_CODE_SUBAGENT_MODEL` in `settings.base.json`, and the tiers in `~/.config/claude-omc/config.jsonc`.
