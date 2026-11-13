# A simulator build of a Capacitor iOS app, from Codemagic

x86sim runs arm64 iOS-simulator builds, and only Xcode produces one. This is the step that worked
for MediZen on 2026-11-13 (therapy-flow-v2, branch `ci/ios-simulator-app`, workflow
`medizen-ios-simulator`). The two builds, their times and the checks made on them are recorded in
`~/Documents/mobile-lab/ios/session-notes.md`.

**Ask Nadav before every build** (AskUserQuestion: the minutes left this month, the minutes this
build should take, and whether a store build is waiting). The account's free minutes are shared
with the store builds, a failed build counts unless it failed on a Codemagic service error or a
timeout (Codemagic's billing page, quoted in
`~/Documents/mobile-lab/ios/vphone-feasibility.md`), and the plan runs one build at a time, so a
simulator build also delays a store build queued behind it.

The workflow repeats the store workflow's steps up to `cap sync ios` (install, the public env keys,
the web build, the Firebase config), needs none of the signing groups, publishes nothing, and ends
with:

```yaml
      - name: App.app for the simulator (Release, arm64, signed to run locally)
        script: |
          set -euo pipefail
          mkdir -p build/simulator
          if ! xcodebuild -project "$XCODE_PROJECT" -scheme App -configuration Release -sdk iphonesimulator \
            -destination 'generic/platform=iOS Simulator' -derivedDataPath build/sim \
            ARCHS=arm64 ONLY_ACTIVE_ARCH=NO COMPILER_INDEX_STORE_ENABLE=NO \
            CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO \
            DEVELOPMENT_TEAM= CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE_SPECIFIER= \
            build > build/simulator/xcodebuild.log 2>&1; then
            tail -120 build/simulator/xcodebuild.log
            exit 1
          fi
          app=build/sim/Build/Products/Release-iphonesimulator/App.app
          [[ $(lipo -archs "$app/App") == arm64 ]] || { echo "App is not arm64 only"; exit 1; }
          ditto -c -k --keepParent "$app" build/simulator/App-simulator-arm64.zip
    artifacts:
      - build/simulator/*.zip
      - build/simulator/*.log
```

What is known about each part:

- `ARCHS=arm64 ONLY_ACTIVE_ARCH=NO`: both builds used it and came out arm64 only (the `lipo` check
  passed). It matters because a universal main executable crashed in x86sim: Apple's UIKitCatalog
  sample (x86_64 and arm64) died at launch with "dyld_sim is not compatible with the loaded
  process, likely due to architecture mismatch", and ran after
  `llvm-lipo -thin arm64` on its main executable. Universal frameworks inside an arm64 app were not
  a problem. Why x86sim picks the wrong half was not investigated.
- `CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES` with an empty team and profile: ad-hoc "Sign to Run
  Locally". The first build used `CODE_SIGNING_ALLOWED=NO`; its binary had no
  `__TEXT,__entitlements` section and its first run logged Keychain error -34018 fourteen times.
  The second build has the section and logged none. Whether a signed-in session is then stored was
  not exercised (nobody signed in). Check a build with
  `llvm-objdump --macho --section-headers App.app/App | grep __entitlements`.
- An ad-hoc build's app id is `FAKETEAMID.<bundle id>`, so universal links do not match the site's
  association file; x86sim runs no association daemon either.
- `Release`, not `Debug`: the configuration the store build uses, with no dependency on a debug
  xcconfig.
- An app with an over-the-air runtime baked at build time (MediZen's `OTA_RUNTIME`) passes it on the
  `xcodebuild` line exactly as its store workflow does.

Starting and fetching it, after his yes:

```bash
set -a; . ~/.claude/secrets/codemagic.env; set +a
curl -sS https://api.codemagic.io/user -H "x-auth-token: $CODEMAGIC_TOKEN"            # usage, see below
curl -sS "https://api.codemagic.io/builds?limit=5" -H "x-auth-token: $CODEMAGIC_TOKEN"  # is a build queued or running?
curl -sS -X POST https://api.codemagic.io/builds -H "x-auth-token: $CODEMAGIC_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"appId":"<app id>","workflowId":"<workflow>","branch":"<pushed branch>"}'     # -> {"buildId": ...}
curl -sS https://api.codemagic.io/builds/<buildId> -H "x-auth-token: $CODEMAGIC_TOKEN"  # status, artefacts[].url
curl -sSL -H "x-auth-token: $CODEMAGIC_TOKEN" -o App-simulator-arm64.zip "<artefact url>"
```

- Usage is `user.billing.usage.currentPeriod.buildTime.mac_mini_m2_free` in seconds, against
  `user.billing.usage.freeLimit.buildTime` (30000 on 2026-11-13, when the account had no payment
  info).
- That day a build waited 11 to 28 minutes for a machine, and the two MediZen simulator builds ran
  8m44s and 5m51s. Wait in one background command that asks every 30 seconds and exits on
  `finished`, `failed`, `canceled` or `timeout`.
- Then: copy the zip into `apps/<dir>/` under the sandbox user's home, unzip it as that user,
  `x86sim install`, and wait out the first launch.
