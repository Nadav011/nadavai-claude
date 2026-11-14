---
name: my-resume
description: "חזרנו עם משתמש חדש: הכול חוזר לרוץ, בלי לעשות שום דבר פעמיים."
argument-hint: "[מה השתנה]"
disable-model-invocation: true
---
# my-resume: back after an account switch, a limit, a reboot or a crash

The session stopped in the middle (a usage limit, a new account, a reboot, a session killed for memory) and Nadav is back. Agents and commands that were running before the stop are most likely dead. He pastes this into many sessions in a row and is often away from the computer, so the work restarts and the reply stands without him.

1. If your last turn asked him a question that got no answer, ask it again first (`working-style.md`, Sessions).
2. The limit or the login error that stopped the work belonged to the old account. Do not wait for its reset time, and treat an agent that stopped on it as dead, not as waiting. "תתעלם מהחסימות" means those usage limits first, and with them every item that was marked blocked (Nadav, 2026-11-14, picked "לבדוק כל חסימה מחדש"): check the reason of each one again now. Where the reason is gone (it failed on the limit, a service was down, an error that does not repeat), the item is tried again from the step where it stopped, after the check of step 5. Where the reason still holds (a client, a store review, a date, hardware, a yes of his), the item stays in the list with its reason. It lifts no approval gate.
3. If this command already ran in this session since the stop, start nothing a second time: check what the first run started, and report.
4. Rebuild where the work stands from what was saved: read the plan and state files of this work, the decision trail if it kept one (`decisions-made-alone.md` beside the plan, or `.omc/state/decision-trail-*.tsv` in the project), `git status` and the recent log, and the end of the conversation. Report from those files, not from memory: something promised in the conversation with no file behind it is reported as mentioned but not saved, not reconstructed from memory. Use this for the picture only: take no next action before the checks of step 5.
5. List everything that was running before the stop: every agent, teammate, Workflow, background command and goal. For each one that died, first check what it already finished (git, the PR, `nadavai-deploy` status, the client-messages log, files on disk), then start it again from the step after its last finished one. The check exists so that nothing is done twice: a send, a merge, a deploy, a deletion or a charge that it shows as done is never repeated. A Workflow run that stopped is resumed with `resumeFromRunId`, which keeps the results of the agents that finished (`model-routing.md`).
6. The check gives no permission. A step that is one of the gated actions of `working-style.md` (Approval gates), a firmware flash on his machines among them, goes ahead only on a yes he gave before the stop, for that exact action and state. This command gives none, and neither does "continue": without that yes the step waits for him while everything else restarts. A merge, a migration, a write to production data, a deletion and a deploy are taken by this session, never by a subagent or an agent it restarts. That section gives one exception, and it holds here too: a step of a Workflow this session runs, when a procedure in the project's files gives that step the action and Nadav approved that procedure.
7. Restart within `machine-load.md`. Then tell him, for each item of that list: still running, restarted (and from which step), or not restarted and why. If a goal was set before the stop and no longer holds the session, tell him how to set it again: when it was the ready line of his Ctrl+P list, the same row (Ctrl+P, "לנעול את הסשן על היעד", Enter); when it was in his own words, print that `/goal` line again for him to send.

If he is typing this into many sessions one by one, tell him once that `resume-all --send`, run on each computer, resumes that computer's stopped Orca sessions at once; a session that shows "Login expired" is only listed, because it needs his `/login`.

What he said changed, if anything: $ARGUMENTS
