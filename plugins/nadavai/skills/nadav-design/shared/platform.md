# Platforms: where the screen really runs

`PLATFORM` is recorded in setup step 1 and every later step reads it: `capacitor-bundled`,
`capacitor-remote` (`capacitor.config.*` sets `server.url`), `pwa` or `expo`. The desktop browser
is always a target too. Store, OTA and install rules belong to `rules/store-apps.md` and the
`nadavai:store-apps` skill; this file says only what the design steps do per platform.

iOS and Android are judged separately, in every profile.

Nothing in a design step releases an app: a public store release (a build, a rollout raise, a first
listing, a change to a live listing) is Nadav's decision, asked at that moment
(`rules/working-style.md`, "Approval gates").

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
  names). iOS: by hand on TestFlight; no iOS simulator runs on these Linux machines, so an iOS
  runtime check is written as "manual, on TestFlight, by Nadav" and never as passed. A Mac or a
  paid cloud simulator is asked at the moment one is needed (the money gate).
- **The DoD in WebKit.** The web layer runs in WebKit on iOS, so the DoD's WebKit project is the
  nearest automated evidence: it runs in the official Playwright image
  (`rules/working-style.md`, "Browser routing"). It is not the device.
- **`screen` step 8 and `ship` step 5 on the device:** the home screen, a form with the keyboard
  open, the offline state, and the screen at 200% system text size (Android: `adb shell settings
  put system font_scale 2.0`, then back to `1.0`). A remote shell also shows its offline page
  (`server.errorPath`, `store-apps` `references/remote-shell.md`).
- **`ship` checks the app installed from the public listing,** and for a bundled app the OTA
  status, exactly as `store-apps` defines; an uploaded build is not that proof.
- **A manual screen-reader pass** (TalkBack, VoiceOver) on the main job before release: what was
  read, in what order, where it stopped. No tool replaces it.

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

| Gate | Native form on Android (adb, uiautomator) | iOS |
|---|---|---|
| Overflow, clipping, overlap | node bounds from `uiautomator dump` against the window and the parent, at 320 dp too | manual |
| Touch targets | every clickable node named and at least 48 dp on both axes (the app's `scripts/parity/lib/device-a11y.mjs`; it checks 44 dp today, a gap reported to the app's sessions) | manual |
| Smallest text | a source check on tokens and `fontSize` | same check |
| Accessibility | names and sizes from the hierarchy, contrast from the capture, an a11y lint | TalkBack and VoiceOver are manual on both |
| Task walkthrough | a scripted flow counting swipes until the primary action's `testID` shows (on the app's journey script) | manual |
| Parity with the demo | `scripts/parity/check.mjs`: inventory, then computed bounds, then pixels | manual |
| Light and dark | `adb shell cmd uimode night yes|no` on every route | manual |
| Text size | `font_scale` 1.3 and 2.0 with a capture | Dynamic Type, manual |
| Safe areas, keyboard | the composer's bounds against the keyboard window | manual |
| RTL | mirrored geometry, tab order (`scripts/parity/tab-order.mjs`) | manual |
| Performance | `adb shell am start -W`, `dumpsys gfxinfo` | manual |
| The standard (a disabled control says why, help per route, empty with an action) | the hierarchy and the app's route inventory test | manual |
| Store readiness | prebuild and doctor in CI; the app installed from the public listing (`store-apps`) | TestFlight |

- The checks are scripts in the app's own repo (`apps/native/scripts/`, `scripts/parity/`). This
  skill names them and their thresholds; it does not carry copies. A gate whose script does not
  exist yet is reported as "not built", with its owner, never as passed.
- The Expo skills are project-scoped (`.claude/skills/` in the app repo), not global. Load the
  one the step needs from there. Impeccable's native references (`ios.md`, `android.md`,
  `audit.native.md`, `adapt.native.md`) apply here: targets, Dynamic Type, semantic colours.
- RTL: `forceRTL` at runtime; an unset `textAlign` differs by platform under RTL, so it is always
  set.
- iOS runtime: manual on TestFlight until he provides a Mac or approves a cloud simulator. The
  charge is asked then.
