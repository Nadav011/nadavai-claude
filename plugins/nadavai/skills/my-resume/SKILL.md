---
name: my-resume
description: "חזרנו עם משתמש חדש, אחרי חסימה או אתחול: מפעיל מחדש את כל מה שרץ, בלי לחכות לחסימה הישנה ובלי לעשות פעמיים."
argument-hint: "[מה השתנה]"
disable-model-invocation: true
---
# my-resume: back after an account switch, a limit or a restart

The session stopped in the middle (a usage limit, a new account, a reboot) and Nadav is back. Agents and commands that were running before the stop are most likely dead.

1. If your last turn asked him a question that got no answer, ask it again first (`working-style.md`, Sessions).
2. The limit or the login error that stopped the work belonged to the old account. Do not wait for its reset time, and treat an agent that stopped on it as dead, not as waiting.
3. Invoke the Skill tool with skill `oh-my-claudecode:recall` to rebuild where the work stands from what was saved. If that skill cannot load, read the plan and state files of this work, `git status` and the recent log, and the end of the conversation.
4. Start again every agent and command that was running, each from the step after its last finished one. First check what it already finished (git, the PR, `nadavai-deploy` status, the client-messages log, files on disk). A send, a merge, a deploy, a deletion or a charge is repeated only after that check shows it did not happen. A Workflow run that stopped is resumed with `resumeFromRunId`, which keeps the results of the agents that finished (`model-routing.md`).
5. An approval he gave before the stop holds for the exact thing and state it was given for. "Continue" gives no new approval.
6. Restart within `machine-load.md`. Then tell him in a few lines what survived, what you restarted, and what you did not restart and why.

If he is typing this into many sessions one by one, tell him once that `resume-all --send` resumes every stopped Orca session at once.

What he said changed, if anything: $ARGUMENTS
