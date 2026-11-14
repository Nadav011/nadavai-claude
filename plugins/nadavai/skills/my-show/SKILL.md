---
name: my-show
description: "תפתח נראה: קישור שנפתח, מה לראות בו ומה השתנה."
argument-hint: "[לא חובה: מה לפתוח]"
disable-model-invocation: true
---
# my-show: open it so I can see it

Nadav wants to look at what was made: a page, a screen, a design, a demo, a document, a message draft. He has not seen your tool calls, and a description of the thing is not the thing.

1. Find what there is to see now: the deployed or published address, the preview, the screenshot, the file. Prefer a link he can open from anywhere; localhost only when he is at this machine (`working-style.md`, Reporting to Nadav).
2. Check it before you hand it over: load the address yourself (a browser snapshot or a request) and confirm that it shows the current version, not an old build or an error page. Something he will pass to a client you check signed out and at phone width. This check is made in this turn and without a window (a request or a headless snapshot), so it runs also when he asks that nothing be opened; an earlier check is not reported as this one.
3. Open it for him, unless his words ask that nothing be opened; then give the link only. This command is his request to open it: use the `orca-cli` skill to open the address in this session's Orca browser pane. If that cannot be done, say so in one line and give the link.
4. Reply in a few lines: the link, written out in full; what to look at and where on the page; what changed since he last saw it; and what is not there yet. For several things, one line each, in the order worth looking at.
5. If nothing can be seen yet, say what exists, what the first thing he can look at will be, and when.

When he asks for a link to send to someone, give the exact public address and say what that person will see without signing in. The sending itself follows `client-messages.md`.

What he wants to see, if he named it: $ARGUMENTS
