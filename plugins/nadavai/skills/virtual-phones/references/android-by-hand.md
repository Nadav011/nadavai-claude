# Android by hand: an AVD, a start on one machine, installing a build

Moved out of SKILL.md; `scripts/lab-emulator.sh` is the usual way to start an emulator, and this
is what it does not cover. Run on 2026-11-13 and 14 (`~/Documents/mobile-lab/android/commands.md`).

By hand, on one machine:

```bash
~/Android/Sdk/emulator/emulator -list-avds     # these may be other sessions' AVDs
adb devices                                    # ports already in use
echo no | avdmanager create avd -n <your own name> -k "system-images;android-36;google_apis;x86_64" -d pixel_7
heavy-slot -- true
~/Android/Sdk/emulator/emulator -avd <name> -port <free even port> \
  -no-window -no-snapshot -no-audio -no-boot-anim -feature -Vulkan   # in the background, outside heavy-slot; host Vulkan hung it once
adb -s emulator-<port> wait-for-device         # then getprop sys.boot_completed = 1
adb -s emulator-<port> emu kill                # as soon as the work ends
```

- Name the AVD for your task, pick an even port no line of `adb devices` uses, and write both
  where a later turn finds them.
- `heavy-slot -- true` only gates the start: beyond the machine's first always-admitted places it
  waits while the machine is under pressure. The
  emulator itself runs outside it, because a process inside `heavy-slot` holds one of the machine's
  always-admitted places for as long as it lives (`machine-load.md`). Stop it the moment the work
  ends.
- After `avdmanager`, confirm the AVD is in `emulator -list-avds`.
- Two images, two uses. `google_apis` is a userdebug build: `adb root` works, the language can be
  changed, and MediZen's WebView exposed its DevTools socket. `google_apis_playstore` is built like
  a retail phone: Play Store, no root, no DevTools socket for a release app.
- A release `.aab` becomes installable with
  `heavy-slot -- bundletool build-apks --mode=universal --bundle=app.aab --output=app.apks --ks=$HOME/.android/debug.keystore --ks-key-alias=androiddebugkey --ks-pass=pass:android --key-pass=pass:android --overwrite`,
  then `unzip -o -q app.apks universal.apk` and `adb install universal.apk`. Read the package id with
  `~/Android/Sdk/build-tools/<version>/aapt2 dump badging universal.apk`. Copy the `.aab` out of another
  session's worktree; never build or write there.
- That APK is re-signed, so Android does not verify its app links (`pm get-app-links <package>` shows
  state 1024) and a bare link opens Chrome. Open a link with an explicit package
  (`adb shell am start -W -a android.intent.action.VIEW -d "<url>" <package>`), or allow the host with
  `adb shell pm set-app-links-user-selection --user 0 --package <package> true <host>`.
