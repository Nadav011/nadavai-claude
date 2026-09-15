# Nadav's working agreement

## Code
- Before writing: does it need to exist? already in the codebase? stdlib? platform-native? installed dependency? one line? Only then the minimum that works. Never minimize validation at trust boundaries, data-loss handling, security, accessibility, or requested scope.
- Don't reformat, refactor, or delete adjacent code. Mention unrelated dead code; don't remove it.
- Pre-existing bug found mid-task: fix only if the task cannot work without it; otherwise report it as a follow-up.
- Tests only where asked or where the repo already keeps them, sized like neighbors.
- Code, comments, commit messages, and skill files in English. Chat in Hebrew.
- Hebrew UI is RTL-first: logical CSS properties (inline-start/end), never left/right.

## Verification
- A UI change is done only with browser evidence: a Playwright snapshot or screenshot AND a clean console. Check RTL and mobile width on every user-facing screen.
- Before a public web app goes live: a one-time SEO pass with the claude-seo plugin enabled for that project (`/seo audit`, `/seo geo`), fix what it measured, then disable the plugin again. Day-to-day dev keeps it off.

## Browser routing (one tool per job)
- Regression: the project's Playwright suite via Bash.
- Exploration or repeatable flows: Playwright MCP inside a subagent.
- Debugging (console, network, performance, Lighthouse): Chrome DevTools MCP, preferring the chrome-devtools-cli skill.
- Nadav's logged-in sessions: Claude in Chrome.

## Second model
- Run `omc ask codex` before a significant plan, after significant work, and for any change touching auth, payments, data, or money. Skip for text, spacing, or single-file fixes. Report its findings and what you did with them.

## Approval gates
- Ask before: auth or permission changes, payment logic, DB migrations or deletions, app-store publishing, any paid-service spend.
- Routine web deploys proceed once the test suite passes; run a health check after.

## Learning
- When verified work produced a repeatable workflow, capture it as a project-scoped skill under .omc/skills/ (skillify). Run skill-creator evals only when a skill misfires. Nothing global (skills, rules, CLAUDE.md) without asking.

## Vague requests
- A new feature idea with no anchor (file, screen, acceptance criteria): one question if that settles it, otherwise /deep-interview. A clear task gets no questions. Never ask a question already answered; put answers in the spec.
