---
name: store-apps
description: "Move a web app into the App Store and Google Play as real store apps, and keep them in step with every web deploy: choose the model (bundled Capacitor app with signed self-hosted OTA, or a remote-URL Capacitor shell with an update-required gate; never a new TWA), set up the shells (ids, icons, privacy manifests, push, deep links, in-app account deletion, reviewer login), build (iOS on Codemagic, Android locally), do the store work through the App Store Connect and Play Developer APIs first, move installed-PWA users to the store, and run the OTA step of the deploy service. Built on 7.11.2026 for MediZen and RetroBarber (therapy-flow-v2) and The Green Room (snooker-smart). Use for any native, store, OTA, TestFlight, App Review, Play Console, TWA or PWA-to-store work, a store build or release, or a native change in a repo with live store apps. Triggers: \"store app\", \"להעלות לחנות\", \"אפליקציה בחנות\", \"App Store\", \"Google Play\", \"TestFlight\", \"OTA\", \"live update\", \"TWA\", \"native shell\", \"store build\"."
---
# store-apps

How a web app of Nadav's becomes App Store and Play apps that follow every web deploy, as built
on 7.11.2026. The reference implementations are private repos: read them for the exact code and
IDs, and keep their IDs out of this public repo.

| Model | Reference | State on 7.11.2026 | Where to read |
|---|---|---|---|
| Bundled app + signed self-hosted OTA | MediZen and RetroBarber | OTA live and published by the deploy service; store builds uploaded; iOS in review, Play releases drafts, every `STORE_LIVE` false. Steps 4 and 5 are built here, not yet proven by a public listing. | therapy-flow-v2 `planning/native-apps-2026-11-06/` (OTA.md, SHELLS.md, IOS-BUILD.md, RELEASE.md, PUSH-GOOGLE.md, ACCOUNT-DELETION.md, REVIEWER-LOGIN.md), `scripts/native/`, `native/apps.json`, `src/lib/native/`, `codemagic.yaml` |
| Remote-URL shell + update gate | The Green Room | Live in both stores; customers moved to the store apps, update gate shipped off. | snooker-smart `capacitor.config.ts`, PR #145 (`gh pr diff 145 -R Nadav011/snooker-smart`) |

General Capacitor topics (CLI, config, icons, splash, deep links, plugins) live in the
`capacitor-app-development` and `capacitor-plugins` skills; phone feel of the web layer in
`mobile-native`. This skill holds only what those do not: the decisions, the order and the traps.

Approval gates still apply at every step (`rules/working-style.md`, `rules/acting-on-behalf.md`):
store publishing, auth changes (a reviewer login), deletion, migrations and anything that costs
money are asked at that moment. Uploading to TestFlight or a Play internal track counts as store
publishing (therapy-flow-v2 RELEASE.md section 4 F puts those uploads under that gate), so ask
before it too.

## Steps

1. **Pick the model from how the site builds.** Read the build, not the framework name:

   | The site | Model | Why |
   |---|---|---|
   | Builds to static files (Vite SPA, `next build` with `output: 'export'`) | Capacitor with the build as `webDir`, plus signed self-hosted OTA ([references/ota.md](references/ota.md)) | The app starts offline and fast, and every web deploy still reaches it within one cold start. |
   | Needs a server (Next with API routes, server actions, middleware, cookie auth, a payment iframe) | Capacitor remote-URL shell (`server.url`) plus an update-required gate ([references/remote-shell.md](references/remote-shell.md)) | It already follows every deploy. Bundling it would mean rewriting auth and payments for no update benefit (the 7.11 GreenRoom decision). |
   | An existing TWA | Replace it with one of the two above, same package name and upload key (no new TWA: `rules/store-apps.md`) | A Play update of the same package replaces the TWA in place. |

   Done when the model and its reason are written in the project's plan or CLAUDE.md.

2. **Set up each shell** against [references/shell-checklist.md](references/shell-checklist.md).
   Done when every row there has its check result, and the open rows have an owner and a date.

3. **Build.** Do iOS on Codemagic and Android locally ([references/builds.md](references/builds.md)).
   Which changes need a store build is in `rules/store-apps.md` and builds.md, "Native change or
   web change". Build numbers only ever go up. Done when the artifact's checks passed: signature,
   ids, version, baked runtime read back, no staging host, and no remote `server` in a bundled app.

4. **Do the store work through the APIs first** ([references/store-apis.md](references/store-apis.md)):
   the version, build, review details with the demo account, review notes (including the OTA
   disclosure), content rights, availability and the review submission. Only what has no API, or
   no granted scope, goes through the browser. Before each submission, sign in with the demo
   account against production. After the reviews, turn the reviewer-login kill switch off.
   Done when three things hold: the submission (Apple) or release (Play) is in the state you
   meant, read back through the API; the demo sign-in answered HTTP 200 as a non-privileged
   account; and the switch is off once no review is pending.

5. **Move the installed-PWA users** once a listing is public ([references/pwa-to-store.md](references/pwa-to-store.md)).
   Flip one app × platform switch at a time. Done when the store URL opens the public listing
   signed out, and the notice shows on an installed PWA of that platform and nowhere else.

6. **Keep every deploy reaching the apps.** For a bundled app, read the `nadavai-ota` status of
   each deploy and act on it ([references/ota.md](references/ota.md), "After each deploy"). Done
   when the last deploy's `nadavai-ota` is success, or its failure has been handled: a store build
   started, a hold set, or a re-vendor underway. For a remote shell, raise the minimum build only
   after a shell change ships ([references/remote-shell.md](references/remote-shell.md), "After a
   shell change"). Done when the minimum-build env var is at or below the build every store user
   has.

The next action is step 1: open the repo's build config (`package.json` scripts, `next.config.*`,
`vite.config.*`) and fill the table row.
