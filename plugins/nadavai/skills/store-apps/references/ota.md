# Signed self-hosted OTA (bundled Capacitor apps)

The mechanics (envelope format, client rules, commands) live in therapy-flow-v2
`planning/native-apps-2026-11-06/OTA.md`. The deploy service's side lives in nadavai
`ci-v2/README.md`, "Deploy service". This file holds what a new repo or a deploy needs on top
of those.

## How it fits together

- The shell carries the Capawesome live-update plugin with `autoUpdateStrategy: 'none'`. The
  app's own JS fetches `<app>/<platform>/runtime-<fp12>/manifest.json` for the runtime baked into
  the shell, verifies its signature, and hands the bundle to the plugin. The plugin checks the
  zip's signature natively and applies it on the next cold start, never in the middle of a session.
- `runtime-<fp12>` is a hash of everything that shapes the native shell: its tracked files, its
  Capacitor config inputs, the public key, and the lockfile versions of the native packages. A
  bundle therefore reaches only the shells it was built against. A shell change produces a new
  runtime, and no bundle is published to it until its store build exists.
- The app calls `ready()` once real UI has rendered. A bundle that crashes never calls it, so the
  plugin rolls it back after `readyTimeout` (15 s) and blocks it.

## Setting it up in a new repo

1. Copy the reference set from therapy-flow-v2: `scripts/native/{fingerprint,ota-publish,bake-runtime}.mjs`,
   the `native/apps.json` schema, `src/lib/native/{liveUpdate,updateGate,signedJson,nativeUpdates}`
   with their tests, and the guards (`ota-public-key-matches-config`, `native-runtime-bake`,
   `native-fingerprint`). Copy `ota-publish.mjs` and `fingerprint.mjs` byte for byte. Why: the
   deploy service runs only its vendored copies and refuses a commit whose own copies differ
   (nadavai `ci-v2/README.md`, "Trusted code only"). The pair assumes therapy-flow-v2's layout: a
   pnpm v9 `pnpm-lock.yaml` at the root (the fingerprint parses it, and the deploy step refuses a
   clone without one), the salon profile at `.appstore/salon.json`, and the two bucket names. A
   repo on npm or yarn, or with another layout, changes the pair in therapy-flow-v2 first and
   re-vendors it, so that every repo still carries the same blobs. Done when
   `node scripts/native/fingerprint.mjs --all` prints one runtime per app and platform.
2. Generate one RSA-2048 key per app. Put the private key in the vault (`~/.claude/secrets/ota-<app>.pem`,
   mode 600) and the public key in `native/keys/<app>.pub.pem`; the Capacitor config bakes it in.
   Why 2048: the iOS plugin imports the key with a hard-coded 2048-bit size. Done when the key guard
   passes and no `PRIVATE KEY` is tracked under `native/`.
3. Bake the runtime from an ignored file, never from a tracked literal: Android uses a `resValue`
   from `ota-runtime.properties`, iOS uses `CapawesomeLiveUpdateDefaultChannel = $(OTA_RUNTIME)`,
   passed on the xcodebuild command line. Why: tracked native files are fingerprint inputs, so a
   literal would change the very hash it records. Done when the release script reads the runtime
   back from the built APK or Info.plist and refuses a mismatch.
4. Make the bucket readable: `updates.nadavc.ai` serves `nadavai-app-updates`, with CORS `GET`
   from `https://localhost` and `capacitor://localhost` (the manifest is fetched from JS; the zip
   download is native). A new bucket is a usage-billed resource, so ask Nadav first. The host is
   fixed in `ci-v2/deploy/tools/ota-step.mjs`, so a commit cannot move it. Done when a `curl` of a
   manifest URL returns 200 with `cache-control: no-cache`.
5. Extend the deploy service. Today its OTA step serves one repo: `OTA_REPO`, `OTA_ENV` and
   `OTA_STAMP` in `ci-v2/deploy/bin/nadavai-deploy`. A second repo needs those turned into
   per-repo maps, its stub-R2 tests in `ci-v2/deploy/tests/nadavai-deploy.sh`, its signing keys and
   its public build env in `~/deploy/secrets` on the VM, and then `install.sh`. Done when the tests
   pass and `nadavai-deploy ota-status <repo>` lists the new runtimes.
6. Publish the first manifest of each runtime by hand, from a clean tree of merged main on the
   LENOVO, after that commit's store build exists:
   `node scripts/native/ota-publish.mjs publish <app> <platform> --production`, with
   `~/.claude/secrets/r2-ota.env` sourced. Why: the deploy step publishes only where a manifest
   already exists. A missing one reads as "not released" or "native change", so it never pushes a
   bundle to a shell that may not exist yet. Done when `ota-status` shows seq 1 on that runtime.

## Rules that are easy to break

| Rule | Why |
|---|---|
| The update gate fails open: it blocks only on a correctly signed, current `app.json` whose `minBuild` is above this build and that has a store URL for the platform. | Failing closed would turn an R2 outage or a publishing slip into a store-wide lockout. |
| Raise `ota-min` only 7 days after the new shell reaches 100% of its store, and keep build numbers rising across marketing versions. | A minimum above what the store serves walls current users out. |
| `native/apps.json` gets a `storeUrl` only once that listing is public, in the same PR as `STORE_LIVE`. | A store URL arms the minimum-build gate. |
| A "success" status means the bundle reached the store, not a phone. Prove the apply with a beacon from the app (or a device check) before saying a deploy reached users. | On 2026-11-09 the therapy-flow-v2 beacon was off, so no deploy could be proven applied. |
| A bundle applies at the next cold start. A reload sooner happens only on resume after a long background and only on a route with no input in progress, with the rollback window checked on a crashing test bundle. | A suspended iPhone app can stay old for days, but a reload mid-booking loses the customer's input. |
| An app's first manifest waits for its first store build. | Before that no shell runs the runtime, so a published bundle reaches nobody. |
| Rotating a key means a store build. | The key is a fingerprint input. Old shells keep the old key until their minimum is raised. |
| Never edit or replay a manifest by hand; roll back with `ota-rollback`, which writes a new, higher `seq`. | The client refuses a lower `seq`, and the publisher refuses to build on a manifest it cannot verify. |
| A staging test build (`VITE_OTA_STAGING=1`) and a demo-profile salon build never reach production. | The publisher refuses both: one would strand phones on staging, the other would put the demo salon on every phone. |

## After each deploy: the `nadavai-ota` status

The deploy service runs the OTA step after every live deploy of the store-app repo and posts
`nadavai-ota` on the commit. An OTA failure never rolls back the web deploy.

| Status says | Meaning | Do |
|---|---|---|
| success, "store apps on <sha>" (published or current) | Every released platform runs this commit's bundle from its next cold start. | Nothing. |
| "native change: store build needed: <app>/<platform>" | The commit changed the shell, and its runtime has no manifest. Phones stay on the last bundle of their own runtime. | Step 3 for that platform, then the first manifest by hand (setup step 6), then `ota-min` 7 days later. |
| "not released: <app>/<platform>" | That platform has no manifest at all yet. | Nothing until its first release (setup step 6). |
| "held: <app>/<platform>" | A person's `ota-rollback` holds it. | `nadavai-deploy ota-release <repo> <app> <platform>` once the fix is live. |
| "OTA stopped before …" | A hold, `ota-off` or a newer live commit stopped the step before a build or a publish. | Resolve the cause, then `nadavai-deploy ota <repo> <live sha>`. |
| "OTA refused: publisher changed in the commit" | The commit's `scripts/native/ota-publish.mjs` or `fingerprint.mjs` differs from the vendored copies. | Re-vendor as nadavai `ci-v2/README.md` "Trusted code only" says, running `install.sh` only while no deploy or OTA unit runs (`systemctl list-units 'nadavai-deploy-*'` on the VM is empty). |
| "OTA failed: …" | A build, a bundle check or R2 failed (the log is on the VM, `~/deploy/logs`). | Fix the cause, then `nadavai-deploy ota <repo> <sha>`. |
| "not published: the OTA is off" | `ota-off` is set. | `nadavai-deploy ota-on <repo>` once its reason is gone. |
| error, "OTA interrupted" | A signal stopped the step; its units were stopped first. | `ota-status`, then `nadavai-deploy ota <repo> <live sha>`. |
| no `nadavai-ota` at all on a live deploy | The step never ran: the repo was held or off, or production had already moved to another commit. | Nothing for a moved production (the newer deploy runs its own step). Otherwise `nadavai-deploy ota <repo> <live sha>` once the hold is gone. |

People's commands (`ota-status`, `ota-rollback`, which holds that platform until `ota-release`,
`ota-off`/`ota-on`, `ota-min`) are listed in nadavai `ci-v2/README.md`, "Deploy service".
A web `rollback` prints the matching `ota-rollback` per platform (`--with-ota` runs them). When it
says "OTA: unknown", the state was lost: read `ota-status` before acting.
