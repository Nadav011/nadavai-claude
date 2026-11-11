# What unit 1 shows before anyone plays the preview

A reading aid for `rules.md`, «An app is built once», point 5: the proofs of that point in the order unit 1 runs
them, each with its pass and fail condition. It adds no rule. Where this list and point 5 differ, point 5 holds and
the difference is a fault to report («Where a fault goes»). Source: the eleventh independent review of the rule
(11.11.2026), which wrote the list for a Next app with a Capacitor shell, in Hebrew and RTL; a Vite app reads "the
root layout's `<head>`" as its `index.html` and skips the lines that name Next. A fail stops the unit. Each planted
case is shown failing first, then passing clean.

1. **Start-up environment proof** (5a).
   - Pass: the server refuses to serve with one planted variable that is not on the allowlist, and with one planted
     value that differs from it. With neither, it serves, and `process.env` read inside the running server and every
     environment value compiled into the client bundle equal the allowlist (on Next, `NEXT_TELEMETRY_DISABLED=1`
     included).
   - Fail: an extra name, a differing value, or a start from a folder that holds a `.env*` file with a value.
2. **Server fence** (5b).
   - Pass: one planted request per transport the server code uses (fetch, `node:http(s)`, the database driver, a
     WebSocket client) and one to a loopback port that is neither the preview's nor the fake backend's, each refused,
     from inside the running server and from inside each process it or the start script starts. The process list
     after the scripted journey holds no Node process without a planted-request result and no other process the plan
     does not name.
   - Fail: any answer, a process with no result, or the dev server unable to reach its own port.
3. **Browser policy** (5b).
   - Pass: every response, worker scripts included, carries `default-src 'self'`, `form-action 'self'` and `base-uri
     'none'` with no other origin in any directive. A planted fetch, image and script to example.com (and one fetch
     from inside a worker when the app starts one) are blocked. No service worker is registered, and the app's worker
     path answers 404.
   - Fail: any answer, `'strict-dynamic'`, or a CDN or any other origin in the policy.
4. **Where the guard loads** (5c).
   - Pass: the guard is the first script in the root layout's `<head>`, and on a cold load and on a warm one it runs
     before every other script: a test script that records the order of `attachShadow` calls and of link creation
     shows none before the guard.
   - Fail: a shadow root or a link created before it.
5. **The app's own forms and controls inside the frame, effect checked** (5c).
   - Pass: a form whose action is a function runs it, rendered on the client and, where the app renders one on the
     server, after hydration; every modifier click, context menu and drag the source search finds keeps its effect;
     a modified click on an app link opens nothing and a modified click on an app submit sends nothing (the two
     expected losses).
   - Fail: any other effect missing.
6. **The frame's planted cases, in Chromium and in WebKit** (5c; WebKit in the Playwright image with no network).
   The cases are the ones point 5 (c)'s proof lists, and the `tel:` console line. The proof is shown failing with the
   `sandbox` attribute removed, again with the shell's `frame-src` removed, and again with the guard removed.
   - Pass: no request, page, popup or navigation outside the preview's two origins.
   - Fail: any.
7. **Links inside shadow roots** (5c).
   - Pass: after load, no `href` in any shadow root on the guard's list, open or closed, points outside the two
     origins, a link added to a root later included.
   - Fail: any.
8. **Destination scan and ledger** (5c), on the app's source, on the bodies the journey received and on a local
   build of the preview's mode.
   - Pass: every occurrence is on the ledger; and each planted case fails the scan: a form whose action is a
     real-looking host, a `wa.me` link inside a dependency's file, a bare number of the app's country in a source
     file, and a second builder, in a new file, for a host already on the ledger.
   - Fail: a planted case passes, or a ledger line marks an opened or shown destination as neutralized by a blocked
     host.
9. **Static fault checks** (5c).
   - Pass: a planted `shadowrootmode` in a served script file, a planted `setHTMLUnsafe` call and a planted
     `document.write` in the app's own code each fail the check.
   - Fail: one of them passes.
10. **Scripted journey** (5b, 5c).
    - Pass: the recorded requests include no other origin; the scan after each screen finds no link or form
      destination outside the two origins in any document of the frame or any shadow root on the guard's list; no
      `Location` header outside the two origins comes from the app's server or the fake backend; and the app's port
      opened at top level, without the check script's flag, renders only the notice.
    - Fail: any of these.
11. **Data** (5c).
    - Pass: every email address in the fake data and in the fake backend's recorded responses is `.invalid` or
      `example.com`, and every phone number is in a reserved range or one digit short.
    - Fail: a valid number of the app's country outside a reserved range, or a real mail domain.
12. **The top-level run for the phone's layout** (5c, the frame bullet).
    - Pass: with the check script's flag, in a test browser that aborts every request outside the preview's origins,
      the screens unit 1 listed (safe areas, the keyboard's resize, the bottom bar, in RTL at mobile width) are
      checked at top level, and each difference from the framed run is listed with its cause.
    - Fail: a difference that is not listed, or the flag set for a preview anyone plays.
13. **On the phones Nadav uses, by hand, in the browser, never inside the native shell** (5c).
    - Pass: a `tel:` tap, a `wa.me` tap, a long press on a link and a long press on a link inside a closed shadow root
      each end on the local page; "open in new tab" from a long-press menu lands on the notice at top level; no
      invented number or address in the text has become a link.
    - Fail: anything else. What cannot be shown on his devices is listed in the report as not shown
      (`preview-floor-notes.md`, "Unproven until a real unit 1").
14. **No-demo check** (point 4), locally for unit 1 and in the landing CI after it; for a Capacitor or Expo app
    also in the OTA bundle's build command.
    - Pass: a planted import from the demo folder fails the web build and the OTA bundle's build.
    - Fail: either builds.
