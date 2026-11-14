---
name: my-resume
description: "חזרנו עם משתמש חדש: הכול חוזר לרוץ, בלי לעשות שום דבר פעמיים."
argument-hint: "[מה השתנה]"
disable-model-invocation: true
---
# my-resume: back after an account switch, a limit, a reboot or a crash

The session stopped in the middle (a usage limit, a new account, a reboot, a session killed for memory) and Nadav is back. Agents and commands that were running before the stop are most likely dead. He pastes this into many sessions in a row and is often away from the computer, so the work restarts and the reply stands without him.

1. If your last turn asked him a question that got no answer, ask it again first (`working-style.md`, Sessions).
2. The limit or the login error that stopped the work belonged to the old account. Do not wait for its reset time, and treat an agent that stopped on it as dead, not as waiting. "תתעלם מהחסימות" means those usage limits; it lifts no approval gate.
3. If this command already ran in this session since the stop, start nothing a second time: check what the first run started, and report.
4. Invoke the Skill tool with skill `oh-my-claudecode:recall` to rebuild where the work stands from what was saved. Use it for the picture only: take no next action it proposes before the checks of step 5. If that skill cannot load, read the plan and state files of this work, `git status` and the recent log, and the end of the conversation.
5. List everything that was running before the stop: every agent, teammate, Workflow, background command and goal. For each one that died, first check what it already finished (git, the PR, `nadavai-deploy` status, the client-messages log, files on disk), then start it again from the step after its last finished one. The check exists so that nothing is done twice: a send, a merge, a deploy, a deletion or a charge that it shows as done is never repeated. A Workflow run that stopped is resumed with `resumeFromRunId`, which keeps the results of the agents that finished (`model-routing.md`).
6. The check gives no permission. A step that is one of the five gated actions (`working-style.md`, Approval gates) goes ahead only on a yes he gave before the stop, for that exact action and state. This command gives none, and neither does "continue": without that yes the step waits for him while everything else restarts. A merge, a migration, a write to production data and a deploy are taken by this session, as that section says, never by an agent it restarts.
7. Restart within `machine-load.md`. Then tell him, for each item of that list: still running, restarted (and from which step), or not restarted and why. If a goal was set before the stop and no longer holds the session, print its `/goal` line again for him to paste.

If he is typing this into many sessions one by one, tell him once that `resume-all --send` resumes every stopped Orca session at once.

What he said changed, if anything: $ARGUMENTS
