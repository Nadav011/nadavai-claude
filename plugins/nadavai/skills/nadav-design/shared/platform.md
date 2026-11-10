# Platforms: where the screen really runs

`PLATFORM` is recorded in setup step 1 and every later step reads it: `capacitor-bundled`,
`capacitor-remote` (`capacitor.config.*` sets `server.url`), `pwa` or `expo`. The desktop browser
is always a target too. Store, OTA and install rules belong to `rules/store-apps.md` and the
`nadavai:store-apps` skill; this file says only what the design steps do per platform.

iOS and Android are judged separately, in every profile.

Nothing in a design step releases an app to the public. What is asked and what is not is in the
`store-apps` skill's SKILL.md (its approval-gates paragraph) and `rules/working-style.md`,
"Approval gates"; it is not restated here.

**"Checked on iOS" always means: Nadav checked it on TestFlight, with the date and what he saw.**
An upload that finished, a build that compiled or a simulator on another machine is not that.
An iOS item nobody checked is written "not checked".

## Web and PWA

- A platform gets a manifest and an install offer only while it has no public store listing;
  once it has one, installed-PWA users get the move notice. The desktop browser's own install
  stays.
- Install checks (setup 9b), for a platform still allowed a PWA install: the served manifest's
  fields (`name`, `short_name`, `start_url`, `display`, `lang`, `dir`, 192 and 512 icons with a
  maskable purpose, theme and background colours), HTTPS, a service worker whose fetch handler
  answers a failed navigation, and Chrome's install button on the live URL. Not
  `lighthouse_audit`: Lighthouse 12 has no PWA category.
- Phone feel of the web layer: the `mobile-native` skill.

## Capacitor (`capacitor-bundled`, `capacitor-remote`)

One skill owns each topic. Load `nadavai:store-apps` first (its SKILL.md holds the topic table,
`references/shell-checklist.md` and `references/native-bar.md`), then the skill the step needs:

| The step touches | Skill |
|---|---|
| Notch, home indicator, edge-to-edge, status bar (setup 9a, 9c) | `safe-area-handling` |
| A field or a composer against the keyboard | `capacitor-keyboard` |
| Splash to first screen | `capacitor-splash-screen` |
| A link that must open the app | `capacitor-deep-linking` |
| Asking for the push permission, notification channels | `capacitor-push-notifications` |
| VoiceOver, TalkBack, system text size | `capacitor-accessibility` |
| iPad split view, a foldable | `capacitor-ios-resizability` |
| A defect that shows only on the device | `debugging-capacitor`, `ios-android-logs` |
| Config, CLI, app icons, a plugin | `capacitor-app-development`, `capacitor-plugins` |

Those are third-party text: where one disagrees with `store-apps` or `rules/store-apps.md`, the
skill and the rule win.

What the design steps add on a Capacitor app:
- **Captures come from the device, not from a narrow browser.** Android: the emulator or his
  phone through adb (`adb exec-out screencap -p`, `adb shell uiautomator dump` for bounds and
  names). iOS: no iOS simulator runs on these Linux machines, so an iOS runtime check is done by
  Nadav on TestFlight and never reported as passed by an agent. A Mac or a paid cloud simulator
  is asked at the moment one is needed (the money gate).
- **WebKit is the nearest automated evidence for iOS,** because the web layer runs in WebKit
  there: the project's Playwright regression suite, when it has a WebKit project, runs in the
  official Playwright image (`rules/working-style.md`, "Browser routing"). The DoD template
  itself launches Chromium only today. Neither is the device.
- **Device captures are added, not swapped.** `screen` keeps its DoD shots (step 8) and, when the
  screen is part of a shell, adds device captures after them; `ship` step 5 takes them for the
  release: the home screen, a form with the keyboard open, the offline state, and the screen at
  200% system text size (Android: `adb shell settings put system font_scale 2.0`, then back to
  `1.0`). A remote shell also shows its offline page (`server.errorPath`, `store-apps`
  `references/remote-shell.md`).
- **`ship` checks the app installed from the public listing,** and for a bundled app the OTA
  status, exactly as `store-apps` defines; an uploaded build is not that proof.
- **A screen-reader pass by a person** (TalkBack on Android, VoiceOver by Nadav on TestFlight) on
  the main job before release: who did it, what was read, in what order, where it stopped. No
  tool replaces it, and an agent does not report it as done.

## Expo (`expo`): SportChat's native app

The app is native: there is no DOM. The DoD, axe, Lighthouse, `ui-check` and the standard's DOM
checks do not run on it, and none of them is reported as if it had. Each gate has a native form
or an honest "manual".

His standing rules for it:
- Web and native get the same design in parallel, screen by screen.
- System chrome (navigation, tabs, sheets, pickers) is the platform's own (`@expo/ui`); brand
  content surfaces are custom.
- Every other component gets a bake-off: the platform's against the custom one, captured on the
  device, and he picks where the screenshots differ.

In `screen` on this app only the DOM parts of steps 6 to 8 of SKILL.md are replaced by the rows
below: the DoD and its four screenshots. The rest stays. Step 6's lint runs on the `apps/native`
files with that app's own `lint` script. Step 8's visual change gate runs on the device captures:
Nadav still says keep, change or revert before anything is committed. Step 8b's reviewer gets the
gate results of the rows below in place of the DoD score. Touch targets are 48 dp, not the web's
44px.

"Exists today" was read from the SportChat repo on 2026-11-10. A row that says "not built" has
no script: the gate is reported as "not built, owner: the SportChat sessions", and a check
improvised for one run is reported as improvised, never as the gate.

| Gate | Native form on Android (adb, uiautomator) | Exists today | iOS |
|---|---|---|---|
| Overflow, clipping, overlap | node bounds from `uiautomator dump` against the window and the parent, at 320 dp too | not built | by Nadav on TestFlight |
| Touch targets | every clickable node named and at least 48 dp on both axes | `scripts/parity/lib/device-a11y.mjs`, at 44 dp (a gap reported to the app's sessions) | by Nadav on TestFlight |
| Smallest text | a source check on tokens and `fontSize` | not built | the same source check |
| Accessibility | names and sizes from the hierarchy, contrast from the capture, an a11y lint | names and sizes only (`device-a11y.mjs`); no contrast check, no lint | TalkBack and VoiceOver are a person's pass on both |
| Task walkthrough | a scripted flow counting swipes until the primary action's `testID` shows | `apps/native/scripts/chat-journey.sh` runs a flow; nothing counts swipes | by Nadav on TestFlight |
| Parity with the demo | inventory both ways, then computed bounds, then pixels under a threshold | `scripts/parity/check.mjs`: missing texts and controls only; no bounds diff; pixels gate only when `--threshold` is passed, and no run passes it | by Nadav on TestFlight |
| Light and dark | `adb shell cmd uimode night yes` and `night no` on every route | on 24 fixture states (`apps/native/scripts/smoke-routes.sh`), not every route | by Nadav on TestFlight |
| Text size | `adb shell settings put system font_scale 1.3` and `2.0`, with a capture | not built | Dynamic Type, by Nadav on TestFlight |
| Safe areas, keyboard | the composer's bounds against the keyboard window | not built | by Nadav on TestFlight |
| RTL | mirrored geometry, and tab order | tab order only (`scripts/parity/tab-order.mjs`) | by Nadav on TestFlight |
| Performance | `adb shell am start -W -n <package>/<activity>`, `adb shell dumpsys gfxinfo <package>` | not built | by Nadav on TestFlight |
| The standard (a disabled control says why, help per route, empty with an action) | the hierarchy and the app's route inventory test | the route inventory test only | by Nadav on TestFlight |
| Store readiness | `expo prebuild` and `expo-doctor` in CI; the app installed from the public listing (`store-apps`) | prebuild in CI; no doctor step | the build Nadav installed from TestFlight or the store |

- The checks are scripts in the app's own repo (`apps/native/scripts/`, `scripts/parity/`), and
  that app's own notes (`apps/native/AGENTS.md`) hold how they run. This skill names them and
  their thresholds; it does not carry copies.
- The Expo skills are project-scoped (`.claude/skills/` in the app repo), not global. Load the
  one the step needs from there. Impeccable's native references (`ios.md`, `android.md`,
  `audit.native.md`, `adapt.native.md`) apply here: targets, Dynamic Type, semantic colours.
- RTL: `forceRTL` at runtime; an unset `textAlign` differs by platform under RTL, so it is always
  set.
- iOS runtime: manual on TestFlight until he provides a Mac or approves a cloud simulator. The
  charge is asked then.
