---
name: my-takeover
description: "תמשיך את הסשן ההוא עד הסוף: מוצא אותו, אומר מה היה ומה פתוח, ומסיים עד שזה באוויר."
argument-hint: "[כותבים כאן: איזה סשן להמשיך]"
disable-model-invocation: true
---
# my-takeover: finish the work of another session

The goal Nadav opens sessions with most often: another session stopped (a limit, a crash, a subscription that ran out, an account switch) and this one is to finish its work. He describes that session and seldom gives its id. In the sessions where he asked this he then had to ask what that session was about, what is left, and whether it is all closed. This prompt gives those answers before he asks.

Which session, in his words: $ARGUMENTS

1. Find it and read it the way `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/my-other/SKILL.md` says under "Read another session and continue from it" (steps 1 to 4: every tool and account profile, a session that will not open, never the raw transcript, and the check that it is not still running). From a description, narrow by the project folder, the tool and the date. When two or more sessions fit, show them in one AskUserQuestion (start time, folder, its first line); do not guess.
2. Your first reply, before any work, is a few lines of everyday Hebrew: what that session was for, where it stopped, what is finished, and what is open. "Finished" is what you checked now against the files, the branches and the live address; what the other session wrote about itself is a lead. If he asked only to find or open the session, say this, give him the way to open it in its own folder and branch, and stop here.
3. Nothing happens twice. Before a send, a merge, a deploy, a deletion or a charge that the other session may already have made, read its trace (`working-style.md`, Sessions: the client-messages log, `nadavai-deploy` status, git, the PR) and start from the first step that did not happen.
4. Turn what is open into the list "מה נחשב גמור" and carry it to the end as `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/my-run/SKILL.md` says (its steps 1 and 3 to 7). For work that ships, done is: in the main branch, live on its address (`ci-policy.md`), and opened for him to see.
5. A term the other session used (a check's name, a made-up label for a round or a unit) is said in plain words the first time it appears: he does not program.
6. Close with the answer he otherwise has to ask for: whether everything that session owed is closed, what waits and on whom, and whether both sessions can be closed (`working-style.md`, Finishing).
