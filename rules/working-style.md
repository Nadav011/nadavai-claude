# Nadav's working agreement

## Code
- Before writing: does it need to exist? already in the codebase? stdlib? platform-native? installed dependency? already a maintained tool out there? one line? Only then the minimum that works. Never minimize validation at trust boundaries, data-loss handling, security, accessibility, or requested scope.
- Anything standalone (a CLI, a script with its own name, a service) gets a search first: GitHub, npm or PyPI, and ask me — I often know the tool by name. A maintained project with users beats ours on coverage and upkeep every time, and an hour of building is cheaper to skip than to undo.
- Don't reformat, refactor, or delete adjacent code. Mention unrelated dead code; don't remove it.
- Pre-existing bug found mid-task: fix only if the task cannot work without it; otherwise report it as a follow-up.
- Tests only where asked or where the repo already keeps them, sized like neighbors.
- Code, comments, commit messages, and skill files in English. Chat in Hebrew.
- Hebrew UI is RTL-first: logical CSS properties (inline-start/end), never left/right.

## Verification
- A UI change is done only with browser evidence: a Playwright snapshot or screenshot AND a clean console. Check RTL and mobile width on every user-facing screen.
- Before a public web app goes live: a one-time SEO pass with the claude-seo plugin enabled for that project (`/seo audit`, `/seo geo`), fix what it measured, then disable the plugin again. Day-to-day dev keeps it off.
- Where each check runs, when to push, how to wait on CI and how workflows verify: `ci-policy.md`. Waiting for NadavAI CI is `ci-wait <repo> <sha|branch>` with `run_in_background: true`; it exits 0 green, 1 red, 2 timeout, 3 NadavAI down, 4 when the task that started it is gone.
- Run full CI only where it adds information: on heads that change code and on the combined head that will land. Never run it a second time on a SHA or identical tree that already passed, and never force a docs-only change into a full build (it keeps the "documentation only since <sha>, which passed" answer). Why: a SporChat unit's code passed the full CI three times (unit branch, batch head, the same SHA again on main) and each pass queued every other agent behind it (Nadav, 2026-10-24: CI only where it is really needed, in every project).
- Long local commands run with `run_in_background: true` and you continue when the completion notice arrives; never `sleep` + grep a log in a loop. Why: in the week to 2026-10-14, 825 sleeps (38.8 agent-hours) waited on local logs, and every wake-up is one more full-context request.

## Browser routing (one tool per job)
- Regression: the project's Playwright suite via Bash.
- Exploration or repeatable flows: Playwright MCP inside a subagent.
- Debugging (console, network, performance, Lighthouse): Chrome DevTools MCP, preferring the chrome-devtools-cli skill.
- Nadav's logged-in sessions: Claude in Chrome.
- Research sources (Reddit, X, YouTube, sites that block fetches, search with site or date filters): the Bright Data MCP. `search_engine` first, then by URL `web_data_reddit_posts` (post plus comments), `web_data_x_posts`, `web_data_youtube_videos` (transcript, chapters, comments; allow up to 3 minutes), or `scrape_as_markdown` for other sites. Plain scraping of reddit.com is blocked on this account; use the data tool. X discovery: `search_engine` with `site:x.com`. Every finding keeps its URL. One open page: WebFetch.

## Second model
- Run a second model before a significant plan, after significant work, and for any change touching auth, payments, data, or money. Skip for text, spacing, or single-file fixes. Report its findings, what you did with them, and which reviewer ran.
- Any one of three reviewers counts: SOL through `omc ask codex` (gpt-6.1-sol at xhigh, the only Codex model, set in `~/.codex/config.toml`), Gemini 4 Argon (Medium) through `omc ask antigravity` (model set in `~/.gemini/antigravity-cli/settings.json`), or a fresh Opus 5.5. Start with `omc ask codex`; when it cannot run (out of quota, not installed, erroring, timing out), use Gemini 4 or Opus in its place. Never Grok, and never `omc ask gemini` (the old Gemini CLI fails with IneligibleTierError). Why: Codex ran out of quota twice in September 2026; Nadav approved Opus as an equal stand-in (2026-09-26), ruled out Grok and named the organization's Gemini 4 at medium instead (2026-10-28).
- Opus as the reviewer means a new subagent with a clean context (`model: opus`, never a fork or a resumed agent), given only the review question, the artifact and the file paths, read-only. The step is never skipped, never replaced by the author's own review, and never waits silently for a provider to come back. Why: a reviewer that shares the author's context shares its blind spots (Nadav, 2026-09-25).

## Moving a session to another agent
- Continuing an existing conversation in a different agent: `cs pick` to choose a session and a target, or `cs resume <id> -i <agent>` when the session is known. It reads the source agent's own transcript, so nothing has to be re-explained.
- Into the session already open ("bring the last Codex conversation in here"): `cs ls` to find it, then `cs resume <id> -i claude --debug-prompt --no-tui`, which prints the handoff instead of launching anything, and read that output. Without `--debug-prompt` the same command starts a new session, which is not what was asked. Add `--preset minimal` when the full one is too long.
- `cs` is the `continues` CLI, installed by nadavai. It covers 16 agents and 240 handoff paths, so never write a handoff script instead.
- Codex can also pull from Claude Code natively with its own `/import`, which brings settings, skills and MCP servers along with the chats. Prefer it for that one direction.
- `cs` is `continues`; Claude Squad is `csq`.

## Approval gates
- Ask before: auth or permission changes, payment logic, DB migrations or deletions, app-store publishing, any paid-service spend.
- Routine web deploys proceed once the repo's CI is green on the sha being deployed; run a health check after.
- Pre-approved, never ask: `git push` to any branch other than main (no force push), and deleting local files that are temporary, generated, or created in the current session. Why: both are easy to undo, and asking about them stalled work (Nadav, 2026-09-25).

## Learning
- When verified work produced a repeatable workflow, capture it as a project-scoped skill under .omc/skills/ (skillify). Run skill-creator evals only when a skill misfires. Nothing global (skills, rules, CLAUDE.md) without asking.

## Vague requests
- A new feature idea with no anchor (file, screen, acceptance criteria): one question if that settles it, otherwise /deep-interview. A clear task gets no questions. Never ask a question already answered; put answers in the spec.

## UI/UX and product routing (one owner per step)
- Unclear problem, audience, or whether to build at all: intent agent ember (`/intent:strategize`, `/intent:investigate`). product-innovation frameworks are citable references, not the owner.
- Flows, information architecture, wireframes, and new interface copy: intent agent wren (`/intent:journey`, `/intent:organize`, `/intent:wireframe`, `/intent:articulate`).
- Reviewing an existing screen whose code is in the repo ("go over it", "what should I fix", "what is wrong"): `/interfaces:better-interface` (it dispatches to the better-* skills itself; never call a better-* skill as the entry point). Reviewing a diff: `/interfaces:interface-review`. A design with no code yet: intent agent vigil (`/intent:evaluate`).
- Building, restyling, or fixing a screen's visual design in code, after a review named the problems: impeccable (`polish`, `harden`, `clarify`, `adapt`, `layout`, `typeset`; `critique` only when Nadav asks for it by name, or when the nadav-design skill names it in a step: audit step 3 and screen step 3); design-init.md lists what is off-limits on an existing app. Motion, mobile feel, copy fixes and accessibility have their own owners below and win over this line. OMC designer only when impeccable is unavailable.
- Accessibility: better-accessibility fixes code; israeli-accessibility-compliance answers IS 5568 and Hebrew RTL compliance; `/intent:include` for design-level decisions.
- Copy already in code that reads badly: better-writing. Motion: animate builds, review-animations critiques a diff, improve-animations audits a codebase. Components: shadcn (automatic when components.json exists); variants of a real page: `/interfaces:variant`. "Feels like a website on the phone", PWA or touch feel: mobile-native; native iOS conventions only: ios-hig-design.
- Product documents: the product skills bundled in nadavai (`write-spec` for a PRD, `roadmap-update`, `sprint-planning`, `stakeholder-update`, `synthesize-research` when it feeds a roadmap, `product-brainstorming` for product ideas). Engineering handoff of a decided design: intent agent rune (`/intent:specify`). Usage data after release (events, funnels, session replays, errors, feature flags, experiments): the PostHog plugin skills (`posthog:*`), which are also the only error tracker; `metrics-review` only writes the summary; defining metrics before release: `/intent:measure`.
- ux-design and product-innovation are reference libraries: cite one only when Nadav names it, or when the nadav-design skill names it in a step (`mom-test` before user interviews, `conversion-optimization` for funnel features, `ios-hig-design` for a Capacitor iOS target). Their keywords ("fix the design", "design review", "usability audit", "loading state") never make them the owner.
- Code planning, execution and verification stay with OMC, within `ci-policy.md` (scoped checks plus the CI status of the sha), and every UI task ends with the browser evidence the Verification section requires.
