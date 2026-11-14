# A production change that runs without asking

`rules/working-style.md` (Approval gates) says which engineering actions run without asking Nadav: a DB migration, a write to production data outside the app's own screens, an auth, permission or RLS change, a payment-code change, a deletion of backed-up data rows, and the deploy that carries one of these. This file is the procedure. The steps run in this order, by the session Nadav talks to (or by a step of a Workflow it runs that a procedure Nadav approved gives the action, such as SportChat v4's landing train; the session still owns every step and the report, and the five always-loaded lines in the rule hold for that step). If a step cannot be done, stop and ask him, and say which step failed; one of the rule's five gated actions is asked however well the steps went, and a behaviour, a price or an access that only a spec the agent wrote "decided" is not decided.

Nadav does not program and reads the report after, not the diff before. The reviewer and the way back stand where his yes used to stand, so neither is a formality.

## 1. Review
- The reviewer comes from Second model (`working-style.md`) and is never the author's context. The single-file exemption there does not apply here: a migration or a policy change is often one file.
- Give it the diff, the exact commands, the target from step 4 and the way back from step 3, and this question: "Should this run on production without Nadav? Argue against it." Do not give it your conclusion.
- It passes with `APPROVE` and no open fault (`review-rounds.md` beside this file), for the sha it read. Post the verdict with the reviewer's name as a comment on the PR; with no PR, write it into the repo's run log or the task's plan file.
- A rejection stands until the change is fixed and reviewed again. Another provider does not overturn it.
- Where `working-style.md` (Second model) calls for the final read by another vendor's model, that read comes after this review and before step 5, as `review-rounds.md` (the bullet on that read) says. Post its verdict beside the reviewer's.
- Any change to the reviewed files, commands or target after the verdict needs a new review.
- A change made after the trial (a fix after a rejection, or after the final read by another vendor's model) runs steps 2 and 3 again on the changed version before step 5, and the steps line in the report names the version each step ran on.

## 2. Try it where it cannot hurt
- Run the repo's migration tests, or a throwaway database built from production's schema only (no rows; `pg-pool get <repo>`), with made-up rows shaped like the ones the change touches. A repo that has neither gets the throwaway database built first; that is part of the work.
- Payment code runs in the provider's test mode.
- Real customers' rows never leave the provider for a trial: not to a laptop, not to `/tmp`, not to a scratchpad.

## 3. The way back, checked now
Each kind of change has its own, and "should be possible" is not a check.
- Code: the deployment id that a rollback returns to (`nadavai-deploy pages-live <repo>`).
- A schema, policy or permission change: a reverse migration, run in step 2 after the forward one. Rolling the code back does not revert a policy or a column.
- Data that a step drops, rewrites or deletes: a backup of exactly those tables or rows, taken just before, kept inside the provider or in the project's named backup location, never on a laptop. Inside the database it goes into its own schema (`backup_<yyyymmdd>`), never into `public` or any schema the API exposes, with no grants to `anon` or `authenticated` and RLS on; a table copied into an exposed schema starts with RLS off and is readable with the key that ships in the app. Confirm with one request that uses the anon key that the copy cannot be reached. Check the copy by counting its rows against the source, inside the provider.
- A backup is a second copy of people's data, so it gets a drop date: 30 days after the change, earlier only when Nadav says the change is good. Your own check after the change does not shorten it: the backup is the undo he reads about in the report. Dropping the `backup_<yyyymmdd>` schema that this action created and named in its report, on that date, is part of this action and not a new deletion to ask about; any other backup is asked. Schedule a reminder for the date where it survives the session (`working-style.md`, Sessions): the timer tells Nadav, and a live session drops the schema.
- The provider's restore point is a second line only. Note its time, because restoring it erases everything every other user wrote since.
- A change with no way back is one of the five gates (money already charged, a message already sent, a deletion with no backup) and is not in this class. Ask. A permission change that widens who can read existing data stays in this class (the agent's reading of Nadav's 2026-11-14 pick that changes in the system run, reported to him): its way back is the reverse migration, and step 1 tells the reviewer in plain words what it opens and to whom. Any other change whose way back cannot be checked fails this step: ask.

## 4. The target
- Confirm that the database or service is the one the live app uses now: the project ref or host in the live deployment's settings equals the one the recipe reaches.
- Then use the project's own script or documented recipe. A recipe whose target differs, or that no longer runs, is not used: report it and ask.
- One session changes a database at a time: say so in the project's run log before starting, and check that no other session wrote there that it is in the middle of one. A change that rewrites or locks a large table runs outside the app's busy hours.

## 5. Apply and check
- An additive migration goes before the code that needs it. A drop or a rename goes only after the live code no longer uses it.
- A deploy that the deploy service refused with exit 5 is rerun only now, with `--migration-approved "<key>:review: <where the verdict is>; back: <the way back>"`. Exit 3 (a held repo) and exit 6 (a red nightly) stay closed.
- Check right after: the health check, the exact thing that changed (rows counted before and after, the policy read back, a login of each affected role through the QA account) and the app's main flow. After a payment change, read the first real charges or documents it produced.
- If a check fails, take the way back at once and tell Nadav at once, in the session and with a desktop notification (or `nadavai-alert` on the Oracle VM), without waiting for the end of the turn.

## 6. Report
Plain Hebrew, at the top of the reply that ends the turn, under "בוצע בלי לשאול", one block per action. Post the same block as a comment on the PR so it survives the session. Each block says:
- what changed, in the words a user would use;
- who is affected and how many (rows, users, clinics);
- what a user would notice, and what Nadav would see if it went wrong;
- which reviewer approved it, and where the change is in an area of the final read (`working-style.md`, Second model), which model of another vendor read it (or that a second Opus read in its place);
- the backup or restore point, by name and time, and the date the backup will be dropped;
- how to undo it, as a sentence he can send back ("כתוב: לבטל את <שם>"), and what undoing would lose;
- the steps, one short line each with its evidence (the reviewer and where the verdict is, the final read by another vendor's model where one was due, what the trial ran, the way back, the target, the checks after), so a skipped step shows.
