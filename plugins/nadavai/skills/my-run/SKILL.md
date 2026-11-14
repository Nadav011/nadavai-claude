---
name: my-run
description: "תמשיך עד הסוף בלי לעצור: רשימה של מה נחשב גמור, עבודה במקביל, יומן של מה שהוחלט בלעדיי, ועצירה רק על מה שבאמת מחכה לי."
argument-hint: "[מה לסיים]"
disable-model-invocation: true
---
# my-run: carry it to the end without stopping

Nadav is leaving, often for the night, and wants this work finished when he is back.

1. Turn the goal into a short list of what done means here. Each line is something that can be checked: a command that passes, a page that loads, a status that is green. Cover everything his words include. `working-style.md` (Finishing) has the rules for this list.
2. Print one ready `/goal` line that he can paste to hold the session to it, ending the way Finishing says a goal condition ends. Do not wait for him to paste it. Start working.
3. Work through the list. Run independent units in parallel, within `model-routing.md` and `machine-load.md`. Check each unit when it is finished, not all of them at the end.
4. What waits for him and what runs without asking is set in `working-style.md` (Approval gates), in `acting-on-behalf.md` and in the project's own files. Read the Approval gates section now instead of working from a remembered list, because it changes. An engineering action follows `~/nadavai/guides/production-change.md` and goes in the "בוצע בלי לשאול" report. A blocked item does not stop the others.
5. Keep a decision trail as you go, because he will ask what was decided without him. Invoke the Skill tool with skill `oh-my-claudecode:show-me-your-work`. If that skill cannot load, append one line per decision to `decisions-made-alone.md` beside the plan: what you chose, what you rejected and why, and the evidence. When something forces you away from the plan, take the option that is easier to undo, write it in the trail, and continue. A choice that Approval gates or `working-style.md` (Requests) leaves to him, such as a product decision that changes what a person does, sees or pays and that nobody decided, is not made here: it waits for him like a blocked item, and the work that does not depend on it goes on. Write each entry when the decision is made, not at the end.
6. Save the state of the work to its plan and task files as you go, so that a compaction or a restart loses nothing.
7. When the list is met, or only blocked items remain, write the report he will read when he is back: what is done with its evidence, what is blocked and on whom, what you decided alone (from the trail, with its path), and the exact question for each thing that waits on him.

His words for this run: $ARGUMENTS
