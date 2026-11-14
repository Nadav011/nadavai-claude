---
name: my-stores
description: "מה מצב האפליקציות בחנויות? טבלה של כל אפליקציה בכל חנות, ומה מחכה למי."
argument-hint: "[לא חובה: איזו אפליקציה. בלי כלום: כולן]"
disable-model-invocation: true
---
# my-stores: where every app stands in the stores

Nadav asks where his apps stand in the App Store and Google Play. In the sessions where he asked this he then had to ask about the rest («ובגוגל שניהם עלו ? בצורה מלאה ? ומה עם האחרות באפל ובגוגל ?»), name the apps one at a time, and write "מחובר" console by console after the session got stuck on a sign-in.

Which app, or all of them: $ARGUMENTS

1. Invoke the Skill tool with skill `nadavai:store-apps` and follow it; `store-apps.md` holds either way. This prompt sets the shape of the answer.
2. The first thing he sees is one table: every app of his against each store, with its state (live and which version, in review, rejected and why, not submitted) and whether the latest web deploy reached it (the update channel's status, or the live address serving the current commit). Every app in one pass, also when he named one. Read the state from the stores' own interfaces first, the consoles second.
3. Sign-ins: use what is already signed in before asking (the agent-browser profile, then a read-only copy of his own browser: `acting-on-behalf.md`). What only he can do is asked once, for all the consoles together, naming each site and account.
4. Under every row that is not final: the next step, who holds it (you, him, the store's review, a date), and when it should move. A paid item is explained in one line with its price and waits for his yes.
5. Move things forward only when his words ask for that. Then uploading a build and submitting it for review run without asking, with the release held; releasing to the public, widening a rollout and changing a listing or a price wait for him (`working-style.md`, Approval gates).
6. An app counts as moved to a store only after the copy installed from the public listing was checked (`store-apps.md`): say for each row whether that check was done.
