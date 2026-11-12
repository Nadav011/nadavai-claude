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

`dev/probes/frame-sandbox/probe.cjs` runs forty-two ways out of an app page in four set-ups: in a sandboxed frame
(`sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`, the shell on a second port with `frame-src` set
to the app's origin only) with a guard in the app and the app's own policy on its responses (`default-src 'self'`,
`form-action 'self'`, `base-uri 'none'`, inline script and style allowed), which is the rule's set-up; in the same
frame with the guard and no app policy; in the same frame with neither; and at top level with neither (the control).
The guard does five things. It points every `<a href>`, `<area href>` and MathML element with `href` (matched by its
namespace, wherever it sits), every form's `action` and every `formaction` that leaves the two origins at a local
page, and keeps watching them (left alone: a `javascript:` destination, React's two placeholders, and a `blob:` link
of the two origins or a `data:` link when it carries `download`). It cancels the browser's default, never the app's
handlers, for a click with a modifier key or another button where the event's path holds a link or a submit control,
for the context menu where it holds a link or an image (for these two a link is also any `<a>` and any SVG `<use>`),
and for a drag of a link the app did not make draggable. It cancels every form submission whose destination is outside
the two origins, except the two placeholders React writes for a function action (one in the browser, one on the
server). Its listeners are on the window and on each document. Through a wrapped `attachShadow` it registers those
listeners, and runs the same rewrite with its observer, on every shadow root, and through a wrapped `dispatchEvent` on
the top node of a tree that is not in a document before the page's code dispatches an event at any node of it. And it
installs itself in every same-origin `<iframe>` or `<frame>` document: when its frame is added, when the frame loads,
and when the app's code reads the frame's `contentWindow` or `contentDocument`; `window.__guard(win)` installs it
again in a document that `document.open` emptied: it first sends the document an event that a living guard listener
answers by setting a flag in the guard's own closure, and installs only when none answers, so an app that calls it on
every render adds nothing (the sixteenth review found the earlier installer adding an observer and a set of listeners
on each call; on the next one, which read the event's cancelled state, the seventeenth counted 0 listeners added by 20
calls on a live document and 12 by the first call after `document.open`, and found that a listener of the page's with
the ping's name made it skip, which the walk caught). In a document that runs a guard script of its own (a frame that
loads one of the app's pages) the first call adds one more set of listeners, because that guard's flag is in another
closure, and later calls add none (the eighteenth review: 12 on the first of 20 calls, then 0; the click there stayed
cancelled). What belongs to a window (the wrappers) is set once for the window, the list of roots once for the guard,
and what belongs to a document (the rewrite, the listeners) once for each document. The test browser aborts and
records every request that is not to 127.0.0.1. Cases that attempted a request outside:

| Browser | frame + guard + app policy | frame + guard | frame only | top level (control) |
|---|---|---|---|---|
| Chromium 158 | 0 of 42 | 0 of 42 | 22 of 42 | 31 of 42 |
| WebKit 27.2 | 0 of 42 | 0 of 42 | 2 of 42 | 19 of 42 |
| Firefox 159 | 0 of 42 | 1 of 42 | 19 of 42 | 34 of 42 |

- Frame only, what went out. Chromium: a middle click, a Ctrl+click and a Shift+click on a link to another origin; a
  middle click on an SVG `<a xlink:href>` and on a link inside a closed shadow root; a Ctrl+click and a Shift+click on
  a form's submit button; Shift+Enter in a form with one field and no button, in the page, inside a closed shadow
  root, and in the two forms whose own `submit` listener sets the destination; a Shift+click on a button whose
  `formaction` is another origin; and all six cases in a child document the page fills and in a closed shadow root
  made with that document's `attachShadow` (two clicks on a link, two forms, a link and a form in the root); a middle
  click on an SVG link in a child document emptied by `document.open`; a middle and a Ctrl click on a `<use>` of an
  SVG link; and a middle click on an SVG `<a>` whose address only a `<set>` gives. Each form in the page went to the
  other origin in a new page. A middle click on a submit button sent nothing. Firefox: the three clicks on the link;
  the middle clicks on the SVG link and on the link in the closed shadow root; the two clicks on the link and the two
  forms in the child document, and the link in the root made with its `attachShadow`; a Ctrl click that a handler
  dispatches on a link that is not in the document, and one it dispatches on the text node inside such a link; the SVG
  link in the child document emptied by `document.open`; a middle click and a Ctrl+click on a MathML element with
  `href`, inside `<math>` and outside it; and a middle and a Ctrl click on a `<use>` of an SVG link. WebKit: the two
  forms in the child document, which navigated the child in place.
- Frame only, what did not go out in any of the three: `location.assign` and `location.replace` to another origin, a
  plain click on a link to another origin, `window.open`, an `<a target="_blank">`, a write to `top.location` (it
  throws `SecurityError`), a plain form post to another origin, and plain clicks on `tel:`, `mailto:` and `sms:` links
  and `location.href = 'tel:…'`.
- With the guard and the app's policy, none of the forty-two went out in any of the three. With the guard and no app
  policy one did, in Firefox: the form in the child document whose `submit` listener sets its destination navigated
  the child there in place. A child document's navigation is fenced by the app's own policy (`form-action` and
  `default-src`), not by the shell's `frame-src`, and Firefox reads the destination before the guard's observer runs.
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
  before the load (measured here); the list was then kept for each window, and is now one list for the guard (below).
  A walk over every document under the frame, which plants a link and dispatches a Ctrl click on it, found the link
  rewritten and the click cancelled in the page and in each child with the guard, and neither without it (with the
  frame alone in Chromium the walk's own click sends the frame to an error page, after which the children cannot be
  evaluated; in WebKit and Firefox the probe recorded the request for the walk's own link, which the test browser
  aborted).
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
  `pierce`), the page's author roots were four, each on a guard list. With three roots planted (that one, the clone of
  a closed `clonable` root kept beside its host, and a clone that replaced its guarded host, both below) they were
  eight, and each of the three planted ones was the host of no root on a guard list. A host is matched as an element:
  the probe resolves each host the protocol lists to an object in its own page (`DOM.resolveNode`) and calls a
  function on it (`Runtime.callFunctionOn`) that asks the guard list of its own window, and of every window it can
  reach from the top of the app, whether one holds a root whose host is that very object. The guard keeps one list of
  the roots it wrapped and every window it holds returns it whole. With a list for each window, a guarded root was
  reported as the host of no listed root when its frame sat inside a shadow root (`window.frames` does not count such
  a frame) and when a helper frame was removed before or after its wrapped `attachShadow` was used (the nineteenth
  review's run, in the page's process and out of it): the check failed closed and would have stopped a legitimate app.
  With one list, each of those passed and the planted roots still failed; nested frames and a host adopted into
  another document passed either way. The other windows are still asked, because a document that runs a guard script
  of its own keeps its own list. It writes nothing on the page. A mark on the host did not work, because the app can
  copy or move it with the host: one token for the whole pass passed a clone made after the stamp in all 18 of the
  seventeenth review's runs, and a token for each host passed a clone that replaced its host and so carried the only
  copy (the eighteenth review's run, in the page's process and out of it); each of those clones' links went out in
  Chromium and Firefox. The guard defines its list of roots as a property the page's code cannot replace; code written
  to deceive the check can still feed the list (the eighteenth review patched `Array.prototype.filter`), which is not
  what the guard is for. Matching by id passed a clone made a task later, which keeps its host's id; comparing counts
  passes an unguarded root when a guarded one is missing from the listing, and passes 0 against 0, so a count is only
  ever an extra check (the sixteenth review). The protocol check exists in Chromium only. A root is made by the app's
  code, which is the same in every engine, so Chromium's listing stands for the other two, except for code that
  branches on the engine (unproven list).
- The app's frame in a process of its own (the sixteenth review's run, then this probe in Chromium). With
  `Origin-Agent-Cluster: ?1` on the app's responses (the sixteenth review also ran it together with
  `--isolate-origins`; the seventeenth found that the flag alone, on two ports of one host, did not move the frame,
  and that `OriginKeyedProcessesByDefault` changed nothing on 127.0.0.1), the page's protocol session listed one
  document, the shell's, and no author root, so a check on that session alone passed with an unguarded root in place;
  the walk passed too. `newCDPSession(frame)` on the app's frame listed its documents and every root. Without the
  header that call throws ("This frame does not have a separate CDP session, it is a part of the parent frame's
  session"), so a script tries it for each frame and keeps the page's session where it throws. In this probe, with the
  header and the three planted roots: two sessions, the page's own listing 1 document and the two together 5 for the
  browser's 5 frames, 8 author roots, each of the three planted ones the host of no root on a guard list, the same as
  with the frame in the page's process; with the header and nothing planted, 4 documents for 4 frames and 4 roots,
  each listed. The seventeenth review found no arrangement in which the count passed with a document missing (an app
  with no child document, a sandboxed opaque child, the header, three launch configurations). The probe counts the
  documents listed against the frames the test browser has; the rule counts them, the shell's own apart, against the
  documents the walk visited, which is the same number here.
- Clones of a `clonable` root (the sixteenth review's run; this probe plants two for the protocol check only, one kept
  beside its host and one that replaced it). A root made through the wrapped `attachShadow` with `clonable: true` is
  copied by the browser when its host is cloned, and no wrapper sees the copy. Under the rule's set-up a middle click
  and a Ctrl click on a link in a closed clone, a middle click on an SVG link in it, a Shift+Enter in a form in an
  open clone and an SVG link in a clone made a task later went out in Chromium (5 of 5) and, the form apart, in
  Firefox (4 of 5); none did in WebKit. The walk passed. The protocol check, matching hosts as elements, fails on
  every clone.
- Links the event's path does not show (the seventeenth review's run, then this probe). With a click layer that
  matched a link as `a[*|href]`, under the rule's set-up, a middle, a Ctrl and a Shift click on a `<use>` whose target
  is an SVG `<a xlink:href>` in `<defs>` opened a new page to it in Chromium and Firefox: the link the person clicks
  is a copy in a user-agent shadow tree, and from the document the path ends at the `<use>`. A `<use>` of a link in a
  same-origin sprite file went out in Firefox. A middle and a Ctrl click on an SVG `<a>` with no `href` attribute,
  whose address a `<set>` animation gives (`href` or `xlink:href`), went out in Chromium. WebKit refused all of them,
  and the walk passed everywhere. With any `<a>` and any `<use>` counted as a link for a click, an `auxclick` and a
  context menu, the review's eight cases and this probe's three went nowhere in any of the three. What that costs: a
  Shift click on an icon drawn with `<use>` inside a label left the label's checkbox unchanged under the guard in all
  three; without the guard WebKit toggles it and Chromium and Firefox do not; the label's own handler ran each time. A
  component that runs its own step only when the event's default is not prevented loses that step on the events the
  guard cancels (the eighteenth review's run in three browsers, with React 19.3.1 and Radix's `composeEventHandlers`
  copied from the clinic app's dependencies; not part of this probe): a Ctrl click on a trigger's `<use>` icon ran the
  app's handler and skipped the library's step, and a right click on a `<use>` icon or on an image inside a
  context-menu trigger did not open the library's menu (the same holds, read and not run, for a modified click on a
  submit control, which the guard cancels outside a form too), while on the trigger's text both ran and a plain click
  was never affected. Base UI's button does not gate its click that way (read, not run). The drag layer keeps the
  narrower match, so that a draggable card with such an icon keeps its drag. The scan after each screen reads an
  animation's `to`, `from` and `values` for those two attributes, which the earlier scan of `href` and `xlink:href`
  attributes missed.
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
  rule prefers the stub and puts the preview's variant of the frame under the demo folder, swapped in by a build-time
  alias. What the no-demo check has to read (the eighteenth review's run, not part of this probe): a small Vite 8 app
  built for production three ways, with shifts' own `check-no-demo.mjs` run on each. With a constant the bundler
  folds, a demo module with no side effect left nothing in the build; one with a top-level statement left that
  statement; a run-time switch left the whole variant, `allow-same-origin` and `srcdoc` included. The check, a scan
  for the invented data's markers and the folder's name, printed clean on all three, while the source map's `sources`
  named the demo module in the last two. So the rule has the check read the build's module list. The nineteenth review
  ran that check too. On Vite 8 the bundler's module ids and the source map's `sources` agreed and both named the demo
  module for the run-time switch; Vite's manifest names no inner module; and a planted import that the code does not
  use was dropped by the bundler, bare or named, so a planted case has to be used by production code to be found. On
  Next 16.4, with Turbopack and with webpack, a server component under the demo folder was named in a server source
  map only (`experimental.serverSourceMaps`) and in no browser map, while `allow-same-origin` sat in the prerendered
  `server/app/index.html`; a client component showed in both sets of maps.
- A child page that loads without the guard script (the nineteenth review's run, not part of this probe). The guard's
  own install reaches a child frame's new document when the frame is added and at its `load`. A child frame that
  another same-origin page navigated to a page with no guard script of its own (a static file, with an image that kept
  its `load` late) was unguarded until then: a middle and a Ctrl click on its link went out under the rule's set-up in
  Chromium and Firefox, not in WebKit, and the walk run after `load` passed. Reached through the `src` of a new frame
  the same page did not go out. With the guard as that page's first script it went nowhere in any of the three. So
  every HTML file the preview serves carries the guard, the local page included (this probe's local page carries it).
  Where it can sit (the twentieth review's run, not part of this probe): Next 16.4 with Turbopack writes its `async`
  chunk tags before the root layout's `<head>` children (four in that fixture; five and six in the twenty-first
  review's `next start` builds, fifteen under `next dev`), so a guard placed first in that `<head>` comes after them
  in `index.html` and in `_not-found.html`, and `_global-error.html`, which Next renders without the root layout, held
  no guard at all; Vite 8's dev server puts its module client before the guard unless a plugin injects the guard with
  `transformIndexHtml` ordered `post` and `head-prepend`, and `vite build` keeps the guard first. So the static check
  accepts external `async` and `defer` scripts and modules before the guard, and that the guard runs first stays a
  run-time proof; an inline script marked `async` or `defer` runs where it stands, and one placed before the guard ran
  before it in all three browsers (the twenty-first review's run). Next's error document (the same review, Next 16.4.1
  with Turbopack, not part of this probe): a page whose render fails on the server is served as `<html
  id="__next_error__">` with status 500, under `next start` and `next dev`, with and without `app/error`; it held no
  script of the app's and no guard, whatever the root layout, `app/error` or `app/global-error` rendered, because
  React renders them in the browser, where a `<script>` it renders does not run; the built `_global-error.html` was
  Next's own page even with a guard in `app/global-error`. Under the rule's set-up a middle and a Ctrl click on a link
  `app/error` rendered opened it in Chromium, while a planted link on the app's normal page was rewritten. With a
  local layer in front of the app's port that wrote the guard as the first child of `<head>` in every HTML response,
  the error document held the guard, its link was rewritten, the clicks went nowhere and the normal page hydrated
  without error. A layer built from the rule's sentence alone (the twenty-second review's run, Next 16.4.1 under `next
  start` and `next dev`, Chromium): the error document carried the guard and its clicks went nowhere, while the same
  app framed at Next's own port let the click out. Behind the layer, a route handler's `Response.redirect(new URL(…,
  request.url))` named `http://localhost:<Next's port>` and the shell's `frame-src` refused it; `proxy.js` followed
  `Host`; a layer that rewrote that `Location` to its own origin kept both working. An HTML response with no `<head>`
  tag got no guard from a layer that wrote it into `<head>` only, and its link went out; written right after the
  doctype, the guard held it. The layer's copy and the root layout's copy lived together: the second found the guard
  installed and did nothing. What failed loudly: a layer that edited compressed bytes (a blank frame), one that kept
  the upstream `Content-Length` (a cut page, which a check that knew the guard by an id alone passed), one that looked
  for `<head>` in the first write only (the static check fails on it), one that did not pass the WebSocket upgrade on
  (no hot reload). `HEAD`, 304, a client navigation's payload and the app's policy header passed through unchanged,
  and a 10 KB guard ahead of `<meta charset>` showed Hebrew correctly in the three browsers. On Vite the dev server's
  own error and 404 pages carry no guard and hold no outside link. The twenty-third review ran the layer with the
  `Location` rewrite as the rule words it (Next 16.4.1, `next start` and `next dev`, Chromium): a route handler's
  redirect, `proxy.js` and a server action's `redirect` each landed on the right page and nothing left 127.0.0.1; with
  the shell framing Next's own port, the planted throwing page's link went out, the walk failed on that page and the
  static check failed on it. Also measured there: Next sent a route handler's HTML returned as bytes with no
  `Content-Type`, a layer that knew HTML by its content type passed it unguarded, the browser read it as HTML and a
  middle click on its link went out, while the walk failed on it; a page with a relative social image and no
  `metadataBase` was served with `og:image` naming Next's own port; once it listens, Next sets `PORT` and
  `__NEXT_PRIVATE_ORIGIN` to its own address and fetches that origin from server code on a server action's redirect
  (read in its source); and with the notice in the root layout, the layer's port and Next's own port each showed only
  the notice at top level, on a normal page and on the error document. Other same-origin documents the guard reaches
  only at their frame's `load` (the same run): with a late `load`, a middle and a Ctrl click on a link went out under
  the rule's set-up from a `srcdoc` set on a frame that already held a document (Chromium and Firefox), from an XHTML
  page (Chromium and Firefox) and from an XML file that XSLT turns into HTML (Firefox; both the twenty-first review's
  run), from a `javascript:` URL document (Chromium; Firefox hung and was not measured), from a `blob:` page reached
  by the frame's navigation once the policy allowed `frame-src blob:` (Chromium and Firefox; the policy as committed
  blocks it) and from an SVG file of the public folder opened as a page (Chromium and Firefox). WebKit kept each of
  them in, `blob:` not measured there. A `srcdoc` or a `blob:` page set as the `src` of a new frame did not go out. In
  an SVG document `a.href = …` sets a property and no attribute, so a walk plants its link with `setAttribute`.
- Keyboard activation (the nineteenth review's run, not part of this probe): Ctrl+Enter and Shift+Enter on a focused
  `<a>`, and Ctrl+Enter on a focused SVG `<a tabindex="0">`, went out with the frame alone in Chromium and Firefox and
  nowhere under the rule's set-up in any of the three. A MathML element with `xlink:href` and no `href` is not a link
  in Firefox 159.
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
  request for it in any set-up. A MathML element with `href` that has no `<math>` ancestor (made with
  `createElementNS` and appended to a paragraph) is a link in Firefox as well: a guard that matched `math[href]` and
  `math [href]` neither rewrote it nor saw it in a click's path, and a middle and a Ctrl click on it opened a new page
  under the rule's set-up while the walk passed (the eighteenth review's run). The guard here matches a MathML link by
  its namespace: in this probe both clicks went out in Firefox with the frame alone and at top level, and not with the
  guard.
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
- Next: that the guard runs before every chunk on a cold and a warm load (from `next start` on loopback a guard in the
  root layout ran before every chunk on 30 of 30 loads; with the HTML arriving in two writes split just before that
  guard, the chunks ran first on 30 of 30; the twenty-first review's run; the start script's layer puts the guard
  before the chunk tags, which was not timed); how React treats an `href` the guard rewrote, at hydration and on a
  later render (a mismatch line in the console is expected and was neither measured nor cited); a Next server action
  (a form whose `action` is empty) after hydration.
- A PDF the app shows in a frame (the clinic app frames a document from its invoicing provider): plug-ins are off in a
  sandboxed frame, so it is probably blocked or downloaded, and the guard cannot be in a PDF viewer.
- Desktop: "Go to …" on selected text that reads as an address, and a drag of selected text to the tab bar.
- `HTMLElement.prototype.click()` on a link that is not in the document does not pass through `dispatchEvent`; with a
  key held on the button that ran it, it opened nothing in the three browsers (the fifteenth review's run), which is
  today's engines and not a rule.
- An `<embed>` document, which has no `contentDocument` for the guard to wrap; the walk is what shows it.
- Next behind the layer under `next dev`: every page logged "A tree hydrated but some attributes … didn't match", also
  where nothing was rewritten at load; `next start` logged none, and dev without the layer was not run (the
  twenty-second review). The layer in WebKit and Firefox, and on a real app.
- Other same-origin documents the guard's own install reaches only at their frame's `load` (beyond a `srcdoc` set
  later, a `javascript:` URL, a `blob:` page and an SVG file): the destination rules stand behind them.
- The root listing still reports one guarded arrangement as unlisted, which fails closed (the twentieth review's run):
  a frame inside a shadow root navigates to a served page, which runs a guard of its own, and that child window's
  `attachShadow` is used on an element of the page; the function reaches windows through `window.frames`, which does
  not count a frame inside a shadow root. An app that does this stops at «Where a fault goes».
- The app's frame in a process of its own in a person's own Chrome, which may key processes by origin with no header
  at all: the check script reads every frame's session, and nobody has run it against a real preview.
- A drag of an SVG link that `<use>` draws, or of an SVG `<a>` whose address an animation gives, and any other element
  that opens as a link while the event's path does not show one.
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
