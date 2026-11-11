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
ports it is given, and a probe (`node probe.cjs`; its outside target is in TEST-NET-3, which is never routed).

- Refused: `node:http`, `node:https`, fetch (http and https), `node:http2`, `net.connect`, `net.createConnection`, a
  raw `new net.Socket().connect()` as `pg` opens one, `tls.connect`, the global WebSocket, a unix socket path, and
  another loopback port. The allowed port was reached by `node:http` and by fetch.
- Not refused: a UDP send (`node:dgram`). Not tested, and outside any preload: a native addon that opens its own
  socket, and a child process that is not Node.
- A Node child is fenced only when the preload is loaded into it: with `NODE_OPTIONS=--require=<path>` in an
  inherited environment, `fork` and `spawn` were fenced; a child spawned with an environment that lacks
  `NODE_OPTIONS` was not. Patching `net.connect` and `tls.connect` instead let `node:http` and a raw socket through.
- A container or a network namespace fences every process and protocol at once. Docker's `--network none` cannot
  publish a port, and a bridge network has egress, so the planted requests show which one a setup really is.

## The shell frame (run on 11.11.2026: Chromium 158, WebKit 27.2 and Firefox 159 from Playwright 1.65)

`dev/probes/frame-sandbox/probe.cjs` serves a shell page whose policy has `frame-src` set to the app's origin only,
with the app in `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-modals">` on a second port, and
runs twelve ways out, first in the frame and then at top level with no sandbox.

- In the frame, in all three browsers, nothing left: no request to another origin and no new page for a click on a
  `tel:`, `mailto:` or `sms:` link, `location.href = 'tel:…'`, `location.assign` and `location.replace` to another
  origin, a link to another origin in the same frame, `window.open`, an `<a target="_blank">`, a write to
  `top.location` (it throws `SecurityError`) and a form post to another origin. In Chromium the frame then shows the
  browser's blocked page and the console names the refusal; in WebKit and Firefox the frame stays where it was.
- At top level with no sandbox, the same seven navigations, popups and posts to another origin all left.
- What the probe cannot show: a hand-off to another app (`tel:`, `sms:`, `mailto:`) leaves no trace in a headless
  test browser at top level, in any of the three, so only Chromium's console message proves the refusal in the
  frame; and `navigator.share` did not exist in any of the three. That is why the rule keeps two more layers for
  hand-offs (the link builders switched to a local page, and data that reaches nobody).
- The app must allow being framed by the shell (no `X-Frame-Options: DENY`, and a `frame-ancestors` that names the
  shell's origin when it sets one). An inline style in the shell page needs the policy to allow it or a stylesheet.
