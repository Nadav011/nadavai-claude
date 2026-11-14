# START-BUILD · <App> redesign

Status: DRAFT

(The line above is a token the tools read; it changes only to `Status: OWNER-APPROVED answer <N> commit <sha>` after
Nadav approves the plan with AskUserQuestion. Nothing else goes on that line.)

> **לנדב:** את הטקסט שבמסגרת למטה מדביקים בסשן חדש של Claude Code בתוך הריפו של האפליקציה, ורק אחרי שאישרת את התוכנית
> (השורה למעלה אומרת `Status: OWNER-APPROVED` עם מספר התשובה שלך).
> הסשן הזה בונה את האפליקציה לפי התוכנית, שלב אחרי שלב, ועוצר אצלך בכל מקום שמסומן «go».

```
You are the build session for the <App> redesign. The approved package lives in <out> (its own git repo):
plan/build-plan.md (the units, in order), plan/START-BUILD-CHECKLIST.md (the pre-start gate), the demo
(<out>/<output>, published at <link>, approved as tag demo-approved-<date>), BRIEF.md, DECISIONS-ANSWERED.md,
FEATURES-PROPOSED.md, INVENTORY.md. The demo at that tag is read-only: a design change is made in the app's preview.

1. Check that this file's status line reads `Status: OWNER-APPROVED answer <N> commit <sha>`. Then run every item of
   <out>/plan/START-BUILD-CHECKLIST.md and show its result. Start nothing while an item fails.
2. Build the units in plan order; before each, re-read nadav-design's «An app is built once» in the installed skill
   (`shared/built-once.md`, in full),
   and land it as point 2 there says. Unit 1 is the app's preview on invented data, isolated and checked as
   `shared/built-once.md`, «An app is built once», point 5, says. Nobody plays the preview, on any machine, before its
   check script passes there; until then only you run it, to run the checks. Every later screen is designed and
   shown to Nadav in that preview, and no screen is built a second time. Each screen goes through
   the nadav-design `screen` mode gates: DoD 100 on every route the change touches, the visual change gate with the
   demo's phone for that label (or, for a screen the demo did not draw, today's screen) next to the screen in the
   preview at 375 and 1440, dark and light.
3. Never re-decide an answer. A question the package does not answer goes to Nadav with AskUserQuestion,
   recommendation first, and its answer is appended to DECISIONS-ANSWERED.md.
4. Anything marked `go` waits for Nadav's yes: it holds one of the five actions `rules/working-style.md`, Approval
   gates, keeps for him (money, a paid service included; a message or post in his name or a client's; a public store
   release; an official filing or signature; a deletion with no way back). A migration, an auth or permission change
   and payment code are engineering actions: they run after an independent review, with a tested way back and
   through the project's script, with a report after (that section and `~/nadavai/guides/production-change.md`).
5. Every unit ends with a reviewer that is not its author, chosen as `rules/working-style.md`, "Second model", says
   (a fresh Opus for auth, data or money), and a dated line in the app's STATUS.md. For a screen the tagged demo
   drew, that reviewer is the `screen` step 8b verifier, given that screen's phones at the tag, as that step says.
```

## The checklist (plan/START-BUILD-CHECKLIST.md)
Every item is a command or a file check with its expected result; the build session pastes the actual result next to it.

| # | Check | Command or file | Expected |
|---|---|---|---|
| 1 | Plan citations hold | `(cd "<out>" && python3 tools/check-anchors.py --config redesign.json)` | 0 missing, 0 wrong, 0 unknown screens, exit 0 |
| 2 | The package is the one Nadav approved | `git -C "<out>" log -1 --format=%H`, else `git -C "<out>" diff --stat <sha> HEAD` and `git -C "<out>" diff <sha> HEAD -- plan/build-plan.md START-BUILD.md` | HEAD is the <sha> of his approval (answer N), or the files changed since are only plan/build-plan.md, START-BUILD.md and DECISIONS-ANSWERED.md, and the line diff of the first two touches only the two `Status:` lines and the Units table's State cells |
| 3 | The app is where the plan assumed | `git -C <app> fetch && git -C <app> log -1 origin/main` | the base named in the plan, or a reviewed rebase |
| 4 | Today's screens are there for the visual gate | `ls "<out>/today/"` and redesign.json `today_missing` | one file per INVENTORY.md screen, or the screen in `today_missing` with its row in INVENTORY.md «Screens that could not be captured» |
| 5 | Every Nadav action the plan needs is done | «מה רק נדב עושה» | each row marked done |
| 6 | The approved demo is the tag the plan names | `git -C "<out>" rev-parse demo-approved-<date>^{commit}` and `git -C "<out>" diff --stat demo-approved-<date> HEAD -- sections css parts proto` | the commit the plan names, and no change to the page since the tag |
