---
name: store-apps
description: "Move a web app into the App Store and Google Play as real store apps, and keep them in step with every web deploy: choose the model (bundled app with signed OTA, or a remote-URL shell with an update gate; never a new TWA), set up the shells, build (iOS on Codemagic, Android locally), do the store work through the store APIs first, once a listing is public end the PWA there for every audience and move its users to the store, check the store-installed app really works and is current, and run the OTA step of the deploy service. Use for any native, store, OTA, TestFlight, App Review, Play Console, Meta App Review, platform approval, TWA or PWA-to-store work, a store build or release, or a native change in a repo with live store apps. Also for store listings: ASO, keywords, screenshots, preview video, store copy and store promotion. Triggers: \"store app\", \"להעלות לחנות\", \"App Store\", \"Google Play\", \"TestFlight\", \"OTA\", \"TWA\", \"store build\", \"ASO\", \"צילומי מסך לחנות\", \"מילות חיפוש\"."
---
# store-apps

How a web app of Nadav's becomes App Store and Play apps that follow every web deploy, as built
on 7.11.2026. The reference implementations are private repos: read them for the exact code and
IDs, and keep their IDs out of this public repo.

| Model | Reference | State on 7.11.2026 | Where to read |
|---|---|---|---|
| Bundled app + signed self-hosted OTA | MediZen and RetroBarber | OTA live and published by the deploy service. RetroBarber Android has been public on Play since 7.11, with `STORE_LIVE.retrobarber.android` true (therapy-flow-v2 PR 200). MediZen Android and both iOS apps are in review. | therapy-flow-v2 `planning/native-apps-2026-11-06/` (OTA.md, SHELLS.md, IOS-BUILD.md, RELEASE.md, PUSH-GOOGLE.md, ACCOUNT-DELETION.md, REVIEWER-LOGIN.md), `scripts/native/`, `native/apps.json`, `src/lib/native/`, `codemagic.yaml` |
| Remote-URL shell + update gate | The Green Room | Live in both stores; customers moved to the store apps, update gate shipped off. | snooker-smart `capacitor.config.ts`, PR #145 (`gh pr diff 145 -R Nadav011/snooker-smart`) |

General Capacitor topics live in their own skills, one owner per topic; load the one the step
needs. This skill holds only what those do not: the decisions, the order and the traps.

| Topic | Skill |
|---|---|
| CLI, config, platforms, app icons, storage, troubleshooting | `capacitor-app-development` |
| Choosing and installing a plugin | `capacitor-plugins` |
| Notch, home indicator, edge-to-edge, status bar | `safe-area-handling` |
| Keyboard covering inputs, resize modes | `capacitor-keyboard` |
| Splash screen | `capacitor-splash-screen` |
| Universal links, App Links, custom schemes | `capacitor-deep-linking` |
| Push (FCM, APNs), channels, permission timing | `capacitor-push-notifications` |
| VoiceOver, TalkBack, text size, contrast in the shell | `capacitor-accessibility` |
| Apple App Review before a submission or after a rejection | `capacitor-apple-review-preflight` |
| iPad Split View, Stage Manager, foldables | `capacitor-ios-resizability` |
| UIScene lifecycle (Capacitor 8.5, Xcode 27) | `capacitor-uiscene-migration` |
| R8, shrinking, DEX size (Play's February 2027 rule) | `capacitor-android-dex-optimization` |
| Startup time, memory, WebView performance | `capacitor-performance` |
| A bug that only happens on the device; reading device logs | `debugging-capacitor`, `ios-android-logs` |
| Phone feel of the web layer | `mobile-native` |

Those skills are third-party text (`plugins/nadavai/skills/VENDORED.md`). Where one of them
disagrees with this skill or with `rules/store-apps.md` (a remote shell's `server.url`, OTA, who
publishes), this skill and the rule win.

Approval gates still apply at every step (`rules/working-style.md`, `rules/acting-on-behalf.md`):
a public release (a build, a raise of a staged rollout, the first listing, a change to a live
listing, its availability or price), auth changes (a reviewer login), deletion, migrations and
anything that costs money are asked at that moment. Uploading a build and submitting it for review
are not asked once its checks pass (Nadav, 2026-11-10), provided the release is held for him: App
Store Connect `releaseType: MANUAL`; on Play the internal or a closed testing track (an open track
is public), or managed publishing on for production. Until therapy-flow-v2 RELEASE.md section 4 F is updated to
this decision, it wins for that repo (`rules/working-style.md`: a project's stricter caution wins).

## Steps

1. **Pick the model from how the site builds.** Read the build, not the framework name:

   | The site | Model | Why |
   |---|---|---|
   | Builds to static files (Vite SPA, `next build` with `output: 'export'`) | Capacitor with the build as `webDir`, plus signed self-hosted OTA ([references/ota.md](references/ota.md)) | The app starts offline and fast, and every web deploy still reaches it within one cold start. |
   | Needs a server (Next with API routes, server actions, middleware, cookie auth, a payment iframe) | Capacitor remote-URL shell (`server.url`) plus an update-required gate ([references/remote-shell.md](references/remote-shell.md)) | It already follows every deploy. Bundling it would mean rewriting auth and payments for no update benefit (the 7.11 GreenRoom decision). |
   | An existing TWA | Replace it with one of the two above, same package name and upload key (no new TWA: `rules/store-apps.md`) | A Play update of the same package replaces the TWA in place. |

   Done when the model and its reason are written in the project's plan or CLAUDE.md.

2. **Set up each shell** against [references/shell-checklist.md](references/shell-checklist.md),
   then bring it to the native bar in [references/native-bar.md](references/native-bar.md) (every
   native component and capability a person can feel; Nadav, 2026-11-09: Capacitor stays, nothing
   less than the full bar).
   Done when every row there has its check result, and the open rows have an owner and a date.

3. **Build.** Do iOS on Codemagic and Android locally ([references/builds.md](references/builds.md)).
   Which changes need a store build is in `rules/store-apps.md` and builds.md, "Native change or
   web change". Build numbers only ever go up. Done when the artifact's checks passed: signature,
   ids, version, baked runtime read back, no staging host, and no remote `server` in a bundled app.

4. **Do the store work through the APIs first** ([references/store-apis.md](references/store-apis.md)):
   the version, build, review details with the demo account, review notes (including the OTA
   disclosure), content rights, availability and the review submission. Only what has no API, or
   no granted scope, goes through the browser. Before each submission, pass the readiness gate
   there (`asc validate --strict`, `asc review doctor`) and sign in with the demo account against
   production; after a rejection, follow its rejection triage. After the reviews, turn the reviewer-login kill switch off.
   Done when three things hold: the submission (Apple) or release (Play) is in the state you
   meant, read back through the API; the demo sign-in answered HTTP 200 as a non-privileged
   account; and the switch is off once no review is pending.

4b. **Make the store pages top of the market**: facts, keywords, competitor teardown, copy,
   screenshots, video and upload ([references/listing.md](references/listing.md)); then ratings,
   free promotion levers and measurement ([references/promotion.md](references/promotion.md)).
   Every submission and every new app gets this pass, in Hebrew first and real en-GB copy second.
   Why: Nadav, 7.11.2026: listings must match the best apps on the market, and every claim must be
   true.
   Done when:
   - every claim in every field, caption and video maps to a verified fact-sheet entry approved
     by Nadav or the owner;
   - keywords respect the byte limit and the no-repeat rules, and a rank check before and after
     is saved;
   - the first three screenshots pass the strip test;
   - Nadav saw the full listing before upload;
   - each upload was read back through the API.

5. **End the PWA and move its users** ([references/pwa-to-store.md](references/pwa-to-store.md)).
   - Keep the PWA install on a platform until its listing is public (`rules/store-apps.md`).
   - Once the listing is public, flip that app × platform switch, one at a time. From then on,
     no audience on that platform keeps a PWA install, staff and owners included: offers become
     store links, `beforeinstallprompt` is cancelled, and installed-PWA users get the move notice.
   Done when:
   - the store URL opens the public listing signed out;
   - the notice shows on an installed PWA of that platform and nowhere else;
   - no screen of the app offers a home-screen install on that platform;
   - the app installed from the public listing has been checked: it signs in, the main flows
     run, and the current deploy reached it.

6. **Keep every deploy reaching the apps.** For a bundled app, read the `nadavai-ota` status of
   each deploy and act on it ([references/ota.md](references/ota.md), "After each deploy"). Done
   when the last deploy's `nadavai-ota` is success, or its failure has been handled: a store build
   started, a hold set, or a re-vendor underway. For a remote shell, raise the minimum build only
   after a shell change ships ([references/remote-shell.md](references/remote-shell.md), "After a
   shell change"). Done when the minimum-build env var is at or below the build every store user
   has.

7. **Keep the platform approvals valid** at Apple, Google and Meta, for the legal entity and for
   each app ([references/approvals.md](references/approvals.md)). Run
   `node scripts/check-approvals.mjs --asc --play` before every store or Meta submission and on
   the first of each month. It only reads. Done when it exits 0, or each item it flags has an owner
   and a date in its ledger.

8. **Say "live" only from public proof.** Run `node scripts/store-status.mjs` (read-only) before
   telling Nadav what is in the stores, and at the end of every submission or release. It lists
   every app in both stores: the iOS state with territories on sale and Apple's public lookup, and
   the Android production release with whether the public Play page opens. The Play package of an
   app whose iOS bundle id differs comes from `~/.config/nadavai/store-apps.json`, or from the file
   `--config <path>` names. Either file stays outside this public repo. A nightly store-drift check
   on omarchy (the private nadavai-nightly repo) compares this matrix with each repo's declared
   state. It opens one issue per repo when they disagree. Done when no app × platform is reported
   as live without a public listing behind it, and every other row has an owner (review,
   rejection, draft, held).

9. **Watch each release's health.**

   | Store | Check | Why |
   |---|---|---|
   | Google Play | Android vitals after each release: user-perceived crash rate under 1.09% and ANR rate under 0.47% overall, and under 8% on every phone model. Propose a raise of a store update's rollout (staged release) only while both hold, and raise it after Nadav's yes. | Above these bad-behaviour thresholds Play reduces the app's visibility. |
   | App Store | A store build that changes native code goes out with "Release update over a 7-day period using phased release" (1, 2, 5, 10, 20, 50, 100% of automatic-update users). Pause it (up to 30 days in total) on a crash spike; anyone can still download it by hand. | A native bug reaches 1% of phones on day one instead of all of them. |

   The session that released the build reads these on days 1, 3 and 7, or hands that to Nadav
   with the dates. Done when day 7 is read and below the thresholds, or the rollout is paused with
   an owner. Follow-up, not built: the nightly store-drift job in nadavai-nightly could report the
   vitals too.
   Sources: https://developer.android.com/google/play/vitals,
   https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases
   (both read 2026-11-09).

The next action is step 1: open the repo's build config (`package.json` scripts, `next.config.*`,
`vite.config.*`) and fill the table row.
