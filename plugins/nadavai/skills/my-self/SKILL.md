---
name: my-self
description: "תעשה את זה אתה: אתה עושה בעצמך את מה שביקשת ממני, ולי נשאר רק מה שרק אני יכול."
argument-hint: "[מה לעשות]"
disable-model-invocation: true
---
# my-self: do it yourself

You asked Nadav to do something, or left a step for him, and he is telling you to do it. He delegates fully (`acting-on-behalf.md`): "I cannot" is not an answer until the tools below were tried.

1. List what you asked of him or left to him in your recent replies, and what he points at below: a login, a form, a click in a console, a command to run, a file to open, a message to pass to another session, a check to make.
2. Read `acting-on-behalf.md` and `working-style.md` (Approval gates) now, not from a remembered list. For each item say which line covers it: it runs without asking, it is one of the things only he can supply, or it is one of the gated actions of that section, a firmware flash on his machines among them.
3. Do every item that runs without asking, with the tool that fits, and move to the next tool when one refuses: a shell command, a CLI or an API; `agent-browser` with the vault for sign-ups, logins and forms; Claude in Chrome for reading what lives only in his Chrome; the `nadavai:desktop-control` skill for a native window; SendMessage for another session. A code that arrives by email or WhatsApp you read yourself.
4. If a permission prompt, a hook or a guard stopped you, quote its text and take the rewrite its message gives. A guard that was put there on purpose is not worked around: say what it blocks and what would lift it.
5. What stays with him is only what those two files leave to him. Ask for each such item at the moment it is needed, with the screen already open and the one thing he has to do named ("להקליד את הקוד מה-SMS בחלון שנפתח").
6. Report: what you did yourself, each with its evidence; what is still his, with the line of the rule that leaves it to him; and what you set up so that it does not come back to him next time (a login saved in the vault, a tool connected, a saved permission).

What he wants done, if he named it: $ARGUMENTS
