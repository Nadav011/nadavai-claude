---
name: my-connected
description: "התחברתי: בדיקה שהחיבור עובד, המשך מאיפה שנעצר, ושמירה שלא אתבקש שוב."
argument-hint: "[לא חובה: לאן התחברת]"
disable-model-invocation: true
---
# my-connected: I signed in, carry on

You asked Nadav for a step only he could do (a sign-in, a code from his phone, a click that connects an account or a tool), and he did it. He types this hundreds of times as one word ("מחובר", "התחברתי", "בוצע"), so the same sign-in must not come back to him.

What he connected, if he named it: $ARGUMENTS

1. Name what was waiting on him: which account or service, on which screen, and which step of the work stopped there. Take it from your recent replies, not from a guess. If two things were waiting and his words do not say which one he did, check both.
2. Check that the connection holds, with something that only works when it does: the page behind the sign-in, a request that needs the session, the tool's own status command. Do not go on because he said so, and do not ask him to try again without the evidence. When it does not hold, first try what needs nothing from him: the vault login (`agent-browser auth login <name> --credential-provider vault --item <name>`) when the item exists, or the tool's own refresh. When that fails too, show what you see (the page, the exact error) and name the one thing that is still missing.
3. Go on from the step that stopped. First check what was already finished before the stop, so that nothing is done twice (`working-style.md`, Sessions): a send, a merge, a deploy, a deletion or a charge that shows as done is not repeated.
4. Keep the sign-in where it was made, so that the next time needs nothing from him (`acting-on-behalf.md`). Ask him for nothing more at this point:
   - a sign-in made in `agent-browser` stays in its profile (`--profile ~/.agent-browser/profiles/nadav`), which survives restarts;
   - a command-line tool keeps its own session: check where, and until when, with the tool's own status command;
   - a sign-in he made in his own Chrome is read through `agent-browser --profile Default`, which takes a read-only copy of it;
   - create a key or a token only when the tool keeps no session of its own, and only by a path that writes it straight to the vault file (`~/.claude/secrets/<service>.env`), never to the output;
   - a password is not asked for now. When that site will ask again and its item is missing from the vault, say so in one line of the report, with the `vault-login-add <name> <login-url> <username>` command whose dialog takes the password from him once; open that dialog when he says so, or when a sign-in is next needed. Never read, print or type a password yourself;
   - write in memory where this sign-in lives (the profile, the tool's own store, the vault item), so that another session finds it instead of asking him.
5. Report in a few lines: what you checked and what it showed; what went on, and from which step; what keeps this sign-in from coming back to him (what you saved and where, or that the tool keeps its own session and until when); and, when this same sign-in was already asked of him before, why it came back and what stops that now.

Besides the approval gates (`working-style.md`), what still needs him is only what `acting-on-behalf.md` leaves to him: a code that reaches only his phone, the password of an account he already has, and a bot check that failed twice or that you could not attempt. Ask for it at the moment it is needed, with the screen already open and the one thing to do named.
