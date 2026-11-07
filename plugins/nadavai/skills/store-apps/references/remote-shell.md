# Remote-URL shell (server-rendered sites)

The Green Room's iOS and Android apps are Capacitor shells whose `server.url` is the live site.
Every web deploy reaches them at once. Only a change to the shell itself needs a store build.
Reference: snooker-smart `capacitor.config.ts` (its comments explain each platform difference)
and PR #145.

## Setting it up

1. Use `server.url` = the production origin and a small `webDir` holding only an offline page.
   On iOS set `server.errorPath` to that page. Why: without it, a stock iOS shell shows a blank
   WKWebView forever on a dead connection, an App Review 2.1 rejection. On Android, handle real
   transport failures in a WebView client of your own, so your own 404 and 500 pages are not
   replaced by "you are offline". Done when airplane mode shows the offline page on both platforms.
2. Add `appendUserAgent` (for example `<App>Android`) so the site and its logs can tell the shell
   from a phone browser. Done when the server log shows the marker on a shell request.
3. Give the shell something a website cannot do: push, the store update flow, deep links.
   Why: Apple 4.2 (minimum functionality) is the usual rejection for a site in a wrapper. The
   Green Room's approved shells carry native push and, on Android, Play's in-app update. Done when
   the review notes name the native features.
4. Add the update-required gate to the web code: when `App.getInfo().build` is below
   `NEXT_PUBLIC_MIN_NATIVE_BUILD_<PLATFORM>`, show a full-screen screen with the store button and
   no way past it. Unset, 0, unreadable, a missing bridge or any error mean no gate. Why: a broken
   check must never lock a customer out, and an env var plus a web deploy is all it takes to raise
   the minimum, with no store build. Done when tests cover the fail-open cases and a forced minimum
   shows the screen at 390 px.
5. Keep the service worker and manifest only if staff still use an installed PWA (owner admin,
   web push). In that case, cancel `beforeinstallprompt` in an inline script before hydration, so
   Chrome offers no install to customers. Done when a customer page on Android Chrome shows no
   install banner.

## After a shell change

Ship the store build, wait until it reaches everyone (a 100% Play rollout, the App Store version
live), and only then set the minimum build env var and deploy. Why: a minimum above the build the
store serves walls current users out. Done when the env var holds the new build and a shell one
build below sees the gate.
