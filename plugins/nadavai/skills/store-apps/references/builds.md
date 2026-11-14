# Store builds

Reference: therapy-flow-v2 `planning/native-apps-2026-11-06/IOS-BUILD.md` (Codemagic: the account,
variable groups, signing, how to start and read a run) and SHELLS.md section 3 (local Android
builds). Uploading a build and submitting it for review are not asked once its checks pass, as long as the
release is held for Nadav; the public release is asked (`rules/working-style.md`, Approval gates).

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
| A plugin that brings its own SwiftPM dependency (therapy-flow-v2's `@aparajita/capacitor-secure-storage` needs `keychain-swift`) leaves the committed `Package.resolved` short; SwiftPM rewrites it on the Mac and the clean-tree check refuses the IPA (2026-11-12, MediZen run 6af5b9d54d758506493319a3). | Commit `Package.resolved` as the run resolved it (check the revision against the upstream tag with `git ls-remote`) in the same change that adds the plugin; it is a fingerprint input, so it changes the iOS runtime. |

A simulator workflow (no signing, no upload) doubles as the iOS compile check of a native branch
and as the App Review screen recording: Cash's `cash-ios-review-recording` builds the shell for the
simulator, drives it with a Maestro flow and records with `xcrun simctl io recordVideo`; the
reviewers' code comes from the API's environment variables and is masked in the log. Traps it paid
for (2026-11-11): every build of the account's six apps was marked expired that day (cause not
known), so re-read `expired` on the attached build right before submitting; a step that
needs an element the earlier steps scrolled away fails, so scroll back to it; demo data drifts
(a day left open turns «סיום יום» into «סיום ו׳ 6.11»), so match a pattern; Maestro's long-press
on the iOS 26 home screen does not open the quick-action menu; trim the idle start with ffmpeg
and label the file a simulator recording in the notes.

## Real-iPhone tests (Firebase Test Lab) and Xcode Cloud

Firebase Test Lab runs XCUITests on real iPhones. On the Spark plan (no billing account) it cannot
charge, and it gives 5 physical-device runs a day. A refused run says `TEST_QUOTA_EXCEEDED` and runs
nothing; at 01:00 Israel time the quota had not reset yet. Test Lab shuts down on 2027-09-30, and
Google Cloud's Developer Device Platform replaces it. therapy-flow-v2 `native/device-tests/` is the
reference (2026-11-13):
- Add the UI-test target on the build machine only, after the OTA runtime is baked
  (`scripts/native/add-device-test-target.rb`, xcodeproj gem). The committed project and the runtime
  then stay unchanged.
- Build with `build-for-testing` for `iphoneos` with `CODE_SIGNING_ALLOWED=NO`. Then ad-hoc codesign
  and zip the `Debug-iphoneos` products with the `.xctestrun` file; Test Lab re-signs the zip. One
  Codemagic run takes about 15 minutes.
- Robo (`--type robo` with the store IPA) only proves that the app installs and opens. On iOS it
  cannot see inside the WebView.
- A test against the live server only reads the screen. Write each expectation for the signed-out
  state: RetroBarber's first run failed because its test expected the native tab bar, which shows to
  signed-in customers only.

Xcode Cloud (25 free compute hours a month with the developer program) needs a Mac for the first
setup. The App Store Connect API has no call that creates a `ciProduct`; Xcode, signed in to the
account holder's Apple ID, creates it under Integrate → Create Workflow.
- Codemagic can lend that Mac for one run: a workflow that sleeps, plus "Enable remote access". The
  run gives VNC and SSH, and its minutes are a money question when the month is nearly spent.
- Over SSH, `screencapture` and osascript UI scripting fail (no screen-recording or accessibility
  grant), so the setup goes through VNC.
- The Apple ID sign-in on that Mac failed with "An unknown error occurred" (2026-11-13). The Apple ID
  had been typed as a local phone number. With the account email it worked (2026-11-14): the owner
  types the password and the code in the VNC window.
- Before opening Xcode, put `DEVELOPMENT_TEAM = <team id>` after each `CODE_SIGN_STYLE = Automatic;`
  in the Mac's copy of the pbxproj. Without it, Create Workflow has no team to pick. Do not commit that
  line by reflex: it is a tracked native change and moves the iOS runtime.
- A remote session gets about 10 minutes to activate VNC before Codemagic ends it. The repo it builds
  can be a public one-file repo (only `codemagic.yaml` with a long `sleep`), so no deploy key is needed.
- Drive the VNC viewer inside its own nested X server, not on the owner's desktop:
  `Xephyr :7 -screen 1600x1000 &`, then `DISPLAY=:7 vncviewer <host>::<port>`. The owner types
  `builder` and the Codemagic VNC password into that window. From then on, `DISPLAY=:7 xdotool`
  clicks and types inside it, and `DISPLAY=:7 import -window root` takes the screenshot. This works
  whatever window has focus on the host. With TigerVNC the Mac's points are the :7 pixels plus the
  viewer's offset (`xdotool search --name TigerVNC getwindowgeometry`, 1,20 here). Before typing,
  run `xdotool windowfocus` on the viewer window, and press the mouse with a short down/up, not a bare
  click. On the owner's real desktop (ydotool) it failed twice (2026-11-14): Orca and another
  session's headed Chrome kept taking focus, and keys arrived late, which sent a wrong Apple sign-in.
  A headless VNC client does not help either: a legacy VNC password leads to the Mac's login window,
  not the signed-in session.
- The VNC link dropped twice when throughput fell ("full color is now disabled", then "End of
  stream"). The Mac and Xcode stay up, so reopen the viewer; the owner types the VNC password again.
  The Apple account stays signed in.
- The free personal Codemagic plan runs one build at a time: cancel the previous remote session
  before starting a new one, or the new one waits in the queue.
- The GitHub grant ("Grant Access…") opens App Store Connect, which stayed blank in the Mac's Safari.
  Open the same `ci-setup/<id>` URL in the owner's own Chrome. Read it from Safari over SSH (`osascript`
  to Safari works without the accessibility grant). The owner clicks Authorize, then installs the Xcode
  Cloud GitHub app with "Only select repositories" and approves the GitHub Mobile prompt. A public
  package repository may stay ungranted ("Continue").
- Create Workflow's default starts on every push to any branch. Right after the product appears,
  `PATCH /v1/ciWorkflows/<id>` with `branchStartCondition: null` and a `manualBranchStartCondition`
  for the release branch. Otherwise every push to the repo spends compute hours on a build that fails.
- Each app needs its own product, so each needs its own pass through Create Workflow. Quit Xcode
  between apps (kill it over SSH and delete
  `~/Library/Saved Application State/com.apple.dt.Xcode.savedState`). Capacitor projects all name
  their target "App". An Xcode that has just created the product "App" reuses it for the next
  project and moves it to the other app (2026-11-14: RetroBarber's product became Green Room's). The
  old app's workflow is then stranded in the wrong product, and the API cannot edit it (409 "must be
  a primary repository"). After each app, check with `GET /v1/ciProducts/<id>/app` that every
  product points at its own bundle id.
- The nested Xephyr window has no clipboard link to the host, so the owner types the VNC password
  by hand.
- The App Store Connect API can do everything after the product exists: change a workflow's
  project, branch, start condition or `isEnabled` (`PATCH /v1/ciWorkflows/<id>`), or add a workflow
  (`POST /v1/ciWorkflows`). Only the environment variables need App Store Connect's web page.
  `POST /v1/ciBuildRuns` with only the workflow relationship starts a manual build on the workflow's
  branch. Green Room's first Archive (remote-URL shell, `ci_post_clone.sh` with pnpm install and cap
  sync) succeeded in about 4 minutes (2026-11-14, build 1). To start from a branch other than main,
  add `sourceBranchOrTag` with that branch's `scmGitReferences` id
  (`GET /v1/scmRepositories/<id>/gitReferences`).
- Xcode Cloud archives with automatic package resolution turned off, so a project without a
  committed `project.xcworkspace/xcshareddata/swiftpm/Package.resolved` fails with "a resolved file is
  required when automatic dependency resolution is disabled". Commit the file, or resolve at the end
  of `ci_post_clone.sh`: `defaults write com.apple.dt.Xcode IDEPackageOnlyUseVersionsFromResolvedFile
  -bool NO`, then the same with `IDEDisableAutomaticPackageResolution`, then
  `xcodebuild -resolvePackageDependencies -project <p> -scheme App`. The `defaults` lines are needed;
  without them the resolve fails in the same way. Cash's build 4 passed this way (2026-11-14).
- The web half runs in `ci_scripts/ci_post_clone.sh` next to each `.xcodeproj`. Its client keys come
  from the workflow's environment variables, which the owner pastes, or, when the owner wants nothing
  done by hand, from a committed file of the public client values only (anon-role key, analytics,
  Turnstile, VAPID public key, the Firebase client config; never a service key) that the script
  sources when the workflow sets nothing (therapy-flow-v2 `native/xcode-cloud/*.env`, Nadav,
  2026-11-14; MediZen and RetroBarber Archives passed at 17c27ea5). An agent never pastes them itself.
- Codemagic fills Info.plist's `$(OTA_RUNTIME)` through an xcodebuild argument, which Xcode Cloud
  does not offer. Set the key that holds it, `CapawesomeLiveUpdateDefaultChannel`, with PlistBuddy
  after the runtime is baked, and read it back; `Set :OTA_RUNTIME` fails with "Does Not Exist". Adding `ci_scripts` changes the
  iOS runtime, because it is a tracked file under the native project. Start Xcode Cloud's build number
  above the last Codemagic one.

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

A store build from a native branch must carry everything main ships natively: when main gained a native plugin (therapy-flow-v2 513's secure storage, 2026-11-12), the builds in review from the native branch matched no runtime main could publish, and the deploy's OTA read "store build needed" on every shell. Before a store build, merge main into the native branch and compare `fingerprint.mjs --all` with the live commit. If an app's Capacitor config lists `includePlugins`, add the merged plugin to that list too: `cap sync` silently drops a plugin missing from it. MediZen lost secure storage from three generated files that way (Grok review, 2026-11-13). Keep a test that requires each native plugin in each app's list.

A native change stays on its branch until its store build is ready to submit, and merges with
that build in the same step (as PR 198 in therapy-flow-v2 waits). Batch every native change of an
app into one build per platform. Why: once a native change is on main, every phone on the old
shell stops receiving bundles until the new build is live, with nothing on the phone saying so
(audit 2026-11-09).
