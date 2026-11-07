# Store apps

For any native, store, OTA, TestFlight, App Review, Play Console, Meta App Review, platform
approval (Apple, Google Play, Meta), TWA or PWA-to-store work, load `nadavai:store-apps`. If the
catalog cannot load it, read
`${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/store-apps/SKILL.md`. That skill holds the
model choice, the steps and the traps; this rule holds only the invariants below, which hold
whether or not the skill is loaded. Why: Nadav approved one global way to move web apps into the
stores on 2026-11-07, after MediZen, RetroBarber and The Green Room were moved.

- In a repo with live store apps, every web deploy also reaches the apps: through the deploy
  service's OTA step (bundled apps), or through the live URL (remote shells). For a bundled app, a
  deploy is done only when its `nadavai-ota` status is success or has been handled. Why: phones
  that silently stay on an old bundle run code nobody tests any more.
- A change to a native project, a native plugin or the OTA key needs a new store build of each
  affected platform. A web change never does. Why: the runtime fingerprint keeps a bundle away
  from a shell it was not built against, so a native change without a store build ships to nobody.
- Once an app's listing is public on a platform, that platform has no PWA for anyone:
  customers, staff, owners and admins alike.
  - Every install offer becomes a store link.
  - Installed-PWA users get the move notice.
  - Nothing offers a home-screen install any more: no `beforeinstallprompt` prompt and no "add
    to home screen" steps.
  Why: Nadav, 2026-11-07: "אסור שיהיה יותר PWA ... גם ללקוחות". Two installs of one app split
  users between an updated store app and a stale home-screen copy.
- This covers phones and tablets only. On a computer the app stays in the browser: no
  Electron and no desktop store app. The browser's own install (Chrome or Edge "Install", Safari
  "Add to Dock") stays, so it opens in its own window with notifications. Why: Nadav, 7.11.2026
  (therapy-flow-v2 decision #567): "the most correct, stable and professional solution, what
  everyone does". Jane and SimplePractice run in the browser on desktop.
- Until that platform's listing is public, keep its PWA install as it is. Why: Nadav,
  2026-11-07: "חשוב לא להוריד כאלה שאין לנו עדיין חנות אליהם". Removing it early leaves those
  users with no app at all.
- Moved means it really works in the store app, not that it was uploaded. Each platform counts
  as moved only after the app installed from the public listing has been checked: it signs in,
  the main flows run, and the latest deploy reached it (OTA applied, or the live URL serves the
  current commit). Why: Nadav wants every store app current and working, not a listing that
  exists.
- New work never starts a TWA. Why: a TWA is Android only, with no iOS app and no native plugins.
