# Moving installed-PWA users to the store apps

Reference: therapy-flow-v2 `src/lib/storeAvailability.ts` and
`src/components/pwa/StoreMoveNotice.tsx` (PR 197), and snooker-smart PR #145 (`PwaMovedNotice`,
`/app` store redirect).

## The switch

One switch per app × platform (`STORE_LIVE[app][platform]`, all false while the apps are in
review). Flipping one value is the whole release step for that platform: the move notice turns on
for its installed-PWA users, and every "add to home screen" offer for that app becomes a store
link. Flip it in the same PR that fills that platform's `storeUrl` in `native/apps.json`. Why: a
store URL there arms the minimum-build gate. therapy-flow-v2's `storeAvailability.test.ts` checks
only one direction: a live switch needs its URL, and a URL must equal the switch's link. It does
not refuse a URL whose switch is still off, so check that direction by eye in the PR.

Flip only after the listing is public. The check: the store URL, opened signed out, shows the
listing. Why: a notice that sends people to a listing they cannot open strands them between an
icon they were told to delete and an app they cannot get.

## Who sees the notice

| Rule | Why |
|---|---|
| Only in standalone mode (an installed home-screen PWA), on an Android phone or an iPhone or iPad. | A browser tab or a desktop keeps the website, so they get nothing. |
| Never inside the native shell, and never inside the old TWA. Detect the TWA by its `android-app://<package>` referrer, which comes on the launch only, and keep it in `sessionStorage`. | Inside the TWA the page looks like a PWA, but the Play update replaces that app in place. |
| Only the audience that moves: signed-in users of that app, or customers and signed-out visitors where staff keep an installed PWA (the Green Room's owner admin and staff push). | The manifest's `start_url` can open a staff PWA in the customer layout, and the notice would then tell staff to delete the app their push runs on. |
| The button goes to this platform's store only. "Later" hides the notice for 24 hours, and the notice blocks nothing under it. | People act on it when they choose to, without losing the screen they are on. |
| When `localStorage` holds an unfinished money flow (a checkout, refund or shop recovery journal), the last step says to keep the old icon for now. | Removing the home-screen app deletes its storage, and that recovery with it. |

Done when each row is covered by a test, and screenshots at 390 px (Android and iPhone user
agents, standalone) show the notice in Hebrew RTL with a clean console.

## No installable PWA for anyone

Since 7.11.2026 (Nadav: "אסור שיהיה יותר PWA ... גם ללקוחות"), no audience keeps a home-screen
install: not customers, not staff, not owners and not admins.

- Drop the installable manifest, or strip its `display: standalone` / `start_url` install
  fields. Cancel `beforeinstallprompt` in an inline script before hydration.
- Remove every "add to home screen" card, menu item and iOS step.
- A service worker may stay for offline and caching. Nothing may invite an install.
- Before a platform's listing is public, that platform gets the website in the browser and
  nothing to install.
- Whatever ran only on the installed PWA (staff push, badges) moves to the store app. Name its
  replacement before removing it.
- A public `/app` link (QR codes) redirects by phone platform to the right store. Inside the
  native shell it goes home.

Done when a browser on Android and iPhone shows no install offer on any screen (customer, staff,
admin), and `beforeinstallprompt` never reaches the page.

## Really working, not only listed

A platform counts as moved only after the app installed from the public listing was checked:
- it signs in;
- the main flows run;
- the current deploy reached it (OTA applied with the current bundle id, or the live URL serves
  the current commit).

Check on a real phone or the store build in an emulator. Record the result in the app's
approvals ledger.
