# Store apps

For any native, store, OTA, TestFlight, App Review, Play Console, Meta App Review, platform approval (Apple, Google Play, Meta), TWA or PWA-to-store work, load `nadavai:store-apps` (fallback: `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/store-apps/SKILL.md`). The skill holds the model choice, the steps and the traps. The invariants below hold whether or not it is loaded.

- In a repo with live store apps, every web deploy also reaches the apps: through the deploy service's OTA step (bundled apps) or through the live URL (remote shells). For a bundled app, a deploy is done only when its `nadavai-ota` status is success or has been handled; otherwise phones silently stay on a bundle nobody tests any more.
- A change to a native project, a native plugin or the OTA key needs a new store build of each affected platform; a web change does not. The runtime fingerprint keeps a bundle away from a shell it was not built against, so a native change without a store build ships to nobody.
- Once an app's listing is public on a platform, that platform has no PWA for anyone (customers, staff, owners and admins alike), because two installs of one app split users between an updated store app and a stale home-screen copy. Every install offer becomes a store link, installed-PWA users get the move notice, and nothing offers a home-screen install any more: no `beforeinstallprompt` prompt and no "add to home screen" steps.
- Until that platform's listing is public, keep its PWA install as it is; removing it early leaves those users with no app at all.
- This covers phones and tablets. On a computer the app stays in the browser, with no Electron and no desktop store app, and the browser's own install (Chrome or Edge "Install", Safari "Add to Dock") stays.
- A platform counts as moved only after the app installed from the public listing has been checked: it signs in, the main flows run, and the latest deploy reached it (OTA applied, or the live URL serves the current commit). An uploaded build or an existing listing is not that proof.
- New work does not start a TWA: it is Android only, with no iOS app and no native plugins.
