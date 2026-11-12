# What unit 1 shows before anyone plays the preview

A reading aid for `rules.md`, «An app is built once», point 5: the proofs of that point in the order unit 1 runs them,
each with its pass and fail condition. It adds no rule. Where this list and point 5 differ, point 5 holds and the
difference is a fault to report («Where a fault goes»). Source: the eleventh independent review of the rule
(11.11.2026), which wrote the list for a Next app with a Capacitor shell, in Hebrew and RTL, corrected against point 5
by the twelfth to the twentieth; a Vite app reads "the root layout's `<head>`" as its `index.html` and skips the lines
that name Next. A fail stops the unit. Each proof is shown failing first, through the planted cases its browser can
show going out, then passing clean.

1. **Start-up environment proof** (5a).
   - Pass: the server refuses to serve with one planted variable that is not on the allowlist, and with one planted
     value that differs from it. With neither, it serves, and `process.env` read inside the running server and every
     environment value compiled into the client bundle equal the allowlist (on Next, `NEXT_TELEMETRY_DISABLED=1`
     included).
   - Fail: an extra name, a differing value, or, on Next, a start from a folder where a `.env*` file Next loads holds
     a value.
2. **Server fence** (5b).
   - Pass: one planted request per transport the server code uses (fetch, `node:http(s)`, the database driver, a
     WebSocket client) and one to a loopback port that is neither the preview's nor the fake backend's, each refused,
     from inside the running server and from inside each process it or the start script starts (one request only when
     the fence is a network namespace or a container). A preview that runs no server code says so in the plan, and
     this step is `n/a` with that reason. The process list after the scripted journey holds no Node process without a
     planted-request result and no other process the plan does not name.
   - Fail: any answer, or a process with no result.
3. **Browser policy** (5b).
   - Pass: every response, worker scripts included, carries `default-src 'self'`, `form-action 'self'` and `base-uri
     'none'` with no other origin in any directive (a meta tag first in `<head>` is enough only for a page that starts
     no worker from a URL). A planted fetch, image and script to example.com (and one fetch from inside a worker when
     the app starts one) are blocked. No service worker is registered, and the app's worker path answers 404.
   - Fail: any answer, `'strict-dynamic'`, or a CDN or any other origin in the policy.
4. **Effects, provider by provider** (5c, its first part).
   - Pass: for every provider the production app uses (messaging, payment, jobs, webhooks, analytics, auth; read from
     the env example, the deploy config and the HTML), the script prints that its key is absent from the resolved
     environment and that one planted browser fetch and one planted server request to its host, with no credentials
     and never to a send endpoint, were blocked. The start script starts no scheduler, queue worker or cron runner.
     Sign-in reaches only the fake backend.
   - Fail: a provider with no line, a key present, or an answer from a provider's host.
5. **Where the guard loads** (5c).
   - Pass: the guard is the first script in the root layout's `<head>`, installs itself in every other same-origin
     `<iframe>` or `<frame>` document of the frame (a `srcdoc`, `about:blank` or other child frame; the walk of step
     11 is what shows it there, and what fails on a document it is not in), and runs before any other script on a cold
     load and on a warm one (one way to show it: a test script that records `attachShadow` calls and link creation
     finds none before the guard). Every HTML response the journey records and every HTML file in the public folder
     holds it before any script that is not `async`, `defer` or a module (the framework's own chunk tags may come
     first in the file); on Next `app/global-error` carries it as well.
   - Fail: a script that ran, a shadow root or a link made before it; or an HTML document the preview serves without
     it, or with a script before it that is not `async`, `defer` or a module.
6. **The app's own forms and controls inside the frame, effect checked** (5c).
   - Pass: one of each kind the app has keeps its effect: a modifier click, a context menu, a drag, and a form whose
     action is a function, rendered in the browser and, where the app renders one on the server, after hydration. The
     expected losses, and only these: a modified or middle click on an app link opens nothing; a modified click on an
     icon drawn with an SVG `<use>` loses the browser's default for it, while the app's handler runs; the browser's
     own menu does not open over a link, an `<a>`, an image or a `<use>` icon; a library's context menu or
     modified-click action over such an element, or a modified click on a submit control, does not run where the
     library checks `defaultPrevented` before its own step (Radix does), while a plain click is untouched; a modified
     click on an app submit, or Shift+Enter in a form that has a submit button (in Chromium), sends no form and runs
     no form action.
   - Fail: any other effect missing.
7. **The frame's planted cases, in Chromium and in WebKit** (5c; WebKit in the Playwright image as `working-style.md`
   routes it, with `--network host` so it reaches a preview that listens on loopback, and with every request outside
   the preview's origins aborted and recorded). The cases are the ones point 5 (c)'s proof lists, the `tel:` console
   line, and a cross-origin `<a download>` when the frame allows downloads. The proof is shown failing with the
   `sandbox` attribute removed, again with the shell's `frame-src` removed, and again with the guard removed.
   - Pass: no request, page, popup or navigation outside the preview's two origins.
   - Fail: any.
8. **Links inside shadow roots** (5c).
   - Pass: after load, no `href` in any shadow root on the guard's list, open or closed, points outside the two
     origins, a link added to a root later included.
   - Fail: any.
9. **Destination scan and ledger** (5c), on the app's own source, HTML, public files and fake data, on the bodies the
   journey received and on a local build of the preview's mode, with escaped text read unescaped and a served source
   map read like any other file.
   - Pass: every occurrence is on the ledger; and each planted case fails the scan: a form whose action is a
     real-looking host, a `wa.me` link inside a dependency's file, a bare number of the app's country in a source
     file, written the way the app writes its own (for example the country code and the digits with no plus and no
     separators), and a second builder, in a new file, for a host already on the ledger.
   - Fail: a planted case passes; a ledger line marks an opened or shown destination as neutralized by a blocked host;
     or a fixed contact is marked neutralized by a switched builder and not replaced.
10. **Static fault checks** (5c).
    - Pass: a planted `shadowrootmode` and a planted `shadowrootclonable` in served HTML and in a served script file,
      a planted `setHTMLUnsafe` and `parseHTMLUnsafe` call and a planted `clonable` option of `attachShadow` in the
      client code, a planted `document.open`, `document.write` or `document.writeln` in the app's own code, a planted
      HTML file in the public folder that holds no guard, and a planted SVG file there that holds a link each fail the
      check.
    - Fail: one of them passes.
11. **Scripted journey** (5b, 5c).
    - Pass: the recorded requests include no other origin; the walk after each screen visits at least one document and
      finds the guard working in every document under the frame, whatever its URL or origin (a link the script plants
      is rewritten, and a Ctrl click it dispatches on that link comes back cancelled; a document the guard cannot be
      in, one the walk cannot evaluate, and a request or a navigation the walk causes each fail it); in Chromium the
      shadow roots read through the DevTools protocol, on the page's session and on the session of each frame in a
      process of its own, each have a host that is the host of a root on a guard list (the same object, resolved
      through the protocol and asked of the guard lists; not an id, a count or a mark), and the documents listed, the
      shell's own apart, are not fewer than the documents the walk visited; that check is shown failing on a closed
      root that planted code makes through `window.frames[i]`'s `attachShadow` in the task that made the frame and on
      the clone of a planted `clonable` root, once as the preview runs and once with `Origin-Agent-Cluster: ?1` on the
      app's responses; the scan after each screen finds no link or form destination outside the two origins in any
      document of the frame or any shadow root on the guard's list, no link or form to the local page, the guard's or
      the app's own, whose first address is neither inert on the ledger nor invented, and no contact the ledger marks
      as replaced, read as the destination scan reads; no `Location` header outside the two origins comes from the
      app's server or the fake backend; and the app's port opened at top level, without the check script's flag,
      renders only the notice.
    - Fail: any of these.
12. **Data** (5c).
    - Pass: every email address in the fake data and in the fake backend's recorded responses is `.invalid` or
      `example.com`; every URL in them is on the preview's origin and every host name is `.invalid`, `example.com` or
      the preview's own; and every phone number is in a reserved range or one digit short.
    - Fail: a valid number of the app's country outside a reserved range, a real mail domain, or a URL to another
      origin.
13. **The top-level run for the phone's layout** (5c, the frame bullet).
    - Pass: with the check script's flag, in a test browser that aborts every request outside the preview's origins,
      the screens unit 1 listed (safe areas, the keyboard's resize, the bottom bar, in RTL at mobile width) are
      checked at top level, and each difference from the framed run is listed with its cause.
    - Fail: a difference that is not listed, or the flag set for a preview anyone plays.
14. **On the phones Nadav uses, by hand, in the browser, never inside the native shell** (5c).
    - Pass: a `tel:` tap, a `wa.me` tap, a long press on a link and a long press on a link inside a closed shadow root
      each end on the local page; a guarded link that does open in a new tab shows the local page at top level, with
      the address as text.
    - Fail: anything else. What cannot be shown on his devices is listed in the report as not shown
      (`preview-floor-notes.md`, "Unproven until a real unit 1").
15. **No-demo check** (point 4), locally for unit 1 and in the landing CI after it; for a Capacitor or Expo app also
    in the OTA bundle's build command.
    - Pass: a planted import of a demo-folder module that holds no invented data, which production code uses so that
      the bundler keeps it (an unused import is dropped and leaves nothing to find), fails the web build's check and
      the OTA bundle's build (the check reads the build's module list or its source maps' `sources`, the server's as
      well as the browser's, not only the invented data's markers); where the preview shows a frame of the app with
      `allow-same-origin` or as `srcdoc`, that variant is such a module.
    - Fail: the check passes with that import, the OTA bundle builds with it, or, on the clean build, the production
      build's module list or any of its source maps, the server's included, names a module of the demo folder.
