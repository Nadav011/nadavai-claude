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
- omarchy also runs the nightly local-backend agent (`~/nightly`) and secscan (`~/secscan`); their
  own READMEs live there.

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
pnpm 10.32.1, wrangler 4.151.3 and vercel 64.7.0 from `deploy/tools/package-lock.json`), the system
user `nadavai-build`, work dirs in `/srv/nadavai-deploy`, and the user timer
`nadavai-deploy-auto.timer`.
- Commands (`ssh nadavai-vm nadavai-deploy <cmd>`): `deploy <repo> <sha> [--dry-run]`,
  `hold <repo> <reason>`, `release <repo>`, `hold-status <repo>` (one word: held, off, auto or
  manual), `pages-live <repo>` (live deployment id and commit, Vercel repos too),
  `rollback <repo> <deployment id>`, `repos`. Exit codes are in the script's header.
- Gate: the sha is on main and is the merge commit of a PR into main whose head has every
  `ci/woodpecker/pr/*` status and `nadavai-security` green (main is not tested again). A direct push
  to main has no PR, so it is refused; deploy the next merge commit instead.
- Build: therapy-flow-v2 builds on the VM from a fresh clone of a bare mirror, as `nadavai-build` in
  a transient systemd unit (`sudo systemd-run`): no /home (so no secrets), read-only system, no
  route to 169.254.0.0/16 (cloud metadata), Tailscale, loopback or private networks (DNS allowed),
  8 GB, low CPU weight, 1 hour cap. Only the upload step sources the token, with a cleared
  environment (`clean_exec`), from a directory holding only `wrangler.toml` and `functions/` from git
  plus the built `dist/`. The Vercel repos build remotely: the CLI uploads the checkout with
  `--prod --skip-domain`, and the service promotes the build through the REST API.
- Health: therapy-flow-v2 needs `https://medizen.nadavc.ai/sw.js` to carry the sha's `tf-shell`
  stamp and the repo's `.cf-healthcheck.mjs` (run in the sandbox) to pass; Vercel repos need the
  production host to serve the new deployment with `nadavai_sha` = the sha and answer
  (cash `/login` exactly 307 to `/deliveries`; greenroom `/`, sporchat `/he` any 2xx/3xx). A failed
  check rolls back to the deployment live before. Every run appends a line with
  `live before deploy:` to `~/deploy/logs/deploys.log` (full log per run beside it) and posts the
  `nadavai-deploy` status (`live: <id> ...` on success). A dry run posts nothing.
- Hold: `state/<repo>.hold`, written and removed under `state/<repo>.lock`, the lock every real deploy
  and rollback holds for its whole run, and read with that lock held. A rollback is allowed while
  held. `state/off` (all repos) or `state/<repo>.off` switch deploys off.
- Auto: OFF. The timer runs `nadavai-deploy auto` every 5 minutes, which reads nothing unless a
  `state/<repo>.auto` file exists; then it deploys main's new head through the same gate, and a
  failed head is not retried until main moves. sportchat-web never deploys automatically. Turning
  auto on for a repo is Nadav's call (rules/ci-policy.md rule 10): `touch ~/deploy/state/<repo>.auto`.
- Secrets, VM only, 600 in `~/deploy/secrets/`: `github.env` (`GH_TOKEN`: a fine-grained PAT for the four repos
  with Contents read, Pull requests read, Commit statuses read and write; pending as of
  2026-11-04: GitHub asked for GitHub Mobile confirmation, so Nadav creates it and pipes it in), `therapy-flow-v2.env` (the Pages deploy token from
  the old `therapy-flow-v2.deploy.env`), `therapy-flow-v2.build.env` (public `VITE_*` build env, read
  by systemd as root, never by the build user), and `cash-next-app.env`, `snooker-smart.env`,
  `sportchat-web.env` (`VERCEL_TOKEN`, team scope `nadav011s-projects`: the Vercel CLI refuses
  project-scoped tokens; expires 2027-11-04). Copied with pipes; nothing in Woodpecker or a repo.
- Vercel Git deploys: none of the three projects deploys main by itself (snooker-smart's
  `vercel.json` sets `git.deploymentEnabled.main=false`; cash-next-app and sportchat-web have no Git
  link), so this service is their only production path.
- Tests: `bash deploy/tests/nadavai-deploy.sh` (offline, stub gh/curl/sudo): the 37 hold, rollback
  and pages-live checks ported from nadavai-ci 9ca934d plus the gate, dry run, auto pass and clean
  upload environment.
