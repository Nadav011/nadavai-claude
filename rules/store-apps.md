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
- No PWA install, for anyone. An app with store apps (or on its way to them) offers no
  home-screen install to any audience: customers, staff, owners and admins alike. There is no
  installable manifest, no `beforeinstallprompt` offer and no "add to home screen" steps.
  - Before a platform's listing is public, that platform gets the website in the browser only.
  - Once the listing is public, every install offer is a store link, and installed-PWA users get
    the move notice.
  Why: Nadav, 2026-11-07: "אסור שיהיה יותר PWA ... גם ללקוחות". Two installs of one app split
  users between an updated store app and a stale home-screen copy.
- Moved means it really works in the store app, not that it was uploaded. Each platform counts
  as moved only after the app installed from the public listing has been checked: it signs in,
  the main flows run, and the latest deploy reached it (OTA applied, or the live URL serves the
  current commit). Why: Nadav wants every store app current and working, not a listing that
  exists.
- New work never starts a TWA. Why: a TWA is Android only, with no iOS app and no native plugins.
