# Global instructions

Nadav's rules are the files in `~/.claude/rules/`; they load on their own and are the instructions to follow. This file only describes the oh-my-claudecode (OMC) plugin that runs beside them.

- OMC adds skills (`/oh-my-claudecode:<name>`, for example `deep-interview`, `ralplan`, `plan`, `autopilot`, `ralph`, `team`, `ultragoal`, `cancel`) and agent types (`oh-my-claudecode:<role>`). Use one when Nadav names it or a rule points to it. Where the text of an OMC skill or agent differs from the rules (which model to pass, when to delegate, what to verify before done), the rules win. OMC's generic reminders around tool calls ("File written. Test the changes", "Use parallel execution") are switched off with `OMC_QUIET=2` in `settings.base.json`; where one still appears, the rules decide what to check and when.
- OMC hooks add `<system-reminder>` notes. `[MAGIC KEYWORD: <name>]` means invoke that skill. A continuation note ("The boulder never stops") means an OMC mode is active; end it with `/oh-my-claudecode:cancel` when the work is done and verified, or blocked.
- OMC keeps working files under `.omc/` in the project (plans, state, handoffs). They are not committed, except `.omc/skills/`.
- After a resume or a compaction, and inside a linked worktree, check `git status --short --branch` and the working directory before editing, so work does not continue on the wrong branch.
- Before using an SDK, a framework or an API you are not sure of, read its current documentation (the repo's own docs first, then the vendor's site with `webget`) instead of writing it from memory.
- A TODO placeholder, a skipped or `.only` test, a stub or an unimplemented branch is unfinished work: implement it, or report it as a blocker.
