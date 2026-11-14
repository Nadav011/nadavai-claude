---
name: virtual-phones
description: Run, see and operate an Android or iPhone app on Nadav's Linux machines without a physical phone - the Android SDK emulator driven with agent-device, the experimental x86sim iPhone simulator on the LENOVO, and scripted iPhone-simulator runs on Apple's Xcode Cloud. Use when a task needs an app opened on a phone image, a screen read or tapped, a customer flow walked through, a device feature simulated (SMS code, fingerprint, notification, deep link, offline, Hebrew system language), a simulator build of an iOS app, or when asked whether something can be checked without a phone or a Mac. Not for the web layer's phone feel (mobile-native) or store submission (store-apps).
---

# Virtual phones

What an agent can do on a phone image here. Everything below was run on 2026-11-13 and 14 against
MediZen 1.3.0 unless a line says otherwise; the evidence is in `~/Documents/mobile-lab/`
(`android/REPORT.md` and `android/commands.md`, `ios/x86sim-matrix-data.txt`, `ios/session-notes.md`,
`ios/ui-access.md`, `ios/xcode-cloud/REPORT.md`). The routing and the lines that always hold are in `rules/virtual-phones.md`.

| Need | Use | Reach |
|---|---|---|
| Android app: read the screen as text, tap by name, type Hebrew, device features | SDK emulator + `agent-device` | Almost every customer action (below) |
| A recorded, repeatable flow a repo already keeps | Maestro, as that repo runs it | Regression only; do not start new work in it |
| iPhone: real iOS rendering, the app's own screens, a flow walked by sight | x86sim on the LENOVO + a simulator build from Codemagic | Screenshots and taps; no element tree, push, Face ID, location, camera or offline |
| iPhone: a scripted check that reads the screen as text, taps by name and signs in | A run on Xcode Cloud + `agent-device` ([references/ios-xcode-cloud.md](references/ios-xcode-cloud.md)) | The element tree, typing, screenshots; each try is a 4 to 7 minute run, with no live screen |
| The store build on a real device, real push, the camera, a weak or Samsung phone | A physical phone (and a Mac for iPhone) | Not available here: say so, do not substitute |

Check only what the task's platform needs: an Android task needs `~/Android/Sdk` on the machine it
runs on, an x86sim task needs `getent passwd x86simbox` to print a line. When that one is missing,
say so and stop (the MSI has the SDK and no `x86simbox` user, and Android work runs there).

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
  same AVD is refused with "use your own AVD". The MSI holds the lab's `claude-probe` (Android 16)
  and `claude-probe-37` (Android 17), in Hebrew with MediZen 1.3.0, and `claude-probe-play`
  (Android 17 with Play and the lab's Google account: Play updates its WebView and installs apps
  from public listings; spend nothing there). The LENOVO holds `claude-probe` as the
  fallback. Create your own on the MSI with the `avdmanager` line of `references/android-by-hand.md` through `ssh msi bash -s`.
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

## iPhone without a Mac (x86sim, LENOVO only)

x86sim (github.com/x86sim/x86sim, a project a few weeks old in November 2026) runs Apple's own iOS 27 simulator
runtime on Linux by translating it. It is installed for the Linux user `x86simbox`, which cannot
read Nadav's home. That user limits what the code can read, not what it can reach: its code was
not fully audited and the device shares the host's network, so the host's `127.0.0.1` services are
reachable from inside it. Run it only as that user, never as `nadavcohen`, never run its scripts
or binaries with root, and never take the host's network down to simulate offline.

There is one device ("Main phone") for the whole machine, so it is used under a lock that any
agent on the machine can take and see. `scripts/x86sim-lock.sh` is the only way to take it:

```bash
scripts/x86sim-lock.sh take "$PPID" "<your session name>"   # exit 0: yours. exit 1: not yours (a live holder, or "try again")
scripts/x86sim-lock.sh show
scripts/x86sim-lock.sh release "$PPID"                       # when you are done
```

- The first argument is the long-lived agent process, so another session can tell a dead holder
  from a live one. In Claude Code, `$PPID` in a tool's shell is that process (checked 2026-11-13);
  in another agent, check what `$PPID` is before relying on it.
- A lock whose holder is dead is taken over by `take` itself, with one winner (twenty concurrent
  takers were tried on a free lock and on a dead holder's lock: one won each time). Do not remove
  the lock directory by hand, with one exception: a `take` or a `release` that was killed half-way
  can leave a lock with no live holder that `take` keeps refusing ("try again") for more than a
  minute. Then, after `show` and `kill -0` confirm that no live process is named in it, remove
  `owner`, the `takeover` directory and the lock directory, and take it again.
- While another live session holds the lock, run nothing on the device except `aot sim status` and
  `x86sim screenshot`: no `install`, `launch`, `tap`, `type`, `home`, `openurl`, `log stream`,
  start, stop or restart. Ask that session or wait.

```bash
SB=$(getent passwd x86simbox | cut -d: -f6)       # the sandbox user's home
X="sudo -n -u x86simbox $SB/xs.sh"
cd /tmp                                            # a directory that user can enter
$X aot sim status                                  # "Main phone  iPhone 17  iOS 27.2  running ... home"
$X aot sim start                                   # 1 to 3 minutes; the first boot ever took 9
$X x86sim screenshot "$SB/s.png"                   # then: sudo cp to your scratchpad, chown, Read it
$X x86sim tap <x> <y>                              # device pixels, the screen is 1206x2622
$X x86sim type "latin text"; $X x86sim home; $X x86sim openurl <url>
$X x86sim install "$SB/apps/<dir>/App.app"
$X x86sim launch <bundle id>; $X x86sim listapps
$X x86sim io recordVideo --secs 10 "$SB/v.mp4"
$X x86sim log stream --app <bundle id>             # relaunches the app and never ends: timeout, to a file
```

- It installs arm64 iOS-simulator builds. An app whose main executable is universal (x86_64 and
  arm64) crashed at launch with "dyld_sim is not compatible with the loaded process"; after
  `llvm-lipo -thin arm64` on the main executable it ran.
- After every install the first launch waits one to two minutes while a code map is rebuilt, and
  `launch` prints "no reply in 30 s" although the app starts. Wait and take a screenshot; do not
  relaunch.
- Reading is by screenshot only (0.5 to 3 seconds each). WebDriverAgent and Safari Web Inspector do
  not start: launchd cannot create their sockets under x86sim's system layer.
- The first tap after a cold start can scroll instead of focusing; tap again. After "@", Shift
  stayed down ("example.com" came out "EXAMPLE>COM").
- Hebrew typing: `type` takes Latin only. With the Hebrew keyboard added (below), Ctrl+Space
  switches to it (`x86sim raw "key down 224" "key down 44" "key up 44" "key up 224"`), and typing
  the Latin keys of the Hebrew layout gives Hebrew (`type "akuo"` gives "שלום").
- System language, the Hebrew keyboard, dark mode and text size are set in the device's preference
  files while the device is stopped, then a restart. The script that did it and restores it is
  `tools/prefs.py` in the sandbox user's home (`prefs.py he [dark] [xxl]`, `prefs.py restore`).
- A universal link (`openurl https://<the app's site>/...`) opens Safari, never the app: the device
  runs no association daemon, and an ad-hoc build's app id is `FAKETEAMID.<bundle id>`. The app's
  custom scheme (`openurl <bundle id>://...`) opens it.
- `push` was refused ("Source is not authorized") while the app had not asked for notification
  permission; a banner was never shown. `location set` is silent and a page's location request never
  answers. No Face ID, no camera, no offline switch, no rotate command, no App Store or TestFlight.
- Backgrounding for a few seconds kept the app and its typed text; after about 16 seconds it was
  killed and came back with an empty form.
- With no offline switch, every press on a form's button here reaches the live server
  (`rules/virtual-phones.md`).
- To show the phone to Nadav without giving that user his screen or clipboard: an `Xvnc` display for
  `x86simbox`, `x86sim view` on it, and `vncviewer` with clipboard sync off in his session. The
  three commands are in `~/Documents/mobile-lab/ios/session-notes.md`.

## iPhone on Xcode Cloud (scripted, any machine)

Apple's build machines (25 free hours a month in the developer program) boot a real iOS simulator,
and `agent-device` drives the app there with the element tree x86sim lacks. A run is a script on a
lab branch that Xcode Cloud starts and that stops before anything is built; the script's log is the
only thing that comes back, so it prints the trees and pictures it wants seen. Started and read
with `asc` from any machine. The working example (therapy-flow-v2, branch `ci/ios-simulator-app`),
the traps of iOS 27 (the folding iPhone, the password box, the Hebrew keyboard, the notifications
question) and how a secret reaches a run: [references/ios-xcode-cloud.md](references/ios-xcode-cloud.md).

### A simulator build of the app

Only Xcode makes one, so it comes from Codemagic: a workflow that builds `Release` for
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
