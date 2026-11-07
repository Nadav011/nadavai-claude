# Store apps

For any native, store, OTA, TestFlight, App Review, Play Console, TWA or PWA-to-store work, load
`nadavai:store-apps`. If the catalog cannot load it, read
`${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/store-apps/SKILL.md`. That skill holds the
model choice, the steps and the traps; this rule never restates them. Why: Nadav approved one
global way to move web apps into the stores on 2026-11-07, after MediZen, RetroBarber and The
Green Room were moved.

- In a repo with live store apps, every web deploy also reaches the apps: through the deploy
  service's OTA step (bundled apps), or through the live URL (remote shells). A deploy is done only
  when its `nadavai-ota` status is success or has been handled. Why: phones that silently stay on
  an old bundle run code nobody tests any more.
- A change to a native project, a native plugin or the OTA key needs a new store build of each
  affected platform. A web change never does. Why: the runtime fingerprint keeps a bundle away
  from a shell it was not built against, so a native change without a store build ships to nobody.
- Once an app's listing is public on a platform, offer no PWA install for that app there:
  install offers become store links, and installed-PWA users get the move notice. Why: two
  installs of one app split users between an updated store app and a stale home-screen copy.
- New work never starts a TWA. Why: a TWA is Android only, with no iOS app and no native plugins.
