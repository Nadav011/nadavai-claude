---
name: my-ship
description: "תעלה הכול ל-MAIN ולדומיין: הכול עולה, ובדיקה שזה באמת באוויר."
argument-hint: "[מה להעלות]"
disable-model-invocation: true
---
# my-ship: land it and put it live

Nadav wants the finished work in main and live on the domain, with proof of both. "Pushed" is neither.

1. List what is to ship: the branches, PRs and repos of this work, and where each stands now (committed, pushed, PR open, CI state, merged, deployed). Check each one live; do not report it from memory.
2. Land and deploy each one the way `ci-policy.md` sets, reading that file now: one landing per task, the wait with `ci-wait`, the merge tied to the checked commit, then the deploy by the session that merged. The merge, a migration and the deploy are taken by this session, never handed to a subagent; the one exception is the one `working-style.md` (Approval gates) gives: a step of a Workflow this session runs, when a procedure in the project's files gives that step the action and Nadav approved that procedure. Its exit codes for a held repo, a migration and a red nightly are hard gates, and each has its own way forward there.
3. A step that is an engineering action (a migration, a production data fix, an auth or payment change) follows `~/nadavai/guides/production-change.md` and goes in the "בוצע בלי לשאול" report. The gated actions of `working-style.md` (Approval gates) still wait for him; a public store release is one of them.
4. In a repo with store apps the deploy is finished only when the apps got it too (`store-apps.md`): the OTA status, or the live URL serving the commit.
5. Prove it is live: the commit on main, the deployed address answering with that commit or build, and one real check of the thing that changed (the page loads, the flow runs), from a browser where it is a screen.
6. Reply per item: in main (the commit), live (the address and the check), or not yet, with the exact reason and who holds it. Then the link he can open.

A red CI is fixed, not rerun, and no check is skipped to reach main sooner.

What to ship, if he named it: $ARGUMENTS
