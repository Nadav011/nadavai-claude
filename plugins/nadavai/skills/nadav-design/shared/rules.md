# nadav-design · shared rules (every mode reads this before its first step)

## Tempo

Declared in the first step of every mode that runs steps (all but `next`, which starts nothing) and written in
the run log (`.omc/design-runs/<mode>-<date>.md`, or the output repo's `RUN-LOG.md` in `redesign`):

- `close-first`: a live app with real customers.
- `flow`: a new project, a site, a demo.

Tempo follows the app, not the artifact: a redesign demo or a new screen of a live app with real customers is
`close-first`. When the project does not make it obvious, ask once with AskUserQuestion; until he answers, and
whenever you cannot ask (a subagent, a Workflow agent), it is `close-first`.

Two words, used below:
- A **checkpoint** is the end of a mode step, of a screen or of a round. It always comes before any push,
  landing, ticked checkbox or STATUS line.
- **Final** means pushed, landed, ticked, or written to the STATUS line.

Under `flow`:
- Evidence is logged and work continues.
- A question that blocks nothing is batched to the next checkpoint.
- The visual change gate collects its before and after pairs into one sheet per checkpoint (Nadav approved
  this on 2026-11-10). A commit that carries a visual change stays local and is listed on that sheet until he
  answers keep, change or revert; nothing in it becomes final before his answer. This covers setup's per-step
  commits and the commit of screen step 8b.
- A failure stops only the part that failed.
- "Ask before starting another screen" does not apply.

Under `close-first` every rule of SKILL.md and of the mode files stays as written.

## Track

Declared with the tempo in the first step, and written in the same run log. The track follows the page being
built, not the repo: Camstore's home is `site`, its shop and checkout are `app`.

- `app` (the default): a product people operate. SKILL.md and the mode files as written.
- `site`: a site that presents (a portfolio, a marketing or landing site, a showcase with a scroll film or 3D,
  the home of a store). Read `tracks/site.md` before the first step. Its table says which app rules change, and
  its order of work replaces the design steps of `screen` for the presenting pages; `setup`, the DoD, the visual
  change gate and `ship` stay.
- `client-demo`: a site or an app built to win or brief a client, with invented content. Read
  `tracks/client-demo.md` before the first step.

When the request does not make the track obvious, ask in the same AskUserQuestion as the tempo.

**A reference from Nadav**, in any track and any mode ("like this", a link, a video, a screenshot, another app):
read `shared/reference.md` first. The first deliverable is `REFERENCE.md`, the first row is built and shown
before anything else is built, and no alternative concept is offered unless he asks for one.

## An app is built once

The demo of an app becomes the app. The page is not code: the app's build of a screen is its only build, and nothing
is rebuilt after it to match the page. Nadav named the double build as a problem that keeps coming back and asked
for a rule against it in his rules and in this skill: «שזה יהיה בחוקים של שלנו גם של הסקיל שלא יהי את הפידחות האלה יותר» (11.11.2026) [N]. He did not
decide what the rule says: points 1 to 4 and 6 are the choice of the session that wrote it [I]; point 5 holds his
global gates (`floor`), and the properties and proofs it holds them with are that session's choice [I].

Why: every second build opens gaps. SportChat v4: 39 of 183 findings were visible differences between the demo and
the built app, found by hand. MediZen: the standalone demo (`~/design-redesign/tf2-r12/proto/v2.html`, about 10,000
lines) went through many review rounds as a page of its own, its spec took 8+ commits in one day, and its build is
planned at 27 to 54 weeks, so a page and an app built from it drift apart. shifts: four look rounds on standalone
pages of two or three isolated screens failed («לא יודע כבר»); the look is now applied to the whole demo that lives
inside the app. And he understands a demo only when it plays like the real app (`standard/rejected.md`, "A catalog
of screens and states as the demo").

For an app (a product with screens people work in):
1. **A standalone page for the direction only.** A page outside the app's code is allowed for one thing: the first
   direction round (the look and the direction), and only one round, unless Nadav asks for another. It is already
   the main journey as one playable flow, never isolated screens. Why: the shifts rounds on isolated screens failed,
   and every later round on a page of its own is work the app never gets.
2. **After the plan is approved, the demo lives in the app.** The order is: the direction approved and tagged, then
   the build plan, then Nadav approves the build plan, then the build session starts, and its first unit is the
   preview. Approval of the direction never starts work in an app repo. From then on the demo is built in the app's
   own code, from its real components, on invented data (a preview or demo mode of the app), and that is what he is
   shown and plays with. In a new app, going live is replacing the invented data source with the real one, not a
   second build of the screens. Each unit lands like any task, by its own PR into main (`rules/ci-policy.md`), so the
   landing CI and the preview's check script (point 5) run on it. In an app with live users, the redesigned screens
   land behind a flag that is off for users, or reachable only through the preview's route (which point 4 keeps out
   of the build users get), until the plan's cut-over unit (a `go` item), so nothing reaches customers unit by unit.
   A long branch instead is an exception the plan names with its reason; then each unit runs the checks «What runs
   when» below lists before it merges into that branch, and the landing CI runs on the cut-over PR into main. Why:
   what he approves is then the code that ships, so there is nothing to drift. Examples: shifts' `src/demo/` (mock
   data, the app's own shadcn components); therapy-flow's `pnpm dev:salon` (`scripts/salon-preview.ts`, the real app
   on a synthetic in-process backend).
3. **Approved means a frozen, tagged commit.** The approved demo is a git tag in its repo, and the build plan names
   the tag. Any design change after it is made in the app's preview, never in the standalone page; from then on that
   page is read-only reference. A screen the tagged demo drew is compared to its phones at the tag, control by
   control and state by state, by the verifier of `screen` step 8b; a control or state on those phones that is
   missing in the preview with no numbered answer removing it stops the screen. That is the weaker check: a scripted
   parity tool is not in this skill on main (it is on an unmerged branch), and no text here calls it available until
   it lands. Why: a page that keeps changing under a plan built from it (MediZen) leaves the build aiming at a moving
   target; a tag is the one version both sides read.
4. **The preview comes first.** The preview on invented data is the first unit of a build, not a later one. Demo code
   and invented data never reach the build real users get, and the no-demo check proves it (shifts' `pnpm
   verify:no-demo` is the example). It runs on the web build inside the preview's check script (point 5), so the
   landing CI runs it on every unit. For a Capacitor or Expo app it also runs on the OTA bundle and on each store
   build: for an OTA bundle the deploy service builds, unit 1 adds it to the app's own build command for that bundle
   (in therapy-flow-v2, the `buildCommand` of `native/apps.json`), so a bundle with demo code fails to build; a store
   build is checked by the session that makes it, before it uploads it (`rules/store-apps.md`; a paid build service
   is asked first, the money gate). Why: the screens are designed inside the preview, so it exists before them; and
   invented people in the production build would be shown to real customers.
5. **The preview cannot reach anything real** (`floor`: `action-safety.md`; `working-style.md`, Approval gates: no
   message to a real person, no charge, nothing that cannot be undone). It runs on invented data only, from a fake
   backend in the app repo (a staging or test backend is not invented data), and four properties hold. Each is proven
   by the preview's check script, which also holds point 4's no-demo check; a property with no passing proof is not
   held, and unit 1 shows each proof failing on its planted case, then passing clean. therapy-flow's
   `scripts/salon-preview.ts` is the example for (b)'s browser policy, own port and 404 worker path, not for (a). What
   was measured for this point, and the probes that measured it: `shared/preview-floor-notes.md`.
   a. **Environment.** The server process and the client bundle see only the variables on the preview's allowlist, a
      file in the app repo naming each variable and its preview value (a backend host is `.invalid`, the preview's
      origin or the fake backend's local address). The start script starts from an empty environment, sets only those
      variables, and turns off every other source: the framework's `.env*` loading, and any reading of env files by
      the app's own config in the preview's mode. Proof: the script reads the resolved environment of the running
      server and every environment value compiled into the client bundle, and fails on a name not on the allowlist or
      a value that differs from it. Names the process needs or the framework sets for itself (`PATH`, `HOME`,
      `TMPDIR`, `NODE_ENV`, Next's `__NEXT_PRIVATE_*`) are on the allowlist with the value the start script sets, or
      marked "set by the framework", and hold no secret; the proof reads `process.env` inside the running server after
      start-up, not the environment it was spawned with. The start script runs this proof at every start and refuses
      to serve when it fails, because the landing CI holds no secrets and passes anyway: the proof must hold in the
      shell the preview is started from. What that takes on Vite and on Next, checked against their docs:
      `shared/preview-floor-notes.md`.
   b. **Network.** Nothing the preview loads or sends leaves its own origin. Browser: a content security policy of
      `default-src 'self'` plus `form-action 'self'` (form posts do not fall back to `default-src`) and `base-uri
      'none'` (so a `<base>` cannot re-point the page's links), with no other origin in any directive (only the dev
      server's own `ws://` address, `data:` or `blob:` where needed, and keywords that open no origin, such as
      `'unsafe-inline'` for the dev client's injected styles and preamble, or a nonce; `'strict-dynamic'` is not one
      of them, since it lets a trusted script load scripts from any origin), so what the page itself starts is fenced,
      not only `connect-src`: fetch, WebSockets, images, scripts, frames, form posts, fonts and workers. A form the
      person submits himself with a modifier key into a new page is not (Chromium; notes file); the guard of (c) stops
      that. It is a response header on every response the preview serves, worker scripts included, because a worker
      follows the policy of its own script's response, not the page's; a meta tag first in `<head>` (a meta policy
      does not cover what precedes it) is enough only for a page that starts no dedicated or shared worker from a URL.
      An app that opens WebRTC peer connections gets them from the fake data source in the preview, since no directive
      the proofs use fences them. Fonts and other public files the app loads from a CDN (Google Fonts in a `<link>`,
      `next/font/google`) are served from the preview's own origin, self-hosted in the app or copied into the repo
      before the fence; the policy never names the CDN. The preview has origins of its own (the app's port and the
      shell's port of (c), which no other build of the app uses: storage, caches and workers are per origin, so none
      of the real app's are there; cookies are per host and shared across ports, so the preview's fake sign-in uses
      cookie names of its own and ignores every other cookie, and a hosted preview never runs on the production
      domain, a subdomain of it, or a host inside a production cookie's `Domain=` scope) and registers no service
      worker (the app's worker path answers 404). Server, and any build step the start script runs: a connection from
      server code to anything but the preview's origin and the fake backend's local address is refused on every
      transport (fetch, `node:http(s)`, a database driver, a WebSocket client); the rule requires the proof, the
      mechanism is the app's (a preload that refuses `net.Socket.prototype.connect` to anything but the preview's own
      port and the fake backend's port, which every TCP client the notes file lists reached; it does not cover UDP
      (`node:dgram`), a native addon that opens its own socket, or a process the preload is not loaded into: a Node
      child started without it, so it is loaded through `NODE_OPTIONS=--require=…`, which the allowlist names, and a
      child that is not Node, other than a compiler the plan names that opens no connection (esbuild, SWC, Turbopack's
      compiler, a CSS engine); those are fenced by a network namespace or container with only loopback, with the
      preview's port forwarded in for the browser, or not used and not started). Proof: planted calls to a harmless
      live host (example.com, never a send endpoint), from browser code as a fetch, an image and a script (and one
      fetch from inside a worker when the app starts one), and from server code one request per transport it uses,
      plus one to a loopback port that is neither the preview's nor the fake backend's (one request only when the
      fence is a namespace or container), each come back blocked, and any answer fails the script; no service worker
      is registered; and the browser's recorded requests during a scripted play of the main journey include no other
      origin. The planted browser calls are made by the check script from the test browser (`page.evaluate`), so
      nothing planted ships; the planted server requests are made inside the running server process, and inside each
      process it or the start script starts, through a test-only route or a start-up hook of the preview's mode that
      the no-demo check keeps out of the build users get; a separate script proves only itself. The check script lists
      every process under the start script after the scripted journey (`/proc`) and fails on a Node process with no
      planted-request result, and on any other process the plan does not name with its fence or its reason. A preview
      that runs no server code says so in the plan, and the server half is `n/a` with that reason.
   c. **Effects.** Sends, charges, scheduled jobs, webhooks, analytics and real sign-in made by a request are covered
      by (a) and (b), and the script's output says so item by item: for every provider the production app uses
      (messaging, payment, jobs, webhooks, analytics, auth; read from the env example, the deploy config and the HTML,
      where a pixel or tag id often sits), its key is absent from the resolved environment and its host is blocked,
      shown by one planted browser fetch and one server request to it, with no credentials and never to a send
      endpoint. The start script starts no scheduler, queue worker or cron runner, and fences any process it starts as
      (b) says. Sign-in reaches only the fake backend, with invented accounts. A send, a call or a payment made by
      opening a link or another app (wa.me, api.whatsapp.com, `whatsapp:`, `tel:`, `sms:`, `mailto:`, a payment link)
      is a navigation, which no content security policy on the app's own page fences, and a list of the controls that
      open one is never complete (links come from data, from rich text, from a dependency, from a scheme built out of
      parts). So four things hold together:
      - The frame. In the preview's mode the app runs inside a shell page served from a second port of the preview's
        own, in an `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-modals">` with no
        `allow-popups*`, no `allow-top-navigation*`, and nothing in `allow` beyond what this bullet names. The shell's
        policy sets `frame-src` to the app's origin only, and the shell holds the frame and nothing else: no script
        that navigates, opens a window or posts a form on a message from the frame. Every popup, top navigation,
        navigation of the frame to another origin and form post out that the page starts is then refused, whatever
        code or data built it (measured in Chromium, WebKit and Firefox; notes file). The script and Nadav open the
        shell, never the app's port; opened at top level, the app in the preview's mode renders only a notice that
        points to the shell. The shell passes its own path and query to the frame's `src`, so a deep link or a refresh
        opens that screen. What the frame turns off is stubbed in the preview's mode or allowed by name: downloads by
        `allow-downloads` (then the planted cases add a cross-origin `<a download>`, which must leave nothing), a
        same-origin window such as a print view opened in the frame's place, and clipboard, fullscreen, camera,
        microphone or location by name in `allow`; `payment`, `web-share` and `publickey-credentials-*` are never
        added. On a phone the frame changes the page around the app (from the platforms' documented behaviour, not
        measured here): the shell carries the app's viewport meta (a frame's own is ignored), and safe-area insets,
        the hiding of the browser's bars, the keyboard's resize and autofocus do not reach a cross-origin frame. Unit
        1 lists what the app relies on of these; the build session checks those screens at top level through a flag of
        the start script that only the check script's own run sets: it lets the app render at top level, still in the
        preview's mode behind every other fence, in a test browser that aborts every request outside the preview's
        origins. The flag is never set for a preview anyone plays, and the proof that the app's port shows only the
        notice runs without it. The build session never sends Nadav to the app's port, and does not fix in the app a
        layout difference that only the frame causes.
      - The guard. A link or a form the person opens himself is not a navigation the page starts: a middle click, or a
        click with Ctrl or Shift, on a link to another origin inside the frame opened a new page to it, and the same
        click on a form's submit button sent the form there (Chromium and Firefox for the link, Chromium for the form;
        notes file). The browser's own "open in new tab", the Cmd key, a drag to the tab bar and a long press on a
        phone are the same kind of action and were not measured. So in the preview's mode a guard loads before
        anything else in every same-origin document of the frame (on Next, the first script in the root layout's
        `<head>`, before hydration; a `srcdoc` or other child frame gets it too) and does two things. It rewrites the
        `href` of every `<a>` and `<area>` that points outside the preview's two origins (another origin, or a scheme
        other than http and https) to a local page that shows where it would have gone, and keeps watching the
        document for new or changed links (a `MutationObserver` on `href`). And it cancels what the person opens
        himself, at the event level, whatever the element: `auxclick`, any click with a modifier key or a button other
        than the main one, `contextmenu` and `dragstart`, with `-webkit-touch-callout: none` for the long press on an
        iPhone. The local page shows the address as text, never as a link, because a guarded link that does open in a
        new tab shows that page at top level, outside the frame; and the app's pages carry `<meta
        name="format-detection" content="telephone=no">`, so iOS does not turn a number in the text into a link.
      - The builders and the data, for a hand-off to another app, which no headless test browser shows as a hand-off,
        and for `navigator.share`. Each link builder a search of the app's source finds is switched in the preview's
        mode to the local page that shows what would have been sent or dialled, and a contact the app itself
        hard-codes (a support number) is replaced. And the data reaches nobody: invented addresses are `.invalid` or
        `example.com`, URLs in the fake data are on the preview's origin, and invented phone numbers are in a range
        the country's regulator reserves for fiction where one exists, otherwise invalid by length (one digit short),
        never a real-format number marked as invented.
      - Proof. From inside the frame, a planted `location.href = 'tel:…'`, a `location.assign` and a `window.open` to
        another origin, an `<a target="_blank">` whose `href` comes from fake data, a form post out, a write to
        `top.location`, a middle click and a Ctrl+click on a planted `<a>` to another origin and on one to `wa.me`, a
        Ctrl+click and a Shift+click on the submit button of a planted form whose action is another origin, and a
        `navigator.share` call (where the test browser has one; where it has none the script prints the case as not
        testable there) each leave nothing outside the preview's two origins (no request, page, popup or navigation),
        in Chromium and in WebKit (the Playwright image, as `working-style.md` routes it), and the console reports the
        shell's `frame-src` refusal of the `tel:` case (WebKit names the `tel:` URL; Chromium logs `Framing ''` and
        its frame ends on `chrome-error://chromewebdata/`). The scripted journey leaves nothing outside them either,
        and after each of its screens the script scans every link and form in every document of the frame and fails on
        an `href` or an `action` outside the preview's two origins; the app's port opened at top level renders only
        the notice; and the script fails on an invented phone number that is valid outside a reserved range. Unit 1
        shows this proof failing with the `sandbox` attribute removed, again with the shell's `frame-src` removed, and
        again with the guard removed; and on the phones Nadav uses it shows by hand a `tel:` tap, a `wa.me` tap and a
        long press on a link, each ending on the local page.
   d. **Where it runs.** The proofs run where the preview runs. On localhost: the environment proof at every start, as
      (a) says, and the rest before anyone plays, as «What runs when» says. Anywhere else (one of his own domains,
      never a claude.ai artifact, which cannot serve the two origins and their policy headers, and after his yes; a
      new host, a DNS record or any cost is asked at that moment, and unit 1 is marked `go` when it needs one): only
      as a static build on a host or project of its own (never the app's production hosting project; the host serves
      the built files only, with no functions, proxies, or rewrites to another host or a function; a fallback to its
      own `index.html` for client routes is allowed) that carries the same policy as (b) says, with the shell and the
      app on two origins as (c) says (two hosts of the same site, for example two subdomains of one of his own
      domains, because a cross-site frame loses its `SameSite` cookies in every browser and its storage in Safari), or
      as a server on a host or project of its own (never the app's production hosting) that holds only the allowlisted
      variables; never on the production domain, a subdomain of it, or a host inside a production cookie's `Domain=`
      scope. Before the link is shared, the whole check script except the no-demo check runs against the deployed URL
      and passes (the environment proof on its served or published files; the planted calls, the frame's planted cases
      and the recorded journey from a browser that opened it), and one request to each same-origin server path the
      app's code calls (`/api/*` and the like) is answered by the fake backend or with 404.
      `redesign/tools/early-show.sh` checks the host, https, the answer and the commit, and is not that proof. The
      fake backend answers no redirect to another origin, and the script fails on a `Location` header outside the
      origin; until the check script passes, the preview listens on loopback only, and a preview played from a phone
      over the LAN or Tailscale passes its check script with that origin in the policy before he opens it.

   Nobody plays the preview, on any machine, before its check script passes there (on a local tree: all of it except
   the no-demo check, as «What runs when» says); until then only the build session runs it, and only to run the
   checks. Then Nadav plays it on localhost at that machine (his phone or another device that reaches the same running
   process over the LAN or Tailscale counts, and the policy then names that origin; always in a browser, never inside
   a native shell, whether a store, OTA or live-reload dev build, because native HTTP and plugin hand-offs are outside
   the browser policy the proofs test), elsewhere as (d) says.
6. **Behaviour logic is written once** [I] (source: the session building mexicani-shifts, 11.11.2026). Logic the
   preview computes from what the person does while playing (state that several people or devices change, the order
   offline changes arrive in, undo, alerts, money arithmetic) is plain functions with no browser, framework or demo
   import, in a folder both the preview and the production code import, never under the demo folder. Only the data
   source is demo-only: invented in the preview, the server in production. A fake that returns fixed invented data
   computes nothing and is outside this point. Before Nadav plays a preview that simulates such behaviour, its logic
   has a test that runs the cases exhaustively, or over every combination up to a size the test states (for example
   all orderings of up to N changes), with at least one mutant (a deliberate break of the logic) per property the test
   asserts shown to fail it. Where production runs that logic on the server, the preview either runs the same code (it
   imports the function, or runs the same SQL in the fake backend's local database) or returns fixed data; it never
   writes a second implementation, and where the server cannot import the function the same cases run against the
   server's implementation too. In an app with live clients, logic that decides what is sent to people is reply logic:
   before a change to it is switched on, `rules/action-safety.md`'s replay applies. The shared functions are not demo
   code: point 4 is about the demo folder and the invented data, and the no-demo check still covers that folder. Why:
   there the demo's task logic (marks from several offline phones, undo, alerts) took 11 review rounds, 8 finding a
   new bug, while each fix patched one path of an incremental merge; it closed when one pure function derived all
   state from an append-only list of marks, outgoing messages became a diff of that state applied by one step the app
   and the test both call, and the test ran every arrival order (237k orderings) with mutants proving each assertion
   can fail. That function lived under the demo folder, so the plan would have written the same logic again for
   production.

What runs when [I] (`rules/ci-policy.md` rule 1 decides where checks run): locally, before anyone plays a tree, the
whole check script runs on it except the no-demo check: the start-time environment proof, the planted calls, the
frame's planted cases and the recorded requests of the scripted journey (through `heavy-slot`); the no-demo check
needs a production build, so it runs in the landing CI, except that unit 1, which builds the script, runs all of it
locally to show each proof failing, then passing. The CI step uses the `code` path filter of `~/nadavai`'s
`templates/ci/woodpecker-landing.yml`, or none. With no landing CI yet the plan says so and the whole script runs
locally on every unit; on a long branch (point 2) the landing CI runs it on the cut-over PR.

Who builds the preview: in a new app, setup step 10b, only inside a task Nadav gave to build that app; in an existing
app with no preview, setup step 10b also when he asks for it from `plan` step 5; in a redesigned app, the build
session START-BUILD opens after he approved the build plan, as its unit 1 (`redesign/README.md`, step 8), because
mode `redesign` never writes into the app repo. Where this section says unit 1, in a new app read setup step 10b.

Where a fault goes [I]: a session that meets something in this rule or its tools that does not fit, is missing or is
wrong stops that step and reports it to the session that maintains this skill (with none live, to Nadav in its closing
report). That session, reading his answer below as his ask for such fixes [I] (`working-style.md`, Learning), fixes it
here through an independent review and names the change in its closing report to him. A tightening of point 5 applies
at once; a fix that removes or weakens a proof of point 5 goes to him first; a change to this section that alters a
unit of a plan he approved goes to him before that unit runs. A build session re-reads this section in the installed
skill before each unit, because it changes as projects report faults.

MediZen and SHIFTS. Asked which goes first (SHIFTS first then MediZen, MediZen first, both together), Nadav typed his
own answer on 11.11.2026: «שניהם ביחד בצורה חכמה שלא נעשדה טעות פעמיים כי זהם לא יפעו בואתו הזמן» [N]. The session's
reading [I]: both are built by this rule; they do not run the same step at the same time, and a fault one finds in
this rule or its tools is fixed here before the other reaches that step. MediZen's standalone demo predates the rule
and is not approved yet: it goes on to his approval as the page it is, through the rounds its own exit checklist lists
(point 1's one-round limit is not applied to it), and is not converted; from that approval on the rule applies (the
tag, a build plan Nadav approves, the preview as unit 1, the screens the demo did not draw designed in the preview).
His decision of 10.11.2026 that its build starts only after everything is closed stands.

Not covered: track `site`, and track `client-demo` with no app behind it (the page is the product, or no app
exists); SportChat v4, an app in the middle of a build that started from a standalone demo: its running build keeps
its own plan.

## Looking at screenshots

Measure first (DOM or ARIA snapshot, computed styles, console, a pixel-diff number) and look at images for the
visual judgement only. Read several images in one turn (parallel Read calls) or as one contact sheet, and never
re-read an image already in context. Why: 12.7K image reads in 14 days became about 8.7K separate requests, 6.3K
of them carrying a single image (2026-11-07).

- Numbers: `ui-check <url> [--width 375,1440] [--theme light,dark] [--json]` (overflow either side, off-screen
  and clipped controls, overlaps and fixed-bar cover, touch targets, viewport meta, console, axe, RTL
  `text-align:left`; exit 1 means findings).
- A competitor's or a reference's colours, type and spacing: `dembrandt <url> --json-only` (keep `colors`,
  `typography`, `spacing`, `borderRadius`, `shadows`, `components`; skip `favicons`).
- Text in a screenshot: `tesseract <img> - -l heb+eng`.

## His words

The understanding check is `rules/working-style.md`, "Requests"; it is not restated here. What this skill adds:

- Before the first design step, read `GLOSSARY.md` at the project root, `~/nadavai/guides/glossary.md` and
  `REJECTED.md` at the project root, each when it exists.
- The two or three readings shown to Nadav are things he can see: a crop of his own earlier approved work, a small
  rendered sample, or a reference link with the exact part marked. Never prose alone.
- A look or a choice he rejects is appended to `REJECTED.md` with his words and the date (in `redesign`, at the
  output repo's root, because that mode never writes into the app repo). Nothing listed there is proposed again.

## The experience standard

- Before a screen is planned, built, changed or audited, read `standard/experience.md` and
  `standard/profiles.md` (next to this folder). Their rules are not restated here, in SKILL.md or in a mode file.
- `standard/rejected.md` seeds a new project's `REJECTED.md`.
- `plan`, `screen`, `audit` and `ship` end their report with how many of the standard's rules were checked only
  by `reviewer` or by `none` on the screens they covered.

## Where checks run

- **Landing** (a non-draft PR into main): only `lint:ui` and `node e2e/dod/routes.mjs --check`, where the repo's
  `.woodpecker/*.yml` wired them. A landing gets no secrets. No landing runs the DoD or Lighthouse today; a
  path-scoped DoD gate on the landing is decided and lands in a later step.
- **Nightly** (omarchy, repo `Nadav011/nadavai-nightly`, checked out at `~/Projects/nadavai-nightly`): runs the
  repo's own `.github/workflows/ui.yml` on main through `act`: the DoD, and Lighthouse where that repo's nightly
  runs it (`sc-ui` runs none; `gr-ui` audits the commit production serves). That file is the nightly's input, not
  a GitHub gate: `bin/audit` stops without it, and its DoD score gate line (template: `DoD score must be 100`) is
  the only thing that turns the nightly red. It posts `nadavai-ui` as a report. Its keys (`DOD_USER`,
  `DOD_PASSWORD`, `ARGOS_TOKEN`) live in `~/nightly/secrets/<repo>.env` on omarchy and are added by the CI
  session. Read it with `ssh omarchy /home/nadav/nightly/bin/ci-summary <repo>`; its reports and uploaded
  artifacts are in `/home/nadav/nightly/logs/<repo>-<sha7>-ui-reports/` on omarchy.
- **`audit` and `ship`** take the scores from the nightly when it covers the tree they measure (main's head for
  `audit`, the release sha for `ship`). The screenshots later steps read (`reports/dod/screens/<slug>__...png`)
  come from the nightly's `dod-report` artifact unzipped into `reports/dod/` when it holds them, otherwise from
  `heavy-slot -- PM dod` locally. Lighthouse comes from the nightly when it ran it on that tree, otherwise from
  `heavy-slot -- PM exec lhci autorun` locally. A local full run waits for an idle machine (the quality bar's
  load rule).
- **`ship` pre-flight**: a green landing of the release sha (`ci-wait <repo> <sha>`) and the last nightly
  `nadavai-ui` on main green. A red nightly blocks `ship`.
- **The CI step** (a Setup artifact and part of "setup done") is present when the repo's `.woodpecker/*.yml` has
  a `lint:ui` or DoD step (a bare `routes.mjs --check` is not a DoD step), or when `.github/workflows/ui.yml` has
  the DoD score gate line and the nightly checkout has a `*-ui.yml` for the repo. A nightly workflow names its repo
  by its command `bin/audit <key>-ui`, and `bin/audit` maps `<key>` to the repo (`REPO=([tf]=therapy-flow-v2
  ...)`); match on that, not on the file name. On a machine with no nightly checkout, `ui.yml` with the score line
  counts, and the report says first that the nightly registration could not be verified there. With neither,
  setup is incomplete.
- **Setup step 14(b)** copies `~/nadavai/templates/ci/ui.yml` to `.github/workflows/ui.yml` as the nightly's input
  (written for pnpm 10: on npm, yarn or bun replace the setup action and every `pnpm` command with `PM`; merge
  into an existing one; keep `dod` as its own job so the `dod-report` artifact uploads), then verifies the
  landing step and the repo's nightly workflow. Those belong to the CI session: each one missing becomes a
  written request to it (what to add, the `PM` commands, the keys), an open item that session owns.

## Platform

`shared/platform.md`: what each `PLATFORM` (`capacitor-bundled`, `capacitor-remote`, `pwa`, `expo`) changes in the
design steps, which skill owns each Capacitor topic, and the native form of every gate on the Expo app. Read it in
setup step 1, and again before any step that touches a shell, a device or a release.
