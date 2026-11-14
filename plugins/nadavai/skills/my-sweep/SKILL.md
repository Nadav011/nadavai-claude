---
name: my-sweep
description: "בוא נעבור על הכול מחדש: קודם רשימה של מה זה הכול, ובסוף מה השתנה ומה לא נבדק."
argument-hint: "[כותבים כאן: על מה עוברים]"
disable-model-invocation: true
---
# my-sweep: go over all of it again

Nadav asks to go over a whole area again: the rules, the skills, the tools, the machines' setup, an app. He opens with words like «בוא נעבור רגע על החקוים שלי כי אני חושב שעשינו שכתוב והם לא שוכתבו טוב». In the sessions where he asked this, "all" grew after the first answer, and he then asked «יש עוד דברים או שבאמת סיימנו ?» and «מה עשינו בעצם ?». A sweep with no list is the kind of work that runs for hours and cannot say what it covered.

What to go over: $ARGUMENTS

1. Before you change or fix anything, print the list of what "all" covers here as a table in your reply: each line with one sentence on its state today, read from what exists and not from memory (for the agents' setup: the rule files, the skills, the hooks, the MCP servers and plugins, the settings, both machines, CI). Reading comes before the list; fixing comes after it. Once it is printed, he can cut or add (one AskUserQuestion), and you begin meanwhile with the lines nobody would cut.
2. When he says the existing text is not to be trusted, judge each piece by what it does today (run it, measure it), not by what it says about itself.
3. For each line: check it, fix what is broken at its root, and keep the number from before and after where there is one. Global files are changed in `~/nadavai` as `nadavai.md` says. A piece that says the same thing in two places keeps one place; whether work is doubled is the question of `/nadavai:my-method`.
4. Decisions that are his are collected and put to him once, with your own position first (`working-style.md`, Requests), not one at a time along the way.
5. A sweep adds no stop: a new line that makes agents ask him, wait for him or refuse is proposed to him, not written (`nadavai.md`).
6. Close with the list again, as a table he can read: for each line, changed (what, in plain words), fine as it is (how that was checked), or not checked (why). Then what applies to the other machine and what needs open sessions restarted. The table is the answer to "what did we do" and to "is there more"; "done" alone is not.
