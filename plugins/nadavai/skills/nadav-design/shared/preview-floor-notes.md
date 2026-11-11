# Notes for the preview's floor

Measured facts and framework notes behind `rules.md`, «An app is built once», point 5. The rule is there; this file
holds only what was checked, when, and how to check it again. A note here is an example, never a replacement for a
proof the rule asks for: a project's unit 1 shows its own proofs on its own preview.

## Environment variables (checked against the docs on 11.11.2026)

- Vite: a variable already in the environment wins over the `.env` files
  (https://vite.dev/guide/env-and-mode), and every `process.env` variable with the env prefix (`VITE_` unless
  `envPrefix` names another) goes into `import.meta.env`, with `.env` loading on or off. So the environment is
  emptied before Vite starts (spawned with the allowlist only, or `process.env` reduced to it before Vite's server
  is created). `envDir: false` turns the files off (https://vite.dev/config/shared-options; `envFile: false` is its
  deprecated name). The app's `vite.config` calls no `loadEnv` in the preview's mode, since `loadEnv` reads the files
  of the folder it is given whatever `envDir` says.
- Next: it loads `.env`, `.env.local`, `.env.<NODE_ENV>` and `.env.<NODE_ENV>.local` from the folder it is started
  on (the one given to `next`, otherwise the working directory), `process.env` wins over them, and `NEXT_PUBLIC_*`
  values are inlined into the client bundle (https://nextjs.org/docs/app/guides/environment-variables). So Next
  starts with the emptied environment, from a folder where none of those files holds a value (a fresh `git worktree`
  of the commit has no untracked ones); the start script refuses to start otherwise, and never deletes or moves such
  a file. A file Next does not load, such as a committed `.env.example`, does not stop it. Installing dependencies is
  not part of the start script and runs before the fence.

## The server's connection fence (run on Node v24.22.2, 11.11.2026)

`dev/probes/connect-fence/` holds a preload that refuses `net.Socket.prototype.connect` to anything but the loopback
ports it is given, and a probe (`node probe.cjs`). The probe's "outside" target is 127.0.0.2 with a listener on it,
a loopback address the fence does not allow, so nothing leaves the host and an unfenced connection shows as reached.

- Refused: `node:http`, `node:https`, fetch (http and https), `node:http2`, `net.connect`, `net.createConnection`, a
  raw `new net.Socket().connect()` as `pg` opens one, `tls.connect`, the global WebSocket, a unix socket path, and
  another loopback port. The allowed port was reached by `node:http` and by fetch.
- Not refused: a UDP send (`node:dgram`). Not tested, and outside any preload: a native addon that opens its own
  socket, and a child process that is not Node.
- A Node child is fenced only when the preload is loaded into it: with `NODE_OPTIONS=--require=<path>` in an
  inherited environment, `fork` and `spawn` were fenced; a child spawned with an environment that lacks
  `NODE_OPTIONS` reached the target. (Patching `net.connect` and `tls.connect` instead of the prototype let
  `node:http` and a raw socket through: the fifth review's run, not part of this probe.)
- A container or a network namespace fences every process and protocol at once. Docker's `--network none` cannot
  publish a port, and a bridge network has egress, so the planted requests show which one a setup really is.

## The shell frame and the guard (run on 11.11.2026 with Playwright 1.65)

`dev/probes/frame-sandbox/probe.cjs` runs twenty-one ways out of an app page in three set-ups: in a sandboxed frame
(`sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`, the shell on a second port with `frame-src`
set to the app's origin only) with a guard in the app; in the same frame with no guard; and at top level with
neither (the control). The guard points every `<a>` and `<area>` that leaves the app's origin at a local page;
cancels the browser's default, never the app's handlers, for a click with a modifier key or another button, the
context menu and a drag, where the event's path holds a link or a submit control; and cancels every form
submission whose destination is outside the two origins. The app page in the probe sets no policy of its own. The
test browser aborts and records every request that is not to 127.0.0.1. Cases that attempted a request outside:

| Browser | frame + guard | frame only | top level (control) |
|---|---|---|---|
| Chromium 158 | 0 of 21 | 7 of 21 | 14 of 21 |
| WebKit 27.2 | 0 of 21 | 0 of 21 | 11 of 21 |
| Firefox 159 | 0 of 21 | 3 of 21 | 14 of 21 |

- Frame only, what went out. Chromium: a middle click, a Ctrl+click and a Shift+click on a link to another origin;
  a Ctrl+click and a Shift+click on a form's submit button; Shift+Enter in a form with one field and no button; and
  a Shift+click on a button whose `formaction` is another origin. Each form went to the other origin in a new page.
  A middle click on a submit button sent nothing. Firefox: the three clicks on the link. WebKit: none.
- Frame only, what did not go out in any of the three: `location.assign` and `location.replace` to another origin,
  a plain click on a link to another origin, `window.open`, an `<a target="_blank">`, a write to `top.location` (it
  throws `SecurityError`), a plain form post to another origin, and plain clicks on `tel:`, `mailto:` and `sms:`
  links and `location.href = 'tel:…'`.
- With the guard, none of the twenty-one went out in any of the three.
- The app's own controls under the guard, in all three browsers and all three set-ups: a Shift+click on a checkbox
  ran the app's handler and checked it, and a right click on a cell ran the app's context-menu handler. A drag
  between cells was not run: a test browser did not start a native drag inside the cross-origin frame even with no
  guard (the ninth review's attempt).
- At top level with neither: every navigation, popup and post to another origin went out in all three, and so did
  every form case sent with a modifier key; the modifier and middle clicks on a link went out in Chromium and
  Firefox, and in WebKit opened a new empty page with no request.
- Not stopped by `form-action 'self'` either (the eighth and ninth reviews' runs in Chromium 158, with the app's own
  policy on; not part of this probe): a Ctrl or Shift click on the submit button of a form to another origin, and a
  Shift+Enter in a form with one field and no button, each sent the form in a new page, in the frame and at top
  level. A plain click and Enter were refused by `form-action`. The guard's cancelling of a submission by its
  destination stopped all of them.
- How a refused hand-off to another app shows. At top level a `tel:`, `sms:` or `mailto:` link makes no request and
  no page in any of the three (Chromium and WebKit print nothing; Firefox prints "Prevented navigation to … due to
  an unknown protocol" for `tel:` and `sms:`, and nothing for `mailto:`), so the control cannot show a hand-off. In
  the frame: WebKit prints "Refused to load tel:… because it does not appear in the frame-src directive"; Firefox
  reports a `frame-src` block that names the `tel:` URL, and refuses `mailto:` by the sandbox ("Blocked navigation
  to custom protocol … from a sandboxed context"); Chromium prints "Framing '' violates … frame-src", which does
  not name the URL, and its frame then shows `chrome-error://chromewebdata/`.
- `navigator.share` did not exist in any of the three, so that case is not testable in them.
- Not run: the Cmd key, the browser's context menu on a link, a long press, a drag to the tab bar, and real phones.
  A project's unit 1 shows those by hand on the devices he uses.
- Not covered by the guard's rewrite of links, from the eighth review's run in Chromium (not part of this probe): a
  link inside a shadow root, an SVG `<a xlink:href>`, a link resolved through a `<base>` on another origin, a link
  in a `srcdoc` frame, and a server-rendered link clicked before the guard has run. Cancelling by the event's path
  stopped the person opening any of them in a new page except in the `srcdoc` frame, which needs the guard
  installed in that document too. The rule therefore asks for `base-uri 'none'`, for the guard in every same-origin
  document of the frame, and for a scan of every link and form after each screen of the journey.
- The app must allow being framed by the shell (no `X-Frame-Options: DENY`, and a `frame-ancestors` that names the
  shell's origin when it sets one). On Next the allowlist also sets `NEXT_TELEMETRY_DISABLED=1`, so Next does not
  try its telemetry host, which the fence would refuse.
