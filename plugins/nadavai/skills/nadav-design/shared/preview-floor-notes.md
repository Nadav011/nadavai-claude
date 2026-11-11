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

## The shell frame and the guard (run on 11.11.2026 with Playwright 1.65 and React 19.3.1)

`dev/probes/frame-sandbox/probe.cjs` runs twenty-four ways out of an app page in three set-ups: in a sandboxed frame
(`sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`, the shell on a second port with `frame-src` set
to the app's origin only) with a guard in the app; in the same frame with no guard; and at top level with neither (the
control). The guard does four things. It points every `<a href>` and `<area href>` that leaves the two origins at a
local page (a `javascript:` href is left alone). It cancels the browser's default, never the app's handlers, for a
click with a modifier key or another button where the event's path holds a link or a submit control, for the context
menu where it holds a link or an image, and for a drag of a link the app did not make draggable. It cancels every form
submission whose destination is outside the two origins, except the two placeholders React writes for a function
action (one in the browser, one on the server). And through a wrapped `attachShadow` it registers those listeners, and
runs the same rewrite with its observer, on every shadow root. The app page in the probe sets no policy of its own.
The test browser aborts and records every request that is not to 127.0.0.1. Cases that attempted a request outside:

| Browser | frame + guard | frame only | top level (control) |
|---|---|---|---|
| Chromium 158 | 0 of 24 | 10 of 24 | 17 of 24 |
| WebKit 27.2 | 0 of 24 | 0 of 24 | 12 of 24 |
| Firefox 159 | 0 of 24 | 5 of 24 | 17 of 24 |

- Frame only, what went out. Chromium: a middle click, a Ctrl+click and a Shift+click on a link to another origin; a
  middle click on an SVG `<a xlink:href>` and on a link inside a closed shadow root; a Ctrl+click and a Shift+click on
  a form's submit button; Shift+Enter in a form with one field and no button, in the page and inside a closed shadow
  root; and a Shift+click on a button whose `formaction` is another origin. Each form went to the other origin in a
  new page. A middle click on a submit button sent nothing. Firefox: the three clicks on the link, and the middle
  clicks on the SVG link and on the link in the closed shadow root. WebKit: none.
- Frame only, what did not go out in any of the three: `location.assign` and `location.replace` to another origin, a
  plain click on a link to another origin, `window.open`, an `<a target="_blank">`, a write to `top.location` (it
  throws `SecurityError`), a plain form post to another origin, and plain clicks on `tel:`, `mailto:` and `sms:` links
  and `location.href = 'tel:…'`.
- With the guard, none of the twenty-four went out in any of the three.
- The app's own controls, in all three browsers and in each set-up (with the guard and without): a Shift+click on a
  checkbox ran the app's handler and checked it; a right click on a cell ran the app's context-menu handler; a drag
  that starts on an image inside the app's draggable card dropped on its drop zone (Playwright's `dragAndDrop`); with
  React 19.3.1, a form whose `action` is a function and a button whose `formAction` is a function each ran it once,
  rendered in the browser and rendered on the server then hydrated (after hydration the attribute still held the
  server's text, and React reported no hydration error); and a plain click on an `<a href="javascript:void(0)">` ran
  the app's handler and left the frame on the app's page. A draggable card that is itself a link was not run here (in
  the eleventh review's run it did not drop with the guard or without it, so that harness shows nothing either way).
- React's form actions (the eleventh review's run in Chromium 158, React 19.3.1, with the app's own policy on, then
  this probe). For a function `action` or `formAction` React writes `javascript:throw new Error('A React form was
  unexpectedly submitted…` into the attribute, and its submit listener runs the function only when the submission is
  not already cancelled. A guard that cancelled every submission whose destination is not one of the two origins
  cancelled that placeholder too, and the function ran 0 times; with the placeholder left alone it ran once, as it
  does with no guard. The guard here matches the start of React's own text, so a hand-written `javascript:` action is
  still cancelled. React's server renderer writes another text, `javascript:throw new Error('React form unexpectedly
  submitted.')`, and hydration keeps it: a guard that left only the browser's text alone cancelled it and the function
  ran 0 times (the twelfth review's run), and with both left alone it ran once (this probe). Next's server actions
  were not run by anyone.
- What the preview loses besides a modified click (the twelfth review's run in Chromium 158, not part of this probe).
  Shift+Enter in a function-action form that has a submit button ran the action 0 times with the guard and once
  without it: the click the browser implies on the default button carries the Shift key, and the click layer cancels
  it. In a form with one field and no button it ran once either way. A guard that also rewrote `javascript:` links
  sent a plain click on one to the local page; the guard here leaves them, since such a link runs in place and its
  modified clicks are cancelled by the click layer.
- Links inside shadow roots. With the guard, in all three browsers, after load the `href` of a link in an open root,
  of one in a closed root, and of one added to the closed root later each pointed at the local page; without it each
  kept its outside address. (A guard that swept and observed the document only left all of them as they were: the
  eleventh review's run.) The check script reaches a closed root only through the guard's own list of the roots it
  wrapped; read through that list, the probe found the three roots and the same rewritten addresses. A guard that
  adopted its stylesheet into a root of another document (a template's content, `createHTMLDocument`) made
  `attachShadow` throw `NotAllowedError` there (the twelfth review's run); the guard here catches that and adopts
  nothing in such a root.
- At top level with neither: every navigation, popup and post to another origin went out in all three, and so did
  every form case sent with a modifier key, in the page and in the closed shadow root; the modifier and middle clicks
  on a link (the SVG link and the link in the closed root included) went out in Chromium and Firefox, and made no
  request in WebKit.
- Not stopped by `form-action 'self'` either (Chromium 158 with the app's own policy on, not part of this probe: the
  clicks in the frame and at top level in the eighth review's run, Shift+Enter in the frame in the ninth's, and
  Shift+Enter at top level in the tenth's): a Ctrl or Shift click on the submit button of a form to another origin,
  and a Shift+Enter in a form with one field and no button, each sent the form in a new page. A plain click and Enter
  were refused by `form-action`.
- Shadow roots and events (the tenth review's run in Chromium 158, with the app's own policy on; this probe repeats
  the closed root cases with no policy): `submit` does not leave its shadow root, and a closed root hides its inner
  path from a listener on the window, so a guard that listens on the window only let the form and the link in a closed
  root through. The same listeners registered on every shadow root through a wrapped `attachShadow` stopped them.
- A root the wrapper cannot see. A closed declarative root written by `document.write` from a script file, so that no
  served HTML held `shadowrootmode`, sent its one-field form out on Shift+Enter under the guard (the eleventh review's
  run in Chromium 158, not part of this probe). A declarative `<template shadowrootmode>` in served HTML, and a root
  parsed by `setHTMLUnsafe` or `parseHTMLUnsafe`, were not run by anyone. The rule makes all of them a fault of the
  check script; a root a dependency assembles at run time from parts is not caught by that static check, and what
  catches a real destination inside it is the destination scan.
- How a refused hand-off to another app shows. At top level a `tel:`, `sms:` or `mailto:` link makes no request and no
  page in any of the three (Chromium and WebKit print nothing; Firefox prints "Prevented navigation to … due to an
  unknown protocol" for `tel:` and `sms:`, and nothing for `mailto:`), so the control cannot show a hand-off. In the
  frame: WebKit prints "Refused to load tel:… because it does not appear in the frame-src directive"; Firefox reports
  a `frame-src` block that names the `tel:` URL, and refuses `mailto:` by the sandbox ("Blocked navigation to custom
  protocol … from a sandboxed context"); Chromium prints "Framing '' violates … frame-src", which does not name the
  URL, and its frame then shows `chrome-error://chromewebdata/`.
- `navigator.share` did not exist in any of the three, so that case is not testable in them.
- What the guard's rewrite of links does not reach (the eighth review's run in Chromium, not part of this probe): an
  SVG `<a xlink:href>`, a link resolved through a `<base>` on another origin, a link in a `srcdoc` frame, and a
  server-rendered link clicked before the guard has run. For those the guard relies on cancelling the click by the
  event's path, which this probe shows for the SVG link; the `srcdoc` frame needs the guard installed in that document
  too. The rule therefore asks for `base-uri 'none'`, for the guard in every same-origin document of the frame, and
  for the scans of (c).
- The shell's own policy (`default-src 'self'`) refuses an inline `style` attribute on the frame, so the probe sizes
  the frame with `width` and `height` attributes; at the browser's default frame size (300 by 150) the test browser's
  drag did not start, with the guard or without it.
- The app must allow being framed by the shell (no `X-Frame-Options: DENY`, and a `frame-ancestors` that names the
  shell's origin when it sets one). On Next the allowlist also sets `NEXT_TELEMETRY_DISABLED=1`, so Next does not try
  its telemetry host, which the fence would refuse.

## What a real app's client code holds (the eleventh review's read of the clinic app, 11.11.2026)

Read-only, on therapy-flow-v2's source and a client build of it from September (353 script files). It is why the
ledger of (c) is kept per occurrence and not per host.

- The build held 58 distinct hosts: specification namespaces (`www.w3.org`, `schemas.openxmlformats.org`),
  documentation and error links (`react.dev`, `reactrouter.com`, `developer.mozilla.org`, `github.com`), services
  (`app.posthog.com`, `sentry.io`, `api.qrserver.com`), social and map links (`facebook.com`, `instagram.com`,
  `youtube.com`, `waze.com`, `g.page`), the app's own hosts, and `wa.me` nine times.
- A host tells too little: `github.com` can receive a sign-in and is also where a documentation link points, and
  `wa.me` is one host for every builder and every hard-coded number.
- Contacts sit in the source as bare constants that are not URLs: a sales number as a digit string, a support address
  as a plain email that a template turns into `mailto:`, and a support WhatsApp link with the number in it.
- Minified code holds text that looks like a scheme and is not one (a key such as `whatsapp:!1`), so a scan matches a
  scheme only when an address follows it.

## Unproven until a real unit 1

Nobody has run these. A project's unit 1 shows each one it can on the devices Nadav uses, and lists the rest in its
report as not shown.

- iPhone: whether a long press on a link fires `contextmenu`; whether `-webkit-touch-callout: none` set on the root
  element reaches a link inside a shadow root (by its definition the property inherits, which would carry it into a
  shadow tree; a component library that sets a root's `adoptedStyleSheets` itself replaces the sheet the wrapper
  adopted); and "open in new tab" from the long-press menu.
- Android: whether a cancelled `contextmenu` suppresses the long-press menu on a link, and whether selecting a number
  shown as text offers to call it.
- Desktop: the Cmd key, the browser's own context-menu items on a link, and a drag of a link to the tab bar.
- Next: that the guard runs before every chunk on a cold and a warm load; how React treats an `href` the guard
  rewrote, at hydration and on a later render (a mismatch line in the console is expected and was neither measured nor
  cited); a Next server action (a form whose `action` is empty) after hydration.
- React: the two placeholder texts the guard leaves alone are React's internals, so unit 1 reads them from the React
  the app installs (Next bundles its own).
- Component libraries: whether one in the app assigns `adoptedStyleSheets` (which drops the sheet the guard adopted)
  or attaches shadow roots in another document.
- The dev server: whether it connects to itself on a port the connection fence refuses.
- The ledger: how many lines a real build needs, and whether its false matches leave it readable.
- A draggable card that is itself a link, and a link the app's router handles on a modified click.
