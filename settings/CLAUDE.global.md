# Global instructions

Nadav's rules are the files in `~/.claude/rules/`; they load on their own and are the instructions to follow. This file adds a few lines that hold in every project.

- Working files (plans, state, handoffs, reviews) are kept under `.omc/` in the project. They are not committed.
- After a resume or a compaction, and inside a linked worktree, check `git status --short --branch` and the working directory before editing, so work does not continue on the wrong branch.
- Before using an SDK, a framework or an API you are not sure of, read its current documentation (the repo's own docs first, then the vendor's site with `webget`) instead of writing it from memory.
- A TODO placeholder, a skipped or `.only` test, a stub or an unimplemented branch is unfinished work: implement it, or report it as a blocker.
