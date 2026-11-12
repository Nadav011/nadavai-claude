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

## The shell frame and the guard (last run on 12.11.2026 with Playwright 1.65 and React 19.3.1)

`dev/probes/frame-sandbox/probe.cjs` runs thirty-seven ways out of an app page in four set-ups: in a sandboxed frame
(`sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`, the shell on a second port with `frame-src` set
to the app's origin only) with a guard in the app and the app's own policy on its responses (`default-src 'self'`,
`form-action 'self'`, `base-uri 'none'`, inline script and style allowed), which is the rule's set-up; in the same
frame with the guard and no app policy; in the same frame with neither; and at top level with neither (the control).
The guard does five things. It points every `<a href>`, `<area href>` and MathML element with `href`, every form's
`action` and every `formaction` that leaves the two origins at a local page, and keeps watching them (left alone: a
`javascript:` destination, React's two placeholders, and a `blob:` link of the two origins or a `data:` link when it
carries `download`). It cancels the browser's default, never the app's handlers, for a click with a modifier key or
another button where the event's path holds a link or a submit control, for the context menu where it holds a link or
an image, and for a drag of a link the app did not make draggable. It cancels every form submission whose destination
is outside the two origins, except the two placeholders React writes for a function action (one in the browser, one on
the server). Its listeners are on the window and on each document. Through a wrapped `attachShadow` it registers those
listeners, and runs the same rewrite with its observer, on every shadow root, and through a wrapped `dispatchEvent` on
the top node of a tree that is not in a document before the page's code dispatches an event at any node of it. And it
installs itself in every same-origin `<iframe>` or `<frame>` document: when its frame is added, when the frame loads,
and when the app's code reads the frame's `contentWindow` or `contentDocument`; `window.__guard(win)` installs it
again in a document that `document.open` emptied: it first sends the document an event that a living guard listener
cancels and installs only when none answers, so an app that calls it on every render adds nothing (the sixteenth
review found the earlier installer adding an observer and a set of listeners on each call). What belongs to a window
(the wrappers, the list of roots) is set once for the window, and what belongs to a document (the rewrite, the
listeners) once for each document. The test browser aborts and records every request that is not to 127.0.0.1. Cases
that attempted a request outside:

| Browser | frame + guard + app policy | frame + guard | frame only | top level (control) |
|---|---|---|---|---|
| Chromium 158 | 0 of 37 | 0 of 37 | 19 of 37 | 28 of 37 |
| WebKit 27.2 | 0 of 37 | 0 of 37 | 2 of 37 | 19 of 37 |
| Firefox 159 | 0 of 37 | 1 of 37 | 15 of 37 | 30 of 37 |

- Frame only, what went out. Chromium: a middle click, a Ctrl+click and a Shift+click on a link to another origin; a
  middle click on an SVG `<a xlink:href>` and on a link inside a closed shadow root; a Ctrl+click and a Shift+click on
  a form's submit button; Shift+Enter in a form with one field and no button, in the page, inside a closed shadow
  root, and in the two forms whose own `submit` listener sets the destination; a Shift+click on a button whose
  `formaction` is another origin; and all six cases in a child document the page fills and in a closed shadow root
  made with that document's `attachShadow` (two clicks on a link, two forms, a link and a form in the root); and a
  middle click on an SVG link in a child document emptied by `document.open`. Each form in the page went to the other
  origin in a new page. A middle click on a submit button sent nothing. Firefox: the three clicks on the link; the
  middle clicks on the SVG link and on the link in the closed shadow root; the two clicks on the link and the two
  forms in the child document, and the link in the root made with its `attachShadow`; a Ctrl click that a handler
  dispatches on a link that is not in the document, and one it dispatches on the text node inside such a link; the SVG
  link in the child document emptied by `document.open`; and a middle click and a Ctrl+click on a MathML element with
  `href`. WebKit: the two forms in the child document, which navigated the child in place.
- Frame only, what did not go out in any of the three: `location.assign` and `location.replace` to another origin, a
  plain click on a link to another origin, `window.open`, an `<a target="_blank">`, a write to `top.location` (it
  throws `SecurityError`), a plain form post to another origin, and plain clicks on `tel:`, `mailto:` and `sms:` links
  and `location.href = 'tel:…'`.
- With the guard and the app's policy, none of the thirty-seven went out in any of the three. With the guard and no
  app policy one did, in Firefox: the form in the child document whose `submit` listener sets its destination
  navigated the child there in place. A child document's navigation is fenced by the app's own policy (`form-action`
  and `default-src`), not by the shell's `frame-src`, and Firefox reads the destination before the guard's observer
  runs.
- A destination set during the submit (the thirteenth review's run in Chromium 158, then this probe). The browser
  reads a form's destination after the `submit` event, so a listener that runs after the guard's own can change it.
  Under a guard that only looked at the destination in its `submit` listener, a one-field form whose own listener set
  the `action` attribute, or `form.action`, to another origin went there in a new page on Shift+Enter in Chromium.
  With the guard also rewriting and watching `action` and `formaction`, in Chromium both cases opened the local page
  instead, in a new page, and in WebKit the frame went to the local page; without the guard WebKit's frame refused the
  outside address. In Firefox the frame refused the outside address with the guard and without it: Firefox builds the
  submission before the observer runs, and opens no new page from a form (the fourteenth review tried Shift, Ctrl, Alt
  and Meta with Enter). At top level with neither, both went out in all three.
- Child documents (the fourteenth review's run, then this probe). A same-origin `about:blank` frame that the page's
  code fills has no script of its own, and a guard that ran only in the page's document was not in it: with the frame
  and the app's policy, a middle and a Ctrl click on a link there, a Shift+Enter in a form there, and the same in a
  closed shadow root made through that document's `attachShadow` went out in Chromium (7 of 9) and Firefox (4 of 9).
  With the guard installing itself in the child, none did. Chromium gives the frame's window a new document when the
  frame loads and keeps the window, so a guard that kept its list of roots for each document lost the roots made
  before the load (measured here); the list is kept for each window. A walk over every document under the frame, which
  plants a link and dispatches a Ctrl click on it, found the link rewritten and the click cancelled in the page and in
  each child with the guard, and neither without it (with the frame alone in Chromium the walk's own click sends the
  frame to an error page, after which the children cannot be evaluated; in WebKit and Firefox the probe recorded the
  request for the walk's own link, which the test browser aborted).
- A child document emptied by `document.open` (the fifteenth review's run, then this probe). `document.open` keeps the
  Document object and removes its listeners; the guard's observer survived, so links written afterwards were
  rewritten, but an SVG link there, which the rewrite does not reach, went out on a middle click in Chromium and
  Firefox, and the walk reported the click not cancelled. An installer that skipped a document it had seen did nothing
  when the app called it. With the installer clearing the document's mark first, the walk found the click cancelled
  there and the SVG link went nowhere, in all three.
- A shadow root the guard never wrapped (the fifteenth review's run, then this probe in Chromium). In one task a
  script appended a frame, took `attachShadow` from `window.frames[i].Element.prototype` (a read that goes through no
  getter the guard wraps, before its observer has run) and made a closed root with it on an element of the page: a
  middle and a Ctrl click on a link in that root went out in Chromium and Firefox, and a Shift+Enter in a form there
  in Chromium, while the walk passed in every document. Read through the DevTools protocol (`DOM.getDocument` with
  `pierce`), the page's author roots were four, each on a guard list. With two roots planted (that one, and the clone
  of a closed `clonable` root, below) they were seven, and the two planted ones were on none. A host is matched as an
  element: the probe stamps the host of every root on a guard list with an attribute that carries a token of that pass
  and reads the stamp back from the protocol's tree. Matching by id passed a clone made a task later, which keeps its
  host's id; comparing counts passes an unguarded root when a guarded one is missing from the listing, and passes 0
  against 0, so a count is only ever an extra check (the sixteenth review). The protocol check exists in Chromium
  only. A root is made by the app's code, which is the same in every engine, so Chromium's listing stands for the
  other two, except for code that branches on the engine (unproven list).
- The app's frame in a process of its own (the sixteenth review's run, then this probe in Chromium). With
  `Origin-Agent-Cluster: ?1` on the app's responses, or Chromium started with `--isolate-origins`, the page's protocol
  session listed one document, the shell's, and no author root, so a check on that session alone passed with an
  unguarded root in place; the walk passed too. `newCDPSession(frame)` on the app's frame listed its documents and
  every root. Without the header that call throws ("This frame does not have a separate CDP session, it is a part of
  the parent frame's session"), so a script tries it for each frame and keeps the page's session where it throws. In
  this probe, with the header and the two planted roots: two sessions, the page's own listing 1 document and the two
  together 5 for the browser's 5 frames, 7 author roots, the two planted ones on no guard list. The probe counts the
  documents listed against the frames the test browser has; the rule counts them, the shell's own apart, against the
  documents the walk visited, which is the same number here.
- Clones of a `clonable` root (the sixteenth review's run; this probe plants one for the protocol check only). A root
  made through the wrapped `attachShadow` with `clonable: true` is copied by the browser when its host is cloned, and
  no wrapper sees the copy. Under the rule's set-up a middle click and a Ctrl click on a link in a closed clone, a
  middle click on an SVG link in it, a Shift+Enter in a form in an open clone and an SVG link in a clone made a task
  later went out in Chromium (5 of 5) and, the form apart, in Firefox (4 of 5); none did in WebKit. The walk passed.
  The protocol check, matching hosts as elements, fails on every clone.
- A native taken from a frame's window (the sixteenth review's run, not part of this probe). In the task that appended
  a frame, a script read `window.frames[n].EventTarget.prototype.dispatchEvent`, which the guard had not reached; a
  button's handler later dispatched a Ctrl click with it on a link to another origin that was not in the document.
  Under the rule's set-up Firefox opened a new page to it; Chromium, whose frame went to `chrome-error://`, and WebKit
  made no request. The walk passed in both documents, and no root is involved, so neither generic check fails on it:
  the destination rules are all that stands behind that click.
- A document the guard cannot be in (the fifteenth review's run, not part of this probe): an `<iframe
  sandbox="allow-scripts allow-forms" srcdoc>` has an opaque origin, and installing the guard there throws. A middle
  click, a Ctrl click and a Shift+Enter there went out in Chromium under the rule's set-up, the two clicks in Firefox,
  none in WebKit. The walk reaches that document and reports the link not rewritten and the click not cancelled; a
  walk that skipped documents by URL or by `location.origin` would miss it, since both read `about:blank` or `null` in
  every such child. An `<object>` of a same-origin page that does not carry the guard went out in Chromium and Firefox
  too, and the walk failed on it in all three. A `data:` frame is opaque whatever its sandbox says: its
  `contentDocument` was `null` with `sandbox="allow-scripts allow-same-origin"` and with no sandbox, in all three,
  while the same content as `srcdoc` under that sandbox was reachable and had the page's origin (the sixteenth
  review's run). So the flag helps a sandboxed `srcdoc` or same-origin frame only, a `data:` frame is served as
  `srcdoc`, and the flag itself is a switch on a frame that in production often holds HTML the app did not write: the
  rule prefers the stub and makes the switch a build-time constant.
- A listener of the app's on the window (the fifteenth review's run, not part of this probe): a capture listener on
  `window` that stops a modified or middle click ran before a guard that listened on the document only, and an SVG
  link went out in Chromium and Firefox. With the guard's listeners on the window as well, registered first, it did
  not, in all three.
- A click the page dispatches itself (the fourteenth review's run, then this probe). In Firefox a click with `ctrlKey`
  that a handler dispatched on a link opened a new page from the sandboxed frame, whether the link was in the document
  (the walk's own click, in the fifteenth review's run) or not (frame only: out); Chromium and WebKit opened nothing.
  With the guard's `dispatchEvent` wrapper the detached case went nowhere in any of the three. A wrapper that fenced
  only an element target let a Ctrl click dispatched on the text node inside a detached link out in Firefox under the
  rule's set-up (the fifteenth review's run); the wrapper here fences any node, and that case went nowhere in any of
  the three (with the frame alone it went out in Firefox only).
- MathML (the fourteenth review's run, then this probe). In Firefox a MathML element with `href` is a link: a middle
  click and a Ctrl+click on one went out with the frame only, and not with the guard. Chromium and WebKit made no
  request for it in any set-up.
- What only the app's policy stops (the fourteenth review's run in Chromium, not part of this probe): with the frame
  and the guard and no app policy, a `submit` listener that inserted a `<base>` to another origin sent a relative
  action there on Shift+Enter, and a same-origin link with a `ping` to another origin sent the ping on a plain click
  (also in WebKit). `base-uri 'none'` and `default-src` refused both. The guard watches neither.
- What a handler starts by itself while a modifier key is held (this session's run in Chromium 158 with the earlier
  guard and with none, not part of the probe): a Shift, Ctrl or middle click on a plain button whose handler sets a
  form's action to another origin and calls `form.submit()` or `requestSubmit()`, calls `location.assign`, or clicks a
  link it has just created. In the frame none of them went out, with that guard and without it; at top level all but
  the middle click did.
- Downloads. A guard that rewrote every link that is not http or https turned a rendered same-origin `blob:` or
  `data:` `<a download>` into a download of the local page under the app's file name (the thirteenth review's run in
  three browsers, with `allow-downloads`). The guard here leaves a `blob:` link of the two origins or a `data:` link
  alone only when it carries `download`: under a guard that left every such `blob:` link alone, a link without
  `download` sent nothing in the frame, but a middle click opened the `blob:` page in a new page where the guard is
  not (the fourteenth review's run). Whether the right file is saved was not run.
- The app's own controls, in all three browsers and in each of the four set-ups: a Shift+click on a checkbox ran the
  app's handler and checked it; a right click on a cell ran the app's context-menu handler; a drag that starts on an
  image inside the app's draggable card dropped on its drop zone (Playwright's `dragAndDrop`); with React 19.3.1, a
  form whose `action` is a function and a button whose `formAction` is a function each ran it once, rendered in the
  browser and rendered on the server then hydrated (after hydration the attribute still held the server's text, and
  React reported no hydration error); and a plain click on an `<a href="javascript:void(0)">` ran the app's handler
  and left the frame on the app's page. A draggable card that is itself a link was not run here (in the eleventh
  review's run it did not drop with the guard or without it, so that harness shows nothing either way).
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
  In Chromium, Shift+Enter in a function-action form that has a submit button ran the action 0 times with the guard
  and once without it (in WebKit and Firefox it ran under the guard too: the thirteenth review's run): the click the
  browser implies on the default button carries the Shift key, and the click layer cancels it. In a form with one
  field and no button it ran once either way. A guard that also rewrote `javascript:` links sent a plain click on one
  to the local page; the guard here leaves them, since such a link runs in place and its modified clicks are cancelled
  by the click layer.
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
- A PDF the app shows in a frame (the clinic app frames a document from its invoicing provider): plug-ins are off in a
  sandboxed frame, so it is probably blocked or downloaded, and the guard cannot be in a PDF viewer.
- Desktop: "Go to …" on selected text that reads as an address, and a drag of selected text to the tab bar.
- `HTMLElement.prototype.click()` on a link that is not in the document does not pass through `dispatchEvent`; with a
  key held on the button that ran it, it opened nothing in the three browsers (the fifteenth review's run), which is
  today's engines and not a rule.
- An `<embed>` document, which has no `contentDocument` for the guard to wrap; the walk is what shows it.
- The app's frame in a process of its own in a person's own Chrome, which may key processes by origin with no header
  at all: the check script reads every frame's session, and nobody has run it against a real preview.
- Other natives taken from a frame's window before the guard reached it (`addEventListener`, `click`, `submit`):
  `attachShadow` and `dispatchEvent` were measured, and the destination rules stand behind the rest.
- Shadow roots the engine makes without a call the guard wraps, beyond the clone of a `clonable` root: the protocol
  check is what finds them.
- `<fencedframe>`: whether it loads in a sandboxed frame without `allow-popups`, and whether the test browser lists
  it.
- Code that branches on the browser engine and makes a shadow root only outside Chromium, which the protocol check,
  Chromium's alone, does not list.
- Firefox: its own context menu on Shift+right-click, which a cancelled `contextmenu` does not stop; "Open Link in New
  Tab" there uses the link's current address, which the guard rewrote for an `<a>` and not for an SVG `<a>` or a
  MathML `href`.
- A library that builds a same-origin child document (a print view, a rich-text editor in its frame mode), and whether
  the guard survives the way the library fills it.
- An app or a dependency that replaces a DOM method the guard calls (`matches`, `getAttribute`, `preventDefault`); the
  walk after each screen is what shows the guard still works.
- `<link rel="preconnect">` and `dns-prefetch` to another host: no policy fences them; they reveal a host name and
  send nothing of ours, and the destination scan finds a literal one.
- Playwright's Chromium runs with its popup blocker off, so the counts for the frame alone are an upper bound for a
  person's own Chrome.
- The scan: whether a phone-number library finds a bare number written with the country code, no plus and no
  separators (unit 1 plants one in that shape).
- Downloads: whether a library in the app renders `blob:` or `data:` download links, and that they still save the
  right file under the guard.
- WebKit from the Playwright image reaching a preview that listens on loopback (`--network host`).
- React: the two placeholder texts the guard leaves alone are React's internals, so unit 1 reads them from the React
  the app installs (Next bundles its own).
- Component libraries: whether one in the app assigns `adoptedStyleSheets` (which drops the sheet the guard adopted)
  or attaches shadow roots in another document.
- The dev server: whether it connects to itself on a port the connection fence refuses.
- The ledger: how many lines a real build needs, and whether its false matches leave it readable.
- A draggable card that is itself a link, and a link the app's router handles on a modified click.
