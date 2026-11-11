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

## The shell frame and the link guard (run on 11.11.2026 with Playwright 1.65)

`dev/probes/frame-sandbox/probe.cjs` runs sixteen ways out of an app page in three set-ups: in a sandboxed frame
(`sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`, the shell on a second port with `frame-src`
set to the app's origin only) with a guard in the app that points every `<a>` and `<area>` leaving the app's origin
at a local page; in the same frame with no guard; and at top level with neither (the control). The test browser
aborts and records every request that is not to 127.0.0.1. Cases that attempted a request outside:

| Browser | frame + guard | frame only | top level (control) |
|---|---|---|---|
| Chromium 158 | 0 of 16 | 3 of 16 | 10 of 16 |
| WebKit 27.2 | 0 of 16 | 0 of 16 | 7 of 16 |
| Firefox 159 | 0 of 16 | 3 of 16 | 10 of 16 |

- What the frame alone refused in all three: `location.assign` and `location.replace` to another origin, a click on
  a link to another origin in the same frame, `window.open`, an `<a target="_blank">`, a write to `top.location`
  (it throws `SecurityError`), a form post to another origin, and `tel:`, `mailto:` and `sms:` links and
  `location.href = 'tel:…'`.
- What the frame alone did not refuse, in Chromium and Firefox: a link the person opens himself. A middle click, a
  Ctrl+click and a Shift+click on a link to another origin each opened a new page and requested it. The browser's
  own "open in new tab" and a long press on a phone are the same kind of action, and a test browser cannot press
  them. With the guard the link no longer points outside, so the same clicks opened the local page. (In headless
  WebKit those clicks opened nothing in any set-up, so the probe shows nothing for WebKit there.)
- A hand-off to another app (`tel:`, `sms:`, `mailto:`) makes no request and no page in a headless test browser at
  top level in any of the three (Chromium and WebKit print nothing; Firefox prints "Prevented navigation to … due to
  an unknown protocol"), so the control cannot show a hand-off. In the frame each console reports the refusal, and
  it comes from the shell's `frame-src`: WebKit "Refused to load tel:… because it does not appear in the frame-src
  directive", Firefox a `frame-src` block that names the `tel:` URL, Chromium "Framing '' violates … frame-src",
  which does not name the URL, after which its frame shows `chrome-error://chromewebdata/`.
- `navigator.share` did not exist in any of the three, so that case is not testable in them.
- Not run: the browser's context menu, a long press, and real phones. A project's unit 1 shows those by hand on
  the devices he uses.
- The app must allow being framed by the shell (no `X-Frame-Options: DENY`, and a `frame-ancestors` that names the
  shell's origin when it sets one).
