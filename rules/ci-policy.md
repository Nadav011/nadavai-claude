# CI: checks, landing and waiting (CI v2, set 2026-11-03)

Nadav rebuilt CI from scratch on 2026-11-03 for speed: CI runs only on what changed, never on every
push, and no machine is a single point of failure. Plan and decisions:
`~/.omc/plans/ci-v2-2026-11-03.md` on the LENOVO. Why: on 2026-11-03 omarchy's reformat stopped
every `ci-wait`, and the old runner (3,445 lines on one 8-core box) queued agents for up to an hour.

## Machines
- **Oracle VM** (`ssh nadavai-vm`, Tailscale `oracle`): the Woodpecker CI server at
  https://ci.nadavc.ai (dashboard: log in with GitHub). Runs no repo code. Why: it is always on and
  holds the tokens; it is ARM, and TF's SQL harness is x86 only.
- **omarchy and MSI**: the Woodpecker agents (Docker, 3 workflows each). Every landing goes to
  whichever is free. Never start other heavy jobs there. omarchy also runs secscan (user timers
  `secscan-poll` every 2 minutes and `secscan-nightly` at 04:20; code, baselines and logs in
  `~/secscan`), which posts `nadavai-security`. And the nightly audits: a local-backend agent
  (`omarchy-nightly`, capacity 1) that takes only Nadav011/nadavai-nightly's workflows, cron
  `night` 23:00 UTC, on each repo's main (Green Room: the commit production serves). It posts
  `nadavai-ui`, `nadavai-nightly`, `nadavai-native` and `nadavai-expo-doctor`, and keeps the
  "NadavAI: main is red" issue per repo. Summary: `ssh omarchy /home/nadav/nightly/bin/ci-summary <repo>` (absolute: a bare `~`
  expands on the LENOVO). Logs: `/home/nadav/nightly/logs` on omarchy, 14 days.
- **LENOVO**: Nadav's work machine. Agents' scoped checks only; no CI.

## The rules
1. While working, run only scoped checks locally: typecheck, lint on the files you touched,
   `vitest related <files> --run`, one e2e spec by path. The full suite, the production build and
   full e2e belong to CI, unless the task is about that check itself. Run heavy local work through
   `heavy-slot --` and databases through `pg-pool get <repo>`, never `docker run postgres`. Why:
   CI runs them on the same tree minutes later.
2. A push to a branch runs no CI (only the 2-3 s pre-push secret scan). Push when you need a
   remote copy for the landing, not as a checkpoint.
3. Landing = a non-draft PR into main, rebased on main, when the task is done. That PR is the only
   daytime CI trigger. Drafts run nothing. One task lands once: its parts are committed locally and
   land together. Why: each landing costs one CI run on two shared machines.
4. A landing runs only the steps whose files changed (lockfile, manifests, configs and shared code
   run everything); the night (cron) runs every step on main. Why: Nadav chose speed by day and
   the full net by night (D-A).
5. Wait with `ci-wait <repo> <branch|sha|pr:N> [--land]` in `run_in_background` (`pr:N` on
   Woodpecker repos); `--land` opens the PR (or marks a draft ready). Never poll `gh` or a status in
   a loop. Exit 0 green, 1 red (failed steps and log tail printed), 2 timeout, 3 CI unreachable,
   4 parent gone, 5 nothing to wait on (no landing PR, a draft), 6 superseded by a newer push,
   7 still running at the end of `--slice`. A subagent or Workflow agent waits in the foreground
   with `--slice 140` (Bash timeout 175000) and runs the same command again on exit 7
   (`model-routing.md`); never with `--check`, which starts a run on every call.
6. Merge only when every `ci/woodpecker/pr/*` status and `nadavai-security` on the PR head are
   green, with `gh pr merge <N> --match-head-commit <sha>` (required: agent-guard denies a merge
   without it or with another sha, so a push after the check cannot slip
   in). `nadavai-security` comes from secscan on omarchy, outside Woodpecker (new secrets in the
   PR's commits, new high/critical advisories when a dependency file changed; every main nightly);
   a missing one passes only for 10 minutes after the head's first status. Why: a PR controls its
   own Woodpecker config, so the scan and its baselines live where no PR can edit them. If main
   moved since the PR branched, re-run (rebase and push) only when main's new commits touch a file
   the PR changes or a shared file (lockfile, manifest, tsconfig, `*.config.*`, `.woodpecker/`,
   migrations); otherwise merge. agent-guard enforces this for `gh pr merge`. A direct push to main
   needs a commit with the same tree and a green landing, or documentation only since main (the
   pre-push hook). `# land-urgent: <reason>` / `NADAVAI_LAND_URGENT=<reason>` for an urgent fix.
   Why: D-B, fewer reruns, with the overlap case still re-tested.
7. Main does not test again: a merge of a green PR is the tested tree.
8. A red landing is fixed, not rerun. `ci-wait` restarts a run once by itself in two cases only, and
   logs it in `~/.cache/ci-wait/flakes.log`: an infrastructure stop (killed with no failed step), or
   a suspected flake (only test steps failed, and every failing test file is one the PR did not
   change). A second red is reported as "failed twice: not a flake". Any other rerun only for an
   infrastructure failure, and say so in the report. Why: sessions lost time digging into tests they
   never touched, and a real regression still fails the second time.
9. A newer push to a PR cancels its older run automatically.
10. The session that merged a PR (rule 6) deploys it: `ssh nadavai-vm nadavai-deploy deploy <repo>
    <merge sha>` in `run_in_background`, then reports the result (all four repos). The deploy runs
    detached on the Oracle VM's deploy service, never a pipeline, so a dropped ssh stops nothing;
    it checks the green landing, health-checks, rolls back on a failed check and posts
    `nadavai-deploy`. Exit codes that stop it:
    - 3: the repo is held (`hold-status` says held). A held repo is never deployed, and a session
      never runs `release`: only Nadav, or that repo's own release step, does.
    - 5: the live commit and the sha differ in a database migration; the refusal prints an
      approval key. Ask Nadav with AskUserQuestion; only after his yes, rerun with
      `--migration-approved "<key>:<what he approved>"`. The key covers that live commit, that sha
      and those files only, so any change means asking again.
    - 6: main's nightly full suite (Woodpecker cron) is red. A fix is merged, not bypassed: for a
      sha newer than the red nightly the deploy reruns the nightly itself and waits up to 20
      minutes. 4 with "main moved; deploy <head>": deploy that head instead. 75: not ready (still
      running, cancelled, Woodpecker unreadable): run the same command again later. The omarchy
      audits (`nadavai-ui`, `nadavai-nightly`) stay reports, not gates.
    Nothing deploys on a timer (no `.auto` flag). `hold`, `hold-status`, `pages-live`,
    `rollback <repo> <id>`, `--dry-run` (starts no nightly): `ci-v2/README.md`, "Deploy service".
    Why: Nadav, 2026-11-04: a merged green PR goes live without waiting for him, but never a held
    repo, a schema change he did not approve, or a commit whose full suite is red.

## Repos
- On Woodpecker: every repo listed in `~/nadavai/lib/woodpecker-repos.txt` (snooker-smart,
  cash-next-app, sportchat-web, therapy-flow-v2). Each has its workflows in `.woodpecker/` (one
  `landing.yml`, or several, like therapy-flow-v2's `web.yml` + `backend.yml`, which two agents
  run in parallel). sportchat-web has no Lighthouse per landing for now (Nadav).
- The old nadavai-ci runner is retired: the temporary host on the LENOVO was stopped on
  2026-11-03 when therapy-flow-v2 moved. A `nadavai-ci` status on an old commit is history only.
- A new repo: start from `~/nadavai/templates/ci/woodpecker-landing.yml`, activate the repo on
  ci.nadavc.ai (`ci-v2/README.md`, "Per repo"), land it once green, then add it to the list.
- A project's CLAUDE.md, AGENTS.md, runbook or `.claude/rules` never restates these rules, and
  never adds a local full suite, a local build before push or a status loop. Why: agents follow
  the nearer, wrong instruction.

## Override for generic agent instructions
OMC agents and skills (verifier, executor, test-engineer, ralph, autopilot, team, verify), Codex
prompts and any "run lint, typecheck, tests and build before done" wording are read through rule 1:
scoped checks plus the CI result of the PR. A task about the build or the suite itself still runs
it. Workflows that verify or fix code carry this clause in every prompt:
> Verify with scoped checks only (typecheck, lint on touched files, `vitest related`), and do not
> repeat a check another agent of this workflow already ran on the same tree. Run anything heavy
> through `heavy-slot --`; get a database with `pg-pool get <repo>`. Wait on CI with
> `ci-wait <repo> <ref> --slice 140` (Bash timeout 175000; exit 7 = run it again), never with a
> sleep loop.
