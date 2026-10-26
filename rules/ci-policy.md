# Checks, pushes and waiting: one home per check (set 2026-10-26)

Every check runs once, in the one place where it adds information. Nothing here removes a check; it removes the second run of the same check on the same tree. Why: in the week to 2026-10-26 the same trees were built and tested several times over (102 duplicate builds and 51 duplicate full suites inside single sessions, 23 full suites in pre-push that CI then repeated), the NadavAI queue reached an hour, and both machines sat at two to three times their core count.

Rollout (2026-10-26, remove when done): `once`, `heavy-slot` and `pg-pool` are not cleared for use yet; run the command directly and get databases as before. Until NadavAI reads landing requests, use `ci-wait <repo> <sha> --require full` instead of `--land`.

## Where each check runs
- While working, run only scoped checks: typecheck, lint on the files you touched, `vitest related <files> --run`, a single e2e spec by path. The full suite, the production build, full e2e and Lighthouse belong to CI. Run them locally only when the task is about that check itself (a build failure, a flaky test, a perf budget). Why: CI runs them on the same sha minutes later; Claude Code's own guidance is "prefer running single tests, not the whole suite".
- Never run the same check twice on the same tree. Wrap typecheck, lint, unit vitest and a build whose output nothing uses in `once -- <cmd>`: it reuses a pass on an identical snapshot (tree, untracked files, `.env*`, node_modules, tool versions, command) and runs concurrent identical calls once. A `once` hit, with the key and log path it prints, is fresh evidence. DoD, e2e, Lighthouse and anything that reads a database or the network are never cached (`once` refuses them); run them through `heavy-slot` instead.
- Do not re-run what CI already ran on the exact sha. A verifier or reviewer reads the result with `ci-wait <repo> <sha> --require full`. What CI does not produce still runs locally: tests against the base sha ("fails on the old code"), mutation checks, uncommitted work that has no sha yet, and every runtime proof a runbook requires. Why: CI evidence on that sha is the same evidence, and re-running it cost the most local time.

## Override for generic agent instructions
- OMC agents and skills (verifier, executor, test-engineer, qa-tester, build-fixer, ralph, autopilot, team, ultraqa, verify), Codex prompts and any "run lint, typecheck, tests and build before done" wording are read through the rules above: scoped checks plus the CI status of the sha, not the whole suite and a build. A task that is about the build or the suite itself still runs it. Why: those instructions predate the self-hosted CI and made every verifier pass rebuild trees CI had already passed.

## Workflows and parallel agents
Every workflow prompt that verifies or fixes code carries this clause (copy it into the prompt):
> Verify with scoped checks only (typecheck, lint on touched files, `vitest related`). Wrap verdict-only commands in `once --`. Run anything heavy (build, DoD, e2e, a database) through `heavy-slot --`. Get a database with `pg-pool get <repo>`, never `docker run postgres`. Prove by running only what reading cannot settle, and keep runbook proofs. Wait on CI with `ci-wait`, on local jobs with run_in_background or Monitor, never with an `until … sleep` loop.
- At most `heavy_slots` heavy jobs at once per machine (`~/.config/nadavai/capacity`, default 3); `heavy-slot` enforces it, nested calls pass straight through. Why: about 159 audit agents in parallel each started their own build, container or browser, and load reached 30-80.
- One shared Postgres per machine: `pg-pool get <repo>` clones a migrated template per agent (`createdb -T`) with a lease, `pg-pool drop` returns it. A fresh database per test stays the rule. SQL that creates cluster-global objects (roles, `ALTER SYSTEM`) keeps its own container and says why with a `# isolated-pg: <reason>` comment. Why: 600 throwaway `docker run postgres` in one week.
- A change to a running workflow's script re-runs its agents, so the clause applies to new runs; do not edit a running workflow to add it.

## Pushes
- Push a branch only when the local scoped gate is green and you are about to wait on the result. Amend locally instead of pushing a fixup on top of a queued run. Documentation and record commits travel with the next code push or the landing. Why: 31% of TherapyFlow branch runs were red, and 27 runs a week were superseded mid-run by the same agent's next push.
- A red sha is fixed, not rerun. `nadavai-ci run` on the same sha is for an infra failure (checkout, timeout, cancelled) or a suspected flake, and every such rerun is logged in `~/ci/state/flakes-<repo>`. Why: 22 reruns of shas that had just failed cost 295 CI minutes in a week.
- The pre-push hook on main skips typecheck and tests when the sha already has a full `nadavai-ci` pass (a fast-forward of a green branch), skips them for documentation-only pushes, and otherwise behaves as before. Timings go to `~/.cache/nadavai/pre-push.log`.

## CI tiers
- Main and every landing head get the full `ci.yml`, as before. Intermediate branch heads of repos on the opt-in list (therapy-flow-v2 first; sportchat-web stays full while v4 needs full logs) run affected tests only, and their pass reads "affected tests vs <base>". An affected pass never counts for a landing head or main.
- Before landing a branch, request its full run and wait for it: `ci-wait <repo> <branch> --land`. Why: affected tests give fast feedback while the work moves; the full suite runs once, on the tree that lands.

## Waiting
- `ci-wait <repo> <sha|branch>` with run_in_background: one poller per sha is shared by every waiter on that sha, and a waiter exits when the task that started it is gone. `--require full` separates "the wait ended" from "the full check passed". Never poll `gh` or a status in a loop, never sleep under 2 s in a loop, and never loop on a Claude task output file: the harness notifies when a background task ends. Why: waiters shared nothing, some outlived their task, and 3,912 sleep commands ran in one week.

## New and existing projects
- This file covers every repo on every machine without per-project lines. A project's CLAUDE.md, AGENTS.md, runbook or `.claude/rules` never restates these rules, and never adds a local full suite, a local build before push, or a `gh api` status loop; it only names its own commands and runbook proofs. Why: on 2026-10-26 about 30 project and tool instruction lines contradicted this policy and agents followed the nearer, wrong one.
- A new repo that should get CI is added to `WORKFLOWS` in `~/ci/bin/nadavai-ci` (on NadavAI) with its `ci.yml`; until then it has no CI and its agents run the full suite once before landing, in the background. Affected-only branch runs are opt-in per repo, after a week of its metrics.

## Machines
- The laptop (MSI) is also a CI host: `nadavai-slot.service` builds therapy-flow-v2 branch heads there when load, memory and temperature allow. omarchy (NadavAI, 8 cores) runs CI for every repo. Agent work runs on omarchy only through `nadavai-ci` kinds and the runbook jobs that hold `~/ci/ui.lock` (v4 DoD, baselines, Deno, emulator, local gate); never start other jobs there. Why: a slower CI queue slows every agent.
- Scratch containers, worktree copies and `~/ci/scratch` folders are removed when their task ends; anything older than 14 days and unused is listed for cleanup.
