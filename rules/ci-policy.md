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
  `~/secscan`), which posts `nadavai-security`.
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
   4 parent gone, 5 nothing to wait on (no landing PR, a draft), 6 superseded by a newer push.
6. Merge only when every `ci/woodpecker/pr/*` status and `nadavai-security` on the PR head are
   green, with `gh pr merge <N> --match-head-commit <sha>` (a push after the check then cannot slip
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
8. A red landing is fixed, not rerun. Rerun (Woodpecker UI "restart") only for an infrastructure
   failure, and say so in the report.
9. A newer push to a PR cancels its older run automatically.
10. Production deploys are manual (Nadav's call, 2026-11-03) until the deploy service on the
    Oracle VM is live; then a green main deploys and health-checks itself.

## Repos
- Cut over to Woodpecker: the repos listed in `~/nadavai/lib/woodpecker-repos.txt` (snooker-smart,
  cash-next-app, sportchat-web). Each has its workflows in `.woodpecker/` (one `landing.yml`, or
  several, like therapy-flow-v2's `web.yml` + `backend.yml`, which two agents run in parallel).
  sportchat-web has no Lighthouse per landing for now (Nadav).
- Not yet cut over (therapy-flow-v2): until it appears in that list, it keeps the old flow on the
  temporary host on the LENOVO: `ci-wait therapy-flow-v2 <branch> --land`, and merge after a
  main-tier landing pass. Its Woodpecker runs are shadow runs only.
- A new repo: copy a `.woodpecker/landing.yml` from a cut-over repo, activate the repo on
  ci.nadavc.ai, land it once green, then add it to the list.
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
> through `heavy-slot --`; get a database with `pg-pool get <repo>`. Wait on CI with `ci-wait`
> in the background, never with a sleep loop.
