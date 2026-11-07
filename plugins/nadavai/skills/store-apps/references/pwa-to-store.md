# Moving installed-PWA users to the store apps

Reference: therapy-flow-v2 `src/lib/storeAvailability.ts` and
`src/components/pwa/StoreMoveNotice.tsx` (PR 197), and snooker-smart PR #145 (`PwaMovedNotice`,
`/app` store redirect).

## The switch

One switch per app × platform (`STORE_LIVE[app][platform]`, all false while the apps are in
review). Flipping one value is the whole release step for that platform: the move notice turns on
for its installed-PWA users, and every "add to home screen" offer for that app becomes a store
link. Flip it in the same PR that fills that platform's `storeUrl` in `native/apps.json`; a unit
test keeps the two equal.

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

## A site that keeps its manifest

If staff still install the PWA, keep the manifest and the service worker, and cancel
`beforeinstallprompt` in an inline script before hydration. A public `/app` link (QR codes)
redirects by phone platform to the right store; inside the native shell it goes home.
