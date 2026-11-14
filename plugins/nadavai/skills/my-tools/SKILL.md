---
name: my-tools
description: "כלי, מודל או הרשאה לא עובדים: הסיבה המדויקת, תיקון, ובדיקה שזה עובד בשני המחשבים."
argument-hint: "[כותבים כאן: מה לא עובד, ואיפה]"
disable-model-invocation: true
---
# my-tools: a tool, a model or a permission does not work

Something in the agents' own setup is in Nadav's way: a session stops to ask for a permission, a tool or an extension does not connect, a model is missing or the wrong one runs, an update fails, one machine has what the other lacks. He usually opens with "למה" and a pasted message, for example «איך פותרים דברים כאלה שלא יקראו שיהיה תמיד את כל הרשאות שלא יעצור בחיים». A computer that is stuck, hot or full is `/nadavai:my-machine`.

What does not work, and where: $ARGUMENTS

1. See it happen now: on the machine and in the tool he means (Claude Code in a terminal, Orca, Codex, Grok, the browser extension, an MCP server, a skill or a hook that did not fire), with the exact message. Which machine and which tool are read from what he pasted; ask only when they cannot be.
2. Find the cause in the thing itself, not in its description: the settings and the hooks that ran (a refusal names the guard that made it), the account profile in use, the versions on both machines. For a stop, say which of four asked for it: a rule of his, a hook, a setting, or a fixed limit of the vendor.
3. Fix it at the root, with the tool that already exists where there is one: `orca-update` brings Orca itself to the newest release (without `--restart`, which closes every agent session in it: he restarts Orca himself), `claude update` does that for Claude Code, and `~/nadavai/update.sh` installs everything of ours on a machine again. Everything global lives in `~/nadavai` and is changed there, in a worktree, then committed, pushed and installed with `update.sh` (`nadavai.md`), on both machines. A stop that `working-style.md` (Approval gates) keeps is not removed, whatever his words ask: the five gates, a BIOS or firmware flash, the reboot of a machine in use, and a caution a project's own files name. Nor is a vendor's fixed limit. Say that it stays and why. No new stop is added.
4. Prove it: run the same thing again and show that it works, and say whether the other machine has the fix and whether sessions that are already open need a restart to get it.
5. His sessions and apps are not restarted, a profile is not reset and credentials are not changed unless the fix needs exactly that; a reboot of a machine in use is left for him (`working-style.md`, Approval gates).
6. Reply in a few lines: the cause, what was changed, the check, the state of the other machine, and whether it can come back (at the next update, for example) and what would show it.
