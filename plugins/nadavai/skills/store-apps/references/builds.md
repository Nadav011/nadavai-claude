# Store builds

Reference: therapy-flow-v2 `planning/native-apps-2026-11-06/IOS-BUILD.md` (Codemagic: the account,
variable groups, signing, how to start and read a run) and SHELLS.md section 3 (local Android
builds). Store uploads are a publishing step: ask Nadav before each upload.

## Version and build numbers

| Platform | Build number | Why |
|---|---|---|
| iOS | UTC `YYYYMMDDHHMM`, written into `project.pbxproj` on the build machine only. The marketing version moves up whenever the previous one is `READY_FOR_SALE` (its train is closed). | Apple refuses a build number it has seen on that version, and a closed train takes no new builds. |
| Android | HEAD's committer time in whole minutes since the Unix epoch, read by Gradle; `-PversionCode=<n>` only for a re-upload. This is MediZen's `native/medizen/android/app/build.gradle`. RetroBarber's `android/app/build.gradle` still has a hand-raised `versionCode 1`: move it to the same scheme before its second upload. | It rises with every commit, is identical for every build of one commit, and is far above a TWA's `1`. Play refuses any code it has seen. |

The numbers only ever go up, on every track, because the minimum-build gates compare against them.

## iOS on Codemagic (no Mac needed)

- Free personal tier: 500 minutes a month on `mac_mini_m2`; a full run takes about 6 minutes.
  No `triggering` section, so a build starts only from the API or the UI, never on push. Repo
  access is a read-only deploy key on that one repo. Any paid tier is a new money question.
- Signing reuses the team's existing distribution certificate: `app-store-connect
  fetch-signing-files <bundle> --type IOS_APP_STORE --create` creates only a profile, and only
  when one is missing. A new App ID capability (push) invalidates the old profiles, so the next
  run makes new ones.
- Upload with `submit_to_testflight: false` and `submit_to_app_store: false`: the build reaches
  internal testers only, and submission stays a separate, API-driven step (store-apis.md).
- Start a run, then wait in slices (`rules/model-routing.md`): one status read every ~2 minutes.
  Then wait for the build to show `VALID` in App Store Connect (5 to 30 minutes).

Traps already paid for on 7.11 (each cost a failed run):

| Trap | Fix |
|---|---|
| `tsc -b` ran out of memory at Node's default heap on the 8 GB machine. | `NODE_OPTIONS=--max-old-space-size=6144`. |
| The Mac's disk is case-insensitive: two paths differing only in case broke the clone. | Rename, and keep a guard test that fails on any case-only collision. |
| The build-number `sed` and `use-profiles` edit `project.pbxproj`, a fingerprint input. | Bake the OTA runtime right after `cap sync` on the clean tree, pass `OTA_RUNTIME` through `--archive-xcargs`, and restore `project.pbxproj` before reading the runtime back from the IPA. |

## Android locally

JDK 21 and the Android SDK, run through `heavy-slot --` (`rules/machine-load.md`). The signed-AAB
script of the reference repo refuses a keystore whose certificate is not the upload key. It runs
the web build, `cap sync`, the bake, `bundleRelease`, then `jarsigner`, `bundletool validate`,
`aapt2` checks (package, versionCode, not debuggable, no `AD_ID`), the runtime read back from the
universal APK, and the bundle check. Upload with `scripts/play.mjs` (store-apis.md).

## Native change or web change

| Change | What ships it |
|---|---|
| Web code only (no fingerprint input touched; for a remote shell, anything outside the native project) | The next web deploy: the OTA step or the live URL. No store build. |
| A tracked file under a native project, a Capacitor config input, a native plugin version, the OTA key | A store build of each affected platform; bundled: then the first manifest of the new runtime; then the minimum build once the build is live to everyone. |

`node scripts/native/fingerprint.mjs --all` on the base and on the branch tells which platforms
changed.
