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
