---
name: ultragoal
description: Durable multi-goal workflow that persists plan/ledger artifacts under .omc/ultragoal and prints Claude /goal handoff text for the active session
argument-hint: "<brief or subcommand>"
level: 3
---

> **nadavai preface.** Copied from oh-my-claudecode (see `../VENDORED.md`). The `omc ultragoal` CLI comes from the
> npm package `oh-my-claude-sisyphus`, which stays installed without the plugin (`omc ultragoal --help` lists the
> subcommands). Native `/goal` holds one session; this skill is for a goal that has to survive across sessions. Only
> Nadav can turn `/goal` on: print the `/goal` line for him to send and work on the stories meanwhile, recording each
> finished story's evidence in the plan file (`my-run`, steps 2 and 6). The CLI (5.8.4, checked 2026-11-14) runs
> `create-goals`, `complete-goals`, `status` and `checkpoint --status failed` without a goal, but refuses
> `checkpoint --status complete` and `record-review-blockers` unless `--claude-goal-json` carries the condition it
> printed, word for word, with status `active` (`complete` for the final story). Write that snapshot only from a
> `/goal` the session can see is on, as he sent it: never from a goal you cannot see, and never edited to fit. A
> `/goal` line that ends with the blocker clause of `rules/working-style.md` (Finishing) does not match, with one
> exception: while it is `active` no story is checkpointed complete, but once the session sees it met or cleared
> (`complete`), the CLI
> closes the whole run in one `aggregate_completed` entry when the evidence names the story id, the plan file,
> finished work and a passed check, leaving each story as it was. The skill is worth using only for a story list that
> has to outlive the session; its ledger records a finished story only under a `/goal` that is the CLI's condition
> word for word, and otherwise the plan file carries each story's evidence.
> Where this file or the handoff the CLI prints asks for several final checks (ai-slop-cleaner, verification,
> `$code-review`, an architect status), Nadav's rule of one independent reviewer per piece
> (`rules/working-style.md`, Second model) applies instead. The CLI still requires the `--quality-gate-json` shape,
> so fill it with what actually ran:
> - `aiSlopCleaner`: the author's own pass over the diff before the review (no TODO stub, `.skip` or `.only`, debug
>   output or dead code; `agents/executor.md`, "Before you hand over"); `status: "passed"` only after that pass, with
>   what it found as `evidence`.
> - `verification`: the scoped checks and the landing's CI result (`rules/ci-policy.md`, rules 1 and 5), with the
>   commands that ran.
> - `codeReview`: the one independent review. `recommendation: "APPROVE"` and `architectStatus: "CLEAR"` only when
>   its verdict is APPROVE (no separate architect review runs), with the reviewer and the commit in `evidence`. Any
>   other verdict goes through `record-review-blockers`.

<Purpose>
Ultragoal breaks a brief into an ordered set of goals, records start/checkpoint/blocker/failure events in a durable append-only ledger, and tells the active Claude agent how to drive the Claude Code `/goal` slash command alongside the plan. It does not — and cannot — mutate Claude `/goal` state from the shell; it persists durable repo state and prints a model-facing handoff that the active agent must act on in-session.
</Purpose>

<Use_When>
- The user wants a durable, repo-native way to track an ultragoal across multiple Claude sessions or worktrees
- The work is large enough to warrant multiple ordered "stories" with attempt counts and per-story evidence
- The user wants the final completion gated behind ai-slop-cleaner + verification + $code-review
- The user wants the active Claude `/goal` directive coordinated with the ledger so that a session restart does not lose progress
</Use_When>

<Do_Not_Use_When>
- The task is a single small change — do it in the session or delegate it to `nadavai:executor` instead
- The user wants the assistant to literally invoke `/goal` itself from the shell — that is not possible; `omc ultragoal` only writes artifacts and prints handoff text
- The user wants a planning-only artifact with no execution loop — write the plan as `~/nadavai/guides/documents.md` says instead
</Do_Not_Use_When>

<Why_This_Exists>
Claude Code `/goal` is a session-scoped Stop hook: it blocks the session from stopping until a condition holds, and auto-clears on success. That is a great single-session execution primitive, but it loses state across sessions and does not by itself enforce a final review gate. `omc ultragoal` adds a durable plan, ledger, and gating layer so a long multi-step initiative can survive session restarts, fresh worktrees, and review iterations while still leveraging Claude `/goal` to keep the active agent focused.
</Why_This_Exists>

<How_To_Use>

On plugin-only installs where `omc` is not on `PATH`, replace the `omc` prefix in
the commands below and in generated handoffs with `oh-my-claudecode.js`, or use
`node <plugin-root>/bin/oh-my-claudecode.js`.

1. Create a plan from a brief:
   ```
   omc ultragoal create-goals --brief-file plan.md
   ```
   Or with explicit stories:
   ```
   omc ultragoal create-goals --brief "ship the migration" \
     --goal "Schema::Add new columns" \
     --goal "Backfill::Backfill rows in batches" \
     --goal "Cutover::Drop old columns and switch reads"
   ```
   The default mode is `aggregate` (one Claude `/goal` covers the run).
   Pass `--claude-goal-mode per-story` if you want each story to have its own `/goal`.

   **Multi-repo workspaces / parallel sessions:** when several Claude sessions
   in the same workspace need to run `/ultragoal` concurrently, pass either
   `--plan-id <stable-id>` or `--auto-plan-id` so the plan is written to
   `.omc/ultragoal/plans/{planId}/` instead of the shared single-plan path.
   Without that flag, two sessions creating goals would clobber each other.
   `--auto-plan-id` derives `{epochMs}-{slug}` from the brief title. Then thread
   the same `--plan-id <id>` through every subsequent subcommand in that session.
   Use `omc ultragoal list-plans` to enumerate available planIds when needed.

2. Start (or resume) the next story:
   ```
   omc ultragoal complete-goals [<goal-id>]
   ```
   With no goal id, this preserves the default behavior of resuming the active story or starting the first pending story. With a goal id, OMC targets exactly that named eligible story (a pending story may be started out of order); it never falls through to another story. An active different story, unknown id, completed or review-blocked story, or failed story without `--retry-failed` is rejected without state mutation. An in-progress named story is resumed without changing its attempt. This prints a model-facing handoff. The active Claude agent must read it and:
   - Set the native Claude `/goal` for this session — in standalone Claude Code neither the
     shell nor the agent can do it, so print `/goal <aggregate objective>` for the user to
     send, and keep working. `--claude-goal-json` (below) reconciles the ledger only.
   - Work the story.
   - When the story is complete (and for the final story, after the full quality gate), share back a snapshot of the active `/goal` state (only as the preface says) and call `checkpoint`.

3. Checkpoint a story:
   ```
   omc ultragoal checkpoint --goal-id G001-... --status complete \
     --evidence "tests/files/PR evidence" \
     --claude-goal-json '{"goal":{"objective":"...","status":"active"}}'
   ```
   For the final story, also pass `--quality-gate-json` containing
   `aiSlopCleaner`, `verification`, and `codeReview` evidence (all clean).

4. If the final review is not clean, do NOT mark complete. Record blockers:
   ```
   omc ultragoal record-review-blockers --goal-id G00X-... \
     --title "Resolve final code-review blockers" \
     --objective "Fix the listed review findings and rerun final gates" \
     --evidence "<the review findings>" \
     --claude-goal-json '{"goal":{"objective":"...","status":"active"}}'
   ```
   This appends a new blocker story and keeps the Claude `/goal` active.

5. Inspect state at any time:
   ```
   omc ultragoal status
   ```

</How_To_Use>

<Important_Limitations>
- The shell cannot invoke or mutate Claude Code `/goal` state. `omc ultragoal` only persists durable artifacts and prints instructions that the active Claude agent reads and acts on in-session.
- Snapshots passed via `--claude-goal-json` are model-supplied proof of the active `/goal` state; OMC validates them for textual consistency with the plan's expected objective and ledger event, but it cannot independently observe Claude `/goal` state.
- If the Claude `/goal` slash command is renamed or restructured, only the handoff wording needs to change; the reconciliation logic is name-agnostic.
</Important_Limitations>

## Parallel session caveats

- **Multi-repo workspace anchor:** drop a `.omc-workspace` marker at the parent directory so multiple sessions across sub-repos share one `.omc/`. Resolution order: `OMC_STATE_DIR > .omc-workspace > git > cwd`. See `docs/REFERENCE.md`.
- **Session id source:** OMC_SESSION_ID env var wins in CLI contexts.
- **Plan id (when applicable):** Two runs in the same workspace will conflict on shared plan artifacts. Pass `--plan-id` to keep parallel ultragoal runs on separate ledgers.
- **Parallel verdict:** supported with `--plan-id`
