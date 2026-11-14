# An iPhone simulator on Xcode Cloud, driven by a script

What 18 lab runs on 2026-11-14 showed, on MediZen (therapy-flow-v2, branch `ci/ios-simulator-app`).
The full record, each run's log and the helper scripts are on the LENOVO in
`~/Documents/mobile-lab/ios/xcode-cloud/` (`REPORT.md`, `xc-run.sh`, `copy-qa-secret.sh`); the review of the
sign-in script is `~/Documents/mobile-lab/reviews/xc-signin-review-1.md`.

What it is for: a scripted check on real iOS with the element tree (open the app, read a screen as text, tap
by name, type, sign in to the QA account, take a screenshot). What it is not: a live screen. Every try is a
run of 4 to 7 minutes, so exploring an app by hand needs a Mac. It proves nothing about the
store build, push, Face ID, location or the camera (`rules/virtual-phones.md`).

Cost: Xcode Cloud's 25 compute hours a month come with the developer program; the 18 runs took 91 minutes
together (`asc xcode-cloud build-runs --workflow-id <id>` gives each run's start and finish; the
product's page in App Store Connect has a Usage link, not opened in the lab).

## How a run works

1. A workflow in the app's Xcode Cloud product with a manual start on the lab branch only and one build
   action (`asc xcode-cloud workflows create --file <json>`; MediZen's is "Lab probe (mobile-lab, not a
   release)"). Check with `asc xcode-cloud workflows view --id <id>` that no branch, tag, pull-request or
   schedule start is set.
2. On the lab branch, `ci_scripts/ci_post_clone.sh` beside the `.xcodeproj` does all the work and always
   ends with `exit 1`, so Xcode Cloud stops before building: nothing is archived or uploaded, and Apple
   marks the run failed. The lab branch never lands on main.
3. Start and read, from any machine:

```bash
export ASC_TIMEOUT=90s
asc xcode-cloud run --workflow-id <id> --branch <lab branch>        # prints the run id
asc xcode-cloud status --run-id <run id> --wait                      # run it again if the wait is cut
asc xcode-cloud artifacts list --run-id <run id>                     # the LOG_BUNDLE's id
asc xcode-cloud artifacts download --id <artifact id> --path logs.zip   # ci_post_clone.log is inside
```

4. A stopped build publishes only the script's log. Whatever has to be seen is printed by the script: an
   element tree as text, a screenshot as base64 between two marker lines. A script that handles a login
   prints a tree only after checking that it holds neither the password nor the email.

The machine (November 2026): macOS 27.2, Xcode 27.2, arm64, 12 cores, user `local`, no sudo, Homebrew,
no node. The script runs `brew install node@24` (about 40 s) and installs `agent-device` with
`NPM_CONFIG_PREFIX` set to a folder in the home directory. Every run starts from zero: about 30 s for the
simulator's boot and 40 s for `agent-device prepare`. The app is a simulator build kept on the lab branch
(`references/ios-simulator-build.md`), installed with `xcrun simctl install`.

## Traps of iOS 27 (each cost a run)

- **The folding iPhone.** Xcode 27.2 carries a second iOS 27.2 runtime built only for "iPhone Duo", and
  agent-device 0.21.36 cannot snapshot that device. Choose the phone model first (iPhone 18 Pro, 17 Pro,
  17), then the newest runtime that supports it.
- **Never `fill` a password box.** `fill` fails with TEXT_INPUT_NOT_FOCUSED and leaves the app's
  show-password switch on, so the box is a plain text box and the next snapshot prints what is typed.
  Press the box, check the tree shows `[securetextfield] … [focused]` and the button "הצג סיסמה", then
  `agent-device type "$PASS"`. `type` takes its text as an argument, so the script passes a shell
  variable and runs with `set +xv`.
- **The Hebrew keyboard lets only digits into a password box.** After the press, read the tree; while it
  has no `[key|button] "q"` (or has a "ש" key), press `[button] "המקלדת הבאה"` and read again, three times
  at most. Type only with the Latin keys on screen. Setting an English-only keyboard list with `defaults`
  reads back correctly and does not change the keyboard on screen: check the screen, not the setting.
- **Refuse a password the path cannot carry**: one that starts with `-` or `@`, or holds a character
  outside `A-Za-z0-9._@#%+=:,/!?-`. Every one of those characters arrived in a dry run.
- **The notifications question covers the first signed-in screen.** iOS shows "<app> מבקש לשלוח לך
  עדכונים" as the whole tree. Press "סירוב" (nothing is written to the server), then wait for a landmark
  of the app's own screen before reading anything.
- The page through the Web Inspector worked before a simulator restart and not after one. Pasting from the
  simulator's clipboard did not work.

## Signing in to the QA account there

Run 18 signed in to MediZen's isolated QA clinic and read its home screen, side menu and clients list.
The order that the reviewer approved, in `scripts/lab/ios-xc-signin.sh` on the lab branch:

1. A dry mode first: the same steps with a made-up login generated on the machine, the show-password
   switch pressed on purpose and the box compared with what was typed, the sign-in button never pressed.
   Run it again whenever the typing path changes.
2. The real mode: read the login, run the account guard (`qa-guard.mjs`: the account is the QA clinic and
   nothing else, no WhatsApp session able to send), fill the email, press the password box, hidden and
   focused, Latin keyboard, `type`, still hidden and the tree does not hold the password, press the
   sign-in button once and never again (MediZen raises a security alert at five failed passwords on one
   account in 15 minutes, `20261012191000_security_alerts.sql`),
   decline the notifications question, wait for the landmark, read, close the app, search the run's own
   files for the password.
3. After the run, search the downloaded log here for the password, the email and their base64, by count
   only, sourcing the vault file without printing it.
4. Put the branch back in the dry mode, so a run started by mistake signs in to nothing.

Each real run leaves one open session of the QA user on the server. The app's own sign-out is not used
where it ends the account's other sessions.

## A secret for a run

Only App Store Connect's page sets a workflow's environment variable (the API has no field for it): the
product, Manage Workflows, the workflow, Environment, Add, "Keep value redacted", Save. With
`agent-browser` the value went into the field as `fill @<ref> "$(wl-paste -n)"` after
`copy-qa-secret.sh` put it on the clipboard, so it was in no command text and no output; read back only
its length, clear the clipboard, and after "Add" check the page shows it as
asterisks before taking a snapshot. Nadav approved storing the QA clinic's test password there on 2026-11-14; a vault login of his never
goes there (`rules/virtual-phones.md`).

Apple's sign-in form sits in a cross-origin frame that `agent-browser auth login` and `frame` cannot
reach, and copies of his Chrome profiles arrive signed out. Open the page `--headed` in the kept profile
and let him sign in once; watch the URL leave `/login` and go on. The session did not survive closing the
browser on 2026-11-14, so do everything that needs the page before closing it.
