---
name: my-connected
description: "התחברתי: בדיקה שהחיבור עובד, המשך מאיפה שנעצר, ושמירה שלא אתבקש שוב."
argument-hint: "[לאן התחברת]"
disable-model-invocation: true
---
# my-connected: I signed in, carry on

You asked Nadav for a step only he could do (a sign-in, a code from his phone, a click that connects an account or a tool), and he did it. He types this hundreds of times as one word ("מחובר", "התחברתי", "בוצע"), so the same sign-in must not come back to him.

What he connected, if he named it: $ARGUMENTS

1. Name what was waiting on him: which account or service, on which screen, and which step of the work stopped there. Take it from your recent replies, not from a guess. If two things were waiting and his words do not say which one he did, check both.
2. Check that the connection holds, with something that only works when it does: the page behind the sign-in, a request that needs the session, the tool's own status command. Do not go on because he said so, and do not ask him to try again without the evidence: when it does not hold, show what you see (the page, the exact error) and name the one thing that is still missing.
3. Go on from the step that stopped. First check what was already finished before the stop, so that nothing is done twice (`working-style.md`, Sessions): a send, a merge, a deploy, a deletion or a charge that shows as done is not repeated.
4. Keep the sign-in, so that the next time needs nothing from him (`acting-on-behalf.md`):
   - a browser sign-in is made in `agent-browser` with `--profile ~/.agent-browser/profiles/nadav`, where the session survives restarts;
   - the password of an account he already has goes into the vault through the dialog that `vault-login-add <name> <login-url> <username>` opens, where he types it once. Open it now if the item is missing and that site will ask again. Never read, print or type a password yourself;
   - where the service gives a key or a token, create it and save it in the vault (`~/.claude/secrets/<service>.env`) without printing it;
   - write in memory where this sign-in lives (the vault item, the profile), so that another session finds it instead of asking him.
5. Report in a few lines: what you checked and what it showed; what went on, and from which step; what you saved and where; and, when this same sign-in was already asked of him before, why it came back and what stops that now.

What still needs him is only what `acting-on-behalf.md` leaves to him (a code that reaches only his phone, a password only he knows, a bot check that failed twice). Ask for it with the screen already open and the one thing to do named.
