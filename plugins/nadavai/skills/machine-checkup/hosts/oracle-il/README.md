# Oracle servers: alert tools

Two Always Free A1 VMs, `nadavai-vm` (the CI server, see `rules/ci-policy.md`) and `nadavai-svc`,
host the services that must stay up when the machines at home are off. What runs where, how each
service was moved and how to rebuild it are kept out of this public repo, in
`~/Documents/Infra/oracle-il/` on the LENOVO (synced to the MSI) and in the memory note
`oracle-always-on-services-2026-11`.

This folder holds only the generic alerting both VMs share:

- `bin/nadavai-alert "<subject>" "<body>"` sends one email through Resend. It reads
  `/etc/nadavai/alert.env` (root:ubuntu 640, holding RESEND_API_KEY, ALERT_TO and ALERT_FROM).
  The key goes to curl on stdin, never into argv.
- `bin/nadavai-watch <name> <command...>` runs a check. It emails on the second consecutive
  failure, once per outage, and sends a RECOVERED email when the check passes again. Its state is
  kept in `~/.local/state/nadavai-watch/`.
- `bin/nadavai-watch-http <url> <status> [text]` is an HTTP check that `nadavai-watch` can run.
- `alerts-install.sh` installs these three tools into `/usr/local/bin`, along with the user timer
  `nadavai-checks.timer`. Every 5 minutes the timer runs `~/.config/nadavai/checks.sh`, which is
  per host. Each VM checks the other, so if one VM dies, the other still sends the alert.

The tenancy is pay as you go. Anything beyond the Always Free quota is billed, so ask Nadav first
(`rules/acting-on-behalf.md`).
