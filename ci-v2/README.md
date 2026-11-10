# CI v2 infrastructure (Woodpecker), set up 2026-11-03

The rules agents follow are in `rules/ci-policy.md`; this folder is the machine side, so the
setup can be rebuilt after a reformat. No secrets live here: they are in the vault on the LENOVO
(`~/.claude/secrets/woodpecker.env`: OAuth client and secret, agent and gRPC secrets, API token).

## Oracle VM (`ssh nadavai-vm`, ubuntu, Tailscale `oracle` 100.99.111.119)
- `oracle/compose.yml` + `oracle/Caddyfile` -> `/opt/woodpecker/` (root, 700), with
  `/opt/woodpecker/secrets.env` holding the WOODPECKER_* secrets. `data/` must be owned by uid 1000
  (the server image's `woodpecker` user). gRPC 9000 is bound to the Tailscale IP only.
- The VM's own iptables (`/etc/iptables/rules.v4`) must accept 80, 443 and `tailscale0`; Oracle
  images REJECT everything but 22 there, whatever the cloud security list says.
- `oracle/woodpecker-backup` -> `/usr/local/bin/`, with `woodpecker-backup.{service,timer}` daily
  at 02:45 UTC: an SQLite `.backup` plus integrity check into `/opt/woodpecker/backup`, 14 kept.
  Restore: stop the server, copy a snapshot to `data/woodpecker.sqlite`, chown 1000:1000, start.
- `oracle/wp-watchdog.py`, installed by `oracle/wp-watchdog-install.sh` (token on stdin): a user
  timer every 2 minutes that cancels and restarts, once, a run whose workflow lost its agent
  (running, but missing from the queue on two checks). Log `~/wp-watchdog/log`.
- DNS: `ci.nadavc.ai` A record in Cloudflare, not proxied (Caddy gets the certificate itself).
- GitHub OAuth app "NadavAI CI (Woodpecker)" (github.com/settings/applications/3988914),
  callback `https://ci.nadavc.ai/authorize`, user tokens do not expire.

## Agents (omarchy, MSI)
- `agent/compose.<host>.yml` -> `/opt/woodpecker-agent/compose.yml`, with
  `/opt/woodpecker-agent/secrets.env` = `WOODPECKER_AGENT_SECRET`. Docker backend, 3 workflows each.
- `agent/woodpecker-prune.units`: the daily cleanup service and timer (05:20).
- omarchy also runs the nightly local-backend agent (`~/nightly`); its own README lives there.

## Machines and nightly
Each machine's role is in `rules/ci-policy.md`, "Machines"; this is where things run and log.
- secscan (Oracle VM nadavai-svc, since 2026-11-10; on omarchy before): posts `nadavai-security`.
  It runs as the system user `secscan` (no sudo, no login shell, linger on) with user timers
  `secscan-poll` every 2 minutes and `secscan-nightly` at 04:20. Everything is under
  `/home/secscan/secscan`: `src/` (root-owned copy of Nadav011/nadavai-secscan), `tools/` (pinned
  arm64 scanners and gh, `src/bin/install-tools.sh`), `state/` (the baselines Nadav approved),
  `repos.txt`, `logs/`, and `gh.env` (600): the fine-grained token "nadavai-secscan (Oracle svc)"
  for the five repos (Contents and Pull requests read, Commit statuses and Issues write; expires
  2027-11-04). Measured there: a PR scan 8 to 70 s, therapy-flow-v2's full scan 100 s.
  - Look: `ssh nadavai-svc 'sudo tail /home/secscan/secscan/logs/secscan.log'`; a report:
    `ssh nadavai-svc sudo cat /home/secscan/secscan/logs/<repo>-<sha7>-security.txt`.
  - By hand, as that user: `ssh nadavai-svc "sudo -u secscan bash -c 'cd; set -a; . ~/secscan/gh.env; set +a; ~/secscan/src/bin/secscan scan <repo> <sha> pr:<n>'"`;
    `secscan approve <repo> <main-sha> [<digest>]` runs the same way, after Nadav approved the delta.
  - Update the code: push to Nadav011/nadavai-secscan, then copy `bin/` and `systemd/` into `src/`
    as root (the scanner's user cannot write its own code).
  - A new repo: a line in `repos.txt`, the repo added to the token, and a first baseline
    (`security-scan <repo> <tree> <report> --baseline` on main; camstore's was rebuilt this way on
    2026-11-10 with 0 entries).
  - omarchy still has its old copy with enabled timers. When it comes back, disable them there
    (`systemctl --user disable --now secscan-poll.timer secscan-nightly.timer`) before anything
    else, or two services post the same status. Its `~/secscan/state` holds baseline entries
    approved after 2026-11-03 that the VM's copy lacks (therapy-flow-v2: 14 secret-like test
    fixtures of PR #98): copy `state/*.security-baseline.json` over then.
- Nightly audits (omarchy): a local-backend agent (`omarchy-nightly`, capacity 1) that takes only
  Nadav011/nadavai-nightly's workflows, cron `night` 23:00 UTC, on each repo's main (Green Room:
  the commit production serves). It posts `nadavai-ui`, `nadavai-nightly`, `nadavai-native` and
  `nadavai-expo-doctor`, and keeps the "NadavAI: main is red" issue per repo.
- Summary: `ssh omarchy /home/nadav/nightly/bin/ci-summary <repo>` (absolute: a bare `~` expands
  on the LENOVO). Logs: `/home/nadav/nightly/logs` on omarchy, 14 days.
- The old nadavai-ci runner is retired (its temporary host on the LENOVO stopped on 2026-11-03);
  a `nadavai-ci` status on an old commit is history only.

## npm cache (omarchy, msi)
- `agent/npm-cache/{compose.yml,nginx.conf}` -> `/opt/npm-cache/` on each agent host (`sudo install`,
  `cache/` owned by uid 101, `docker compose up -d`). nginx 1.30 (unprivileged image, tag plus
  digest), `restart: always`, published on `172.17.0.1:4873` (docker0) only, so the LAN, Wi-Fi and
  Tailscale cannot reach it. It is a read-through HTTP cache of registry.npmjs.org: GET and HEAD
  only, no credentials forwarded, TLS to npmjs verified. It holds only what npmjs returned; pnpm
  and npm still check every tarball against the lockfile's integrity hash, and the lockfiles are
  untouched. Metadata is kept 5 minutes (npmjs's own max-age), tarballs 1 day and then revalidated
  by ETag; an expired entry is served once while it refreshes, and also when npmjs errors. Size cap
  10 GB, entries unused for 30 days go, so no prune timer. The agent prune timer does not touch it.
- Why not Verdaccio: tried first (6.11.1) and measured on the MSI. pnpm 11 checks the whole
  lockfile against supply-chain policies at install and fetches full metadata for every entry;
  Verdaccio sat at 200% CPU parsing and rewriting it and took 26-34 s, warm, for an install that
  takes 11-15 s straight from npmjs. With nginx the same warm install takes 8-14 s.
- The repos' install steps (`.woodpecker/*.yml`) ping `http://172.17.0.1:4873/-/ping` for 2 s,
  install through the cache when it answers (`npm_config_registry` for npm and pnpm 10,
  `pnpm_config_registry` for pnpm 11, `--fetch-retries=0`, `timeout 300`), and install from npmjs
  when it does not answer or the install through it fails. `extra_hosts: ["npm-cache:host-gateway"]`
  is not used: Woodpecker's linter rejects it unless the repo is trusted for network, and that
  trust would also allow `network_mode: host` in any PR.
- Check: `curl -sI http://172.17.0.1:4873/typescript | grep X-Cache-Status`; the access log
  (`docker logs npm-cache`) has the cache status in field 6. Fallback test: `docker stop npm-cache`.

## Per repo (Woodpecker API, admin token)
- Activate: `POST /api/repos?forge_remote_id=<github repo id>` (retry: the first call can fail with
  "could not create webhook" on a GitHub EOF).
- `PATCH /api/repos/<id>` `{"cancel_previous_pipeline_events":["pull_request","push"],"timeout":60}`.
- Nightly cron: `POST /api/repos/<id>/cron` `{"name":"nightly","branch":"main","schedule":"M H * * *"}`
  (5 fields, UTC).
- Then add the repo to `lib/woodpecker-repos.txt` once its `.woodpecker/` is green on main.

## Deploy service (Oracle VM), set up 2026-11-04
Production deploys run here, outside every repo-defined pipeline, so no branch or PR config can
reach a production token (plan Revision v2 item 5). Code in `deploy/`, installed by
`deploy/install.sh` (run on the VM from a copy in `~/deploy/src`): the script to
`~/deploy/bin/nadavai-deploy` (linked from `/usr/local/bin`), pinned tools under
`/opt/nadavai-deploy/tools` (node 24.22.2 and gh 2.103.3 from checksummed release tarballs;
pnpm 10.32.1, wrangler 4.151.3, vercel 64.7.0 and aws4fetch 1.0.20 from `deploy/tools/package-lock.json`;
the OTA driver `deploy/tools/ota-step.mjs` and the publisher vendored beside it, `deploy/tools/ota/`), the system
users `nadavai-build`, `nadavai-upload` and `nadavai-ota`, work dirs in `/srv/nadavai-deploy`, and the user timer
`nadavai-deploy-auto.timer`.
- For the deploying session (the hard gates 3, 5 and 6 are in `rules/ci-policy.md` rule 10):
  - The deploy runs detached on the VM, never in a pipeline, so a dropped ssh stops nothing.
  - Exit 4 with "main moved; deploy <head>": deploy that head instead. Exit 75: not ready (still
    running, cancelled, Woodpecker unreadable): run the same command again later.
  - Exit 6 for a sha newer than the red nightly: the deploy reruns the nightly itself and waits
    up to 20 minutes. The omarchy audits (`nadavai-ui`, `nadavai-nightly`) stay reports, not gates.
  - therapy-flow-v2: the same deploy then publishes the store apps (MediZen, RetroBarber) over
    the air and posts `nadavai-ota`. "native change: store build needed" means a store build,
    never a rerun; an OTA failure leaves the web live. "publisher changed in the commit" means the
    reviewed copy in `deploy/tools/ota` must be re-vendored first. A web `rollback` prints the
    `ota-rollback` the phones need (`--with-ota` runs it), and an `ota-rollback` holds that
    platform until `ota-release` (details under "OTA" below).
  - Nothing deploys on a timer (no `.auto` flag). `hold`, `hold-status`, `pages-live`,
    `rollback <repo> <id>` and `--dry-run` (starts no nightly) are under "Commands" below.
- Who deploys (since 2026-11-04): the session that merged a PR runs `deploy <repo> <merge sha>`
  (rules/ci-policy.md rule 10), in all four repos, unless the repo is held (sportchat-web is, until
  its v4 release); nothing deploys on a timer. `deploy` starts itself as a systemd user unit
  (`nadavai-deploy-run-*`, output in `~/deploy/logs/session-*.out`, exit code in `.out.rc`) and
  only follows it, so a dropped ssh never stops a deploy, its rollback or its status.
- Commands (`ssh nadavai-vm nadavai-deploy <cmd>`): `deploy <repo> <sha> [--dry-run]
  [--migration-approved "<key>:<reason>"]`,
  `hold <repo> <reason>`, `release <repo>`, `hold-status <repo>` (one word: held, off, auto or
  manual), `pages-live <repo>` (live deployment id and commit, Vercel repos too),
  `rollback <repo> <deployment id> [--with-ota]`, `repos`, and for the store apps `ota <repo> <sha> [--dry-run]`,
  `ota-status <repo>`, `ota-rollback <repo> <app> <android|ios> <bundleId|reset> [--runtime runtime-<fp12>]`,
  `ota-release <repo> <app> <android|ios>`, `ota-min <repo> <app> <android|ios> <build> [--message "<text>"]`,
  `ota-off <repo> <reason>`, `ota-on <repo>`. Exit codes are in the script's header.
- Gate: the sha is on main and is the merge commit of a PR into main whose head has every
  `ci/woodpecker/pr/*` status and `nadavai-security` green (main is not tested again). A direct push
  to main has no PR, so it is refused; deploy the next merge commit instead.
- Migration gate: when `git diff` between the live commit (`pages-live`) and the sha, in the
  mirror, holds a migration (`MIGRATION_RE`, any case and depth: a `.sql` under
  `supabase/migrations/`, `migrations*/`, `supabase/release-candidates/` or `supabase/schemas/`, not
  `__tests__/`; therapy-flow-v2's `scripts/*.sql` are out until Nadav decides), the deploy refuses
  with exit 5, lists the files and prints an approval key (12 hex of sha256 over the live commit,
  the sha and the sorted files). `--migration-approved "<key>:<reason>"`, passed only after Nadav
  approved the migration, lets exactly that range through; another key is refused. The reason goes
  into the run log and the `deploys.log` line. An unreadable live commit counts as a migration.
- Nightly gate: the latest finished (success, failure, error or killed) Woodpecker cron run named
  `nightly` on branch main (`GET /api/repos/<id>/pipelines?event=cron&branch=main`, filtered again
  on `cron`, `branch` and `event`; ids 2 snooker-smart, 3 cash-next-app, 4 therapy-flow-v2, 5
  sportchat-web; a real answer is in `deploy/tests/fixtures/`). Green passes. Red on the sha, or
  on a newer commit, refuses with exit 6 and its failing steps. Red on an older commit: the deploy
  starts the cron now (`POST /api/repos/<id>/cron/<cron id>`, which runs on main's head) and waits
  up to 20 minutes (`NADAVAI_DEPLOY_NIGHTLY_WAIT`): green on the sha passes; red refuses with 6;
  main having moved past the sha refuses with 4 ("main moved; deploy <head>"); still running is
  75, and a second `deploy` waits on that same run instead of starting another. A run wp-watchdog
  cancelled and restarted (the new run's `parent`) is followed. Fail-closed, exit 75: an answer
  that is not a JSON array, no nightly cron, no finished run, or a cancelled latest run. The
  omarchy audits (`nadavai-ui`, `nadavai-nightly`) are not gates.
- Order: the hold first (a held repo refuses before any gate), the landing gate, then the
  migration and nightly gates without the repo lock, so the wait never keeps a rollback waiting.
  Under the lock: the hold again, the live commit again (and the migrations when it moved), and the
  nightly verdict again without a second wait. A real deploy stops at the first refusal and posts a
  `nadavai-deploy` failure ("not deployed: ..."); a dry run starts no nightly (it says it would, and
  waits only on a run already going), reports both gates, goes on, and exits with the refusal's code
  even when its build fails.
- OTA, the store apps (therapy-flow-v2 only, since 2026-11-07; `planning/native-apps-2026-11-06/OTA.md`
  section 9 item 6 in that repo): after a deploy went live and posted `nadavai-deploy`, the same run
  publishes that sha to the installed MediZen and RetroBarber apps (Android and iOS) over the air, with
  no human step. It runs outside the repo lock, under `state/<repo>.ota.lock`, only while the sha is
  what production serves, the repo is neither held nor off, and `state/<repo>.ota-off` does not exist
  (so an older deploy's step never publishes over a newer one's). Each app in the sha's
  `native/apps.json` builds with its `buildCommand` in the build sandbox, in the web build's checkout,
  with only its public env (`OTA_ENV`: `therapy-flow-v2.build.env` for medizen,
  `vitlana-salon-public.env` for retrobarber); medizen's `dist/sw.js` must carry the sha's tf-shell
  stamp (the salon bundle has no commit marker). The bundle is copied into a fresh clone of the sha
  (data only), and one unit per platform runs `tools/ota-step.mjs publish` there as `nadavai-ota`, a
  user no other unit runs as, with `r2-ota.env` as its environment and the app's `ota-<app>.pem` as a
  systemd credential.
  - Trusted code only (2026-11-07 review): the unit runs `ota-step.mjs` and the publisher vendored in
    `deploy/tools/ota/` (byte-identical reviewed copies of therapy-flow-v2's
    `scripts/native/ota-publish.mjs` and `fingerprint.mjs`, installed root-owned in
    `/opt/nadavai-deploy/tools/ota`), never a file of the commit. A commit whose own copies differ
    from the vendored blobs (`git rev-parse <sha>:scripts/native/<file>` against
    `git hash-object --no-filters` of the vendored file, its own bytes whatever `core.autocrlf`
    says) is refused before any build: `nadavai-ota` failure "OTA
    refused: publisher changed in the commit: review and re-vendor". To take such a change: review
    the diff, copy the two files from that commit into `deploy/tools/ota/`, commit in nadavai, run
    `install.sh` on the VM, then `ota <repo> <sha>`. The driver pins the bucket, the public host
    `https://updates.nadavc.ai` and the staging host (the commit's `native/apps.json` "updates" are
    not read), trusts the commit's public key only after the service's private key signs for it,
    reads only plain files of the clone (every registry path relative with no `..` and no git pathspec magic, and no file it
    reads, from the native project to the bundle, a symlink or under one), and before signing
    checks the bundle: not a staging build, the shipped salon profile for
    retrobarber, and the updater inside it (the production host, the `runtime-<fp12>/manifest.json`
    path and every line of the app's public key), so a bundle that cannot update itself is never
    published. A dry run runs these checks whatever R2 says.
  - Per platform: a person's OTA hold (`state/<repo>.ota-hold.<app>.<platform>`) skips it; then the
    hold, the OTA switch and the live commit are read again before each app's build and right
    before each publish (a `hold`, `ota-off` or web rollback during a step stops it before the next
    build or platform: "OTA stopped before ..."). No production manifest for the commit's runtime fingerprint: a native change (nothing
    published; a store build is needed) when the platform has manifests on another runtime, "not
    released" when it has none at all (first manifests stay a hand step from the LENOVO); a manifest
    that already carries the commit is current (idempotent); a person's rollback or reset published
    after the commit's time is kept; otherwise the bundle is published as the next seq. The runtime
    each platform reached goes to `state/<repo>.ota-runtime.<app>.<platform>` and each bundle
    published per commit to `state/<repo>.ota-bundles`.
  - The commit status `nadavai-ota`: pending at the start, then success, failure "native change:
    store build needed: <app>/<platform>", "OTA failed: ...", "OTA stopped before ...", "OTA refused:
    publisher changed ...", "not published: the OTA is off ...", or error "OTA interrupted" (a TERM
    stops its units first). `deploys.log` gets one `ota*` line. An OTA failure never rolls back the
    web or changes the deploy's exit code. `ota <repo> <sha>` runs the step alone (checkout and
    install first) for the live sha; `--dry-run` writes and posts nothing.
  - Alert (2026-11-09): a status emails nobody, so a native change, a refused publisher or a
    failed step also opens one rolling issue in the repo, "NadavAI: store apps need attention"
    (label `nadavai-store`), the way the nightly's ci-digest reports a red main (an issue emails
    Nadav). It gets a comment only when the problem (the status's first clause, kept in
    `state/<repo>.ota-alert`) changes, and the next successful OTA step closes it; a stopped step or
    `ota-off` leaves it as it is. When the token cannot list issues, the run logs "OTA alert: could
    not list the issues" and opens nothing; the alert never changes the step's result.
  - People: `ota-status` (no key), `ota-rollback` and `ota-min` run the same trusted driver as
    `nadavai-ota` on a fresh clone of main's head, as data only, against the production bucket (a
    hold does not stop them). `ota-rollback` defaults to the runtime the last OTA step reached (not
    main's tree; with none recorded it asks for `--runtime`) and then holds that platform's OTA step
    until `ota-release <repo> <app> <platform>`, so the next merge does not publish over it (a hold
    file it cannot write is exit 4, "published, not held": never run it again, run `ota-off`).
    `ota-off <repo> <reason>` stops the whole OTA step (web deploys go on) until `ota-on <repo>`, and
    returns once a step in flight has stopped; `hold` waits for the OTA lock the same way.
  - A web `rollback` of therapy-flow-v2 leaves the phones on the bundle the rolled-back deploy
    published: it prints, per platform the OTA step reached, the exact `ota-rollback` to the bundle
    of the commit production serves now (or `reset`, the store build's own bundle, when no OTA step
    published one there); `rollback <repo> <id> --with-ota` runs them (and so holds those
    platforms until `ota-release`). With no `state/<repo>.ota-runtime.*` at all (state lost) it says
    "OTA: unknown, no OTA step recorded; check `nadavai-deploy ota-status <repo>`", and so does each
    platform of the live commit's `native/apps.json` that has no record; it never says that such
    phones need no rollback, and `--with-ota` exits 1 when any platform is unknown.
- Hold: `state/<repo>.hold`, written and removed under `state/<repo>.lock`, the lock every real deploy
  and rollback holds for its whole run, and read with that lock held. A rollback is allowed while
  held. `state/off` (all repos) or `state/<repo>.off` switch deploys off.
- Auto: OFF. The timer runs `nadavai-deploy auto` every 5 minutes, which reads nothing unless a
  `state/<repo>.auto` file exists; then it deploys main's new head through the same gate, and a
  failed head is not retried until main moves. sportchat-web is never deployed by the timer (it
  deploys only from the merging session). Turning the timer on for a repo is Nadav's call:
  `touch ~/deploy/state/<repo>.auto`. The timer never passes `--migration-approved`.
- Secrets, VM only, 600 in `~/deploy/secrets/`: `github.env` (`GH_TOKEN`: a fine-grained PAT for the four repos
  with Contents read, Pull requests read, Commit statuses read and write, and Issues read and write
  for the OTA alert (not on the token as of 2026-11-09: listing issues answers 403); pending as of
  2026-11-04: GitHub asked for GitHub Mobile confirmation, so Nadav creates it and pipes it in), `therapy-flow-v2.env` (the Pages deploy token from
  the old `therapy-flow-v2.deploy.env`), `therapy-flow-v2.build.env` (public `VITE_*` build env, read
  by systemd as root, never by the build user), and `cash-next-app.env`, `snooker-smart.env`,
  `sportchat-web.env` (`VERCEL_TOKEN`, team scope `nadav011s-projects`: the Vercel CLI refuses
  project-scoped tokens; expires 2027-11-04), and `woodpecker.env` (`WOODPECKER_TOKEN`, Nadav011's
  Woodpecker API token from the LENOVO vault, for the nightly gate), and for the OTA step (2026-11-07,
  from the LENOVO vault) `r2-ota.env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: the
  R2 token `nadavai-ota-r2`, the two OTA buckets only), `ota-medizen.pem` and `ota-retrobarber.pem`
  (the signing keys, read by systemd as credentials for the `nadavai-ota` units only) and `vitlana-salon-public.env` (RetroBarber's
  public build env). Copied with pipes; nothing in Woodpecker or a repo.
- Vercel Git deploys: none of the three projects deploys main by itself (snooker-smart's
  `vercel.json` sets `git.deploymentEnabled.main=false`; cash-next-app and sportchat-web have no Git
  link), so this service is their only production path.
- Tests: `bash deploy/tests/nadavai-deploy.sh` (offline, stub gh/curl/sudo): the 37 hold, rollback
  and pages-live checks ported from nadavai-ci 9ca934d plus the gate, dry run, auto pass and clean
  upload environment, the migration gate (on a git mirror the test builds), the nightly gate (stub
  Woodpecker, plus a saved real answer), the detached run, and the OTA step (the real
  `ota-step.mjs` with a stub of the vendored publisher, the same stub committed in a fixture commit,
  `deploy/tests/fixtures/ota`, a stub R2 of files and a stub sudo that runs each unit with only its
  own environment), and the real vendored publisher under `ota-step.mjs` on a small clone (a key
  pair from two generated RSA keys, the registry path and symlink guards), and the OTA alert issue
  (stub issues): 226 checks.
