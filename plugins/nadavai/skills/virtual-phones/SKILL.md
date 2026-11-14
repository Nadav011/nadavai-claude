---
name: virtual-phones
description: Run, see and operate an Android or iPhone app on Nadav's Linux machines without a physical phone - the Android SDK emulator driven with agent-device, and scripted iPhone-simulator runs on Apple's Xcode Cloud. Use when a task needs an app opened on a phone image, a screen read or tapped, a customer flow walked through, a device feature simulated (SMS code, fingerprint, notification, deep link, offline, Hebrew system language), a simulator build of an iOS app, or when asked whether something can be checked without a phone or a Mac. Not for the web layer's phone feel (mobile-native) or store submission (store-apps).
---

# Virtual phones

What an agent can do on a phone image here. Everything below was run on 2026-11-13 and 14 against
MediZen 1.3.0 unless a line says otherwise; the evidence is in `~/Documents/mobile-lab/`
(`android/REPORT.md` and `android/commands.md`, `ios/xcode-cloud/REPORT.md`). The routing and the lines that always hold are in `rules/virtual-phones.md`.

| Need | Use | Reach |
|---|---|---|
| Android app: read the screen as text, tap by name, type Hebrew, device features | SDK emulator + `agent-device` | Almost every customer action (below) |
| A recorded, repeatable flow a repo already keeps | Maestro, as that repo runs it | Regression only; do not start new work in it |
| iPhone: a scripted check that reads the screen as text, taps by name and signs in | A run on Xcode Cloud + `agent-device` ([references/ios-xcode-cloud.md](references/ios-xcode-cloud.md)) | The element tree, typing, screenshots; each try is a 4 to 7 minute run, with no live screen |
| A live iPhone screen to explore by hand, the store build on a real device, real push, the camera, a weak or Samsung phone | A physical phone (and a Mac for iPhone) | Not available here: say so, do not substitute |

An Android task needs `~/Android/Sdk` on the machine it runs on; when it is missing, say so and
stop. An iPhone run needs only `asc` and the lab branch, on any machine.

Why agent-device: on the same MediZen flow it took about 11 seconds, Maestro 33 and mobile-mcp 21.
It types Hebrew, addresses WebView elements by ref or selector, and answers each action with a
short diff. Maestro also typed Hebrew and found elements by text, at three times the time and with
a 272,000-character hierarchy. mobile-mcp refused Hebrew and works by coordinates.

## Android

### Start your own emulator

```bash
scripts/lab-emulator.sh where --avd <name>            # both machines' load and the choice
scripts/lab-emulator.sh start --avd <name> --port <free even port, 5554..5584> [--locale he-IL]   # Bash timeout 600000
scripts/lab-emulator.sh status --port <port>          # `reconnect` reopens a dead tunnel
scripts/lab-emulator.sh emu --port <port> -- sms send 0501234567 "<text>"     # a console command
scripts/lab-emulator.sh stop --port <port>            # as soon as the work ends
```

- The emulator usually runs on the MSI and is seen on this machine as `emulator-<port>`, so `adb`,
  `agent-device` and the WebView forward work unchanged (Nadav, 2026-11-14). The launcher measures
  both machines on every start and picks the MSI unless it is
  unreachable, has no such AVD, has under 6 GB of memory available, or is over one load per core
  while this machine is clearly lighter (a CI landing there can do that); `--on msi|here` overrides.
  On the MSI it waits on that machine's `heavy-slot -- true` and runs the emulator as the systemd
  user unit `lab-emulator-<port>`, at low CPU and IO weight and for at most four hours, because that
  machine runs CI; one ssh tunnel carries its ports, and `stop` ends both.
- An AVD has to exist on the machine that runs it, and runs once at a time: a second start of the
  same AVD is refused with "use your own AVD". The MSI holds the lab's `claude-probe-37`
  (Android 17, in Hebrew with MediZen 1.3.0) and `claude-probe-play`
  (Android 17 with Play and the lab's Google account: Play updates its WebView and installs apps
  from public listings; spend nothing there). The LENOVO holds `claude-probe` (Android 16, the
  old WebView below) only as the fallback for when the MSI is off. Create your own on the MSI with the `avdmanager` line of `references/android-by-hand.md` through `ssh msi bash -s`.
- Prefer an Android 17 image when the question is how a screen behaves. An emulator image's WebView
  never updates itself: the Android 16 image has WebView 133 (February 2025), the Android 17 image
  has 145, the Play device had 157 and phones 158 on 2026-11-14. On 133 MediZen's side menu was
  missing from the accessibility tree; on 145 it is there. Read the version with
  `adb -s emulator-<port> shell dumpsys webviewupdate` and name it in a visual or accessibility finding.
- The console's auth token differs per machine, so `adb ... emu` typed here fails for an emulator
  on the MSI: send console commands with `lab-emulator.sh emu`, and stop with `stop`.

Starting one by hand on one machine, creating an AVD, the two image kinds, installing a release
`.aab` and opening links in a re-signed APK: [references/android-by-hand.md](references/android-by-hand.md).

### Drive it with agent-device

`agent-device` is a global npm package (`npm-globals.txt`; `./update.sh --npm` installs it). Its
sessions are scoped to the working directory.

```bash
agent-device devices --platform android
agent-device open <package or URL> --platform android --device <avd name> --foreground   # prints a snapshot
agent-device snapshot -i                          # the screen as text: @e11 [button] "הצג סיסמה"
agent-device press @e11~s785075 --settle          # returns a diff of what changed
agent-device fill 'id="email"' "name@example.invalid"
agent-device fill @e8 "שלום" --settle             # Hebrew and Latin
agent-device press 'role=button text="הצג סיסמה"' --settle
agent-device settings airplane on                 # and: off
agent-device screenshot /path/shot.png
agent-device close
```

- If it answers that the device is held by another session (`DEVICE_IN_USE`), the device is not
  yours. Do not run the `close --session` it suggests for that session; use your own emulator.
- The first read after a cold start can return an empty WebView. Read again after two seconds
  before deciding the screen is blank (seen with agent-device, uiautomator and mobile-mcp alike).
- A target is a ref from the last snapshot, a selector (`'id="email"'`, `'text="בסדר"'`,
  `'label="..."'`, `'role=button text="..."'`) or an `"x y"` point. A ref printed with a pin
  (`@e14~s785075`) must be passed with it; without it the answer is "Ref @e14 needs a complete
  snapshot" and a hint with the exact ref.
- A press on a button that sends a form (sign in, register, book) reaches the live server. When
  the press should not be sent, run the three offline checks below first. A payment button is the
  money gate.
- `open --relaunch` prints no snapshot; run `snapshot -i` after it.
- The snapshot of a login screen is under 1,000 characters. Work from the snapshot and the diff,
  and take a screenshot for evidence.

### Device features (emulator console and adb)

`$D` is `adb -s emulator-<port>`. The exact lines as they were run are in
`~/Documents/mobile-lab/android/commands.md`.
For an emulator the launcher started on the MSI, a `$D emu <command>` line below is sent as
`scripts/lab-emulator.sh emu --port <port> -- <command>`.

| Feature | Command |
|---|---|
| Incoming SMS code | `$D emu sms send 0501234567 "<text>"`, then read the shade. Airplane mode must be off: with it on the radio is off and nothing arrives |
| Notification shade | `$D shell cmd statusbar expand-notifications`, `$D shell cmd statusbar collapse` |
| A test notification | With adbd as root: `$D shell "su shell cmd notification post -S bigtext -t '<title>' <tag> '<text>'"`. Without `su shell` it prints "posting:" and nothing appears. It cannot carry a tap action (`-c activity` is refused), so "tap opens the app" needs a real push |
| Fingerprint | `$D shell locksettings set-pin 1111`; `$D shell am start -a android.settings.FINGERPRINT_ENROLL`; type the PIN (`$D shell input text 1111; $D shell input keyevent ENTER`); walk the intro screens with agent-device; then twelve rounds of `$D emu finger touch 1; sleep 0.7; $D emu finger remove 1; sleep 0.7`. Afterwards one touch and remove answers an app's biometric prompt |
| Hebrew system language (google_apis image) | `$D root; $D wait-for-device; $D shell setprop persist.sys.locale he-IL; $D shell setprop ctl.restart zygote`, wait for `sys.boot_completed`, check `$D shell am get-config` holds `he-rIL-ldrtl` |
| Dark mode | `$D shell cmd uimode night yes` (and `no`) |
| Font scale | `$D shell settings put system font_scale 1.3`, then force-stop and start the app; reset with `1.0` |
| Slow network | `$D emu network speed gsm; $D emu network delay umts; $D emu network status`; reset with `speed full` and `delay none` |
| Location | `$D emu geo fix <lon> <lat>` (accepted; delivery to an app was not shown) |
| Screen recording | `$D shell screenrecord --time-limit 7 /sdcard/x.mp4` in the foreground, then `$D pull`. A recording pulled while still running is a broken file |
| Logs and a crash | `$D logcat -c`, then `$D shell am crash <package>` and `$D logcat -d` |
| The page inside a WebView (google_apis image) | `$D forward tcp:<free local port> localabstract:webview_devtools_remote_$($D shell pidof <package>)`, then `node scripts/webview-eval.mjs <port> "document.title"`. Pick your own port, forward again after every relaunch (a stale forward fails with "fetch failed"), and `$D forward --remove tcp:<port>` at the end. Read with it; never call the app's backend through it |

### A live app: signing in and sending forms

A live app is used here like anywhere else: forms are sent and signed-in screens are checked
(`rules/virtual-phones.md`), with the app's QA account first and a real user's account when the
task needs it (`rules/acting-on-behalf.md`).

A snapshot, and the diff `--settle` prints, show a password field's content in clear text, which
lands in the transcript (checked with a made-up value,
`~/Documents/mobile-lab/android/commands.md`). So a vault login of Nadav's is never typed into a
phone image. Two ways in:

- The QA account's own test password, typed from a local secrets file by variable name and
  submitted by the same script, with no snapshot and no `--settle` between typing and sending.
  Run end to end on MediZen's isolated QA clinic on 2026-11-14, after a guard that proves which
  account it is. Android: `fill 'id="password"' --text-stdin`
  (`~/Documents/mobile-lab/android/tools/qa-signin.sh`). iPhone: never `fill` a password box
  (it turns the app's show-password switch on); press it, check it is hidden and focused, bring
  the Latin keyboard up, then `type` (`references/ios-xcode-cloud.md`).
- A password-free sign-in link for the account, when the app's sign-in accepts one (not run here
  yet). The link opens the account like a password, so it is never printed or pasted into a
  command: the command that makes it pipes it straight into `$D shell am start -a
  android.intent.action.VIEW -d "$(cat)"`, and nothing else of its output is shown.

To press a form's button without sending it, go offline first and see all three:

1. `agent-device settings airplane on`, wait three seconds, `$D shell settings get global airplane_mode_on` prints 1.
2. `$D shell ping -c1 -W2 1.1.1.1` prints "Network is unreachable".
3. `navigator.onLine` read through the WebView is `false`.

If any of the three does not show offline, or a check cannot be run, do not press.

A device with a PIN lock fails `open` with "Failed to launch <package>": wake and unlock it first
(`$D shell input keyevent KEYCODE_WAKEUP; $D shell input keyevent 82; $D shell input text <pin>; $D shell input keyevent ENTER`).

### What the emulator does not give

A Play Integrity "genuine device" verdict (empty on an emulator, from Google's documentation), real
camera images (the scene is synthetic), behaviour on a weak or vendor-skinned phone, and install
from the public listing without a Google sign-in. Real FCM push was not tested; Google documents it
as working on a Google APIs image, and it needs a signed-in test account and a backend send.

## iPhone on Xcode Cloud (scripted, any machine)

Apple's build machines (25 free hours a month in the developer program) boot a real iOS simulator,
and `agent-device` drives the app there with the element tree. A run is a script on a
lab branch that Xcode Cloud starts and that stops before anything is built; the script's log is the
only thing that comes back, so it prints the trees and pictures it wants seen. Started and read
with `asc` from any machine. The working example (therapy-flow-v2, branch `ci/ios-simulator-app`),
the traps of iOS 27 (the folding iPhone, the password box, the Hebrew keyboard, the notifications
question) and how a secret reaches a run: [references/ios-xcode-cloud.md](references/ios-xcode-cloud.md).

There is no iPhone simulator on these machines any more: x86sim, which ran on the LENOVO and gave
screenshots and taps only, was removed on 2026-11-14 (Nadav picked "למחוק"), and an agent does not
install it again. What it showed is kept in `~/Documents/mobile-lab/ios/` (`session-notes.md`,
`ui-access.md`).

### A simulator build of the app

The Xcode Cloud lab installs a simulator build kept on its lab branch. Only Xcode makes one, and
this one came from Codemagic: a workflow that builds `Release` for
`-sdk iphonesimulator` with `ARCHS=arm64` and ad-hoc signing, and keeps `App.app` as an artifact.
The working example is therapy-flow-v2, branch `ci/ios-simulator-app`, workflow
`medizen-ios-simulator`; [references/ios-simulator-build.md](references/ios-simulator-build.md) has
the step and what is known about each flag. A build uses the account's free macOS minutes, which
the store builds share and get first: before a build, read the account and apply the Codemagic
line of `rules/virtual-phones.md` (the steps are in the reference).

## What still needs a Mac or a phone

A live iPhone screen with the element tree and Web Inspector (Xcode Cloud gives them only inside a
scripted run), simulated push, location and Face ID, network
conditioning, and (with an iPhone attached) the real TestFlight or store build with real push and
the camera. vphone-linux, a full virtual iPhone, was read and not installed
(`~/Documents/mobile-lab/ios/vphone-feasibility.md`): creating it peaks at roughly 75 to 95 GB,
loads a kernel module as root, and its cleanup includes a reboot. That it would install a store IPA
and expose an element tree is read from its code, not tried.
