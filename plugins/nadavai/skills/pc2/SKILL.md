---
name: pc2
description: "Connect to and operate Nadav's other Linux computers (omarchy and msi) from the LENOVO over Tailscale. Use when Nadav types /pc2 or says PC2, the second computer, the other machine, omarchy, msi, or asks to run a command, copy a file, or start an agent on another box."
---
# pc2 — the other computers

Nadav has three computers, all CachyOS with fish as the login shell, all on one tailnet. The main box is
`lenovo`, where agents run. The other two are reached from it:

| alias | hostname | login user | Tailscale IP |
|---|---|---|---|
| `ssh omarchy` | omarchy (the old "NadavAI" Omarchy box, reinstalled as CachyOS on 2026-11-03) | `nadav` | `100.93.63.88` |
| `ssh msi` | msi (the old main laptop, reinstalled on 2026-11-03) | `nadavmsi` | `100.89.201.36` |

Both boxes have key login with `~/.ssh/id_ed25519`, passwordless sudo (`sudo -n`), and sshd and tailscaled
enabled at boot. Suspend, sleep and hibernate are masked, so a box that is offline is off, not asleep.

## Connect

```
ssh omarchy
ssh msi
```

The aliases live in `~/.ssh/config` on the LENOVO. If one is missing ("Could not resolve hostname"),
append it, then retry:

```
cat >> ~/.ssh/config <<'CONF'

Host omarchy
    HostName 100.93.63.88
    User nadav
    StrictHostKeyChecking accept-new

Host msi
    HostName 100.89.201.36
    User nadavmsi
    StrictHostKeyChecking accept-new
CONF
```

No password is needed, and none should be asked for. Tailscale SSH is not enabled on either box, so
`tailscale ssh` is not an option.

## What goes wrong, and why

- **The login shell is fish.** `ssh msi 'if ...; then ...; fi'` fails with "fish: Missing end". Run anything
  with bash syntax as `ssh msi bash -s <<'EOF' ... EOF`, and put `</dev/null` on commands that read stdin
  (`sudo`, `ssh`), or they swallow the rest of the script.
- **A wrong user name looks like a wrong password.** `Permission denied (publickey,password)` also means
  "no such user with this key". Use the user from the table; do not guess names.
- **Do not hammer a failing login.** After a few failed attempts sshd (OpenSSH 9.8+, `PerSourcePenalties`)
  refuses connections from your address for a short while, with
  `kex_exchange_identification: Connection reset by peer`; it cleared within about a minute on 2026-11-03.
  Wait, then retry once.
- **MagicDNS names do not resolve from the LENOVO** (systemd-resolved and NetworkManager are not wired to
  Tailscale). Use the IPs. LAN addresses come from DHCP and change; Tailscale is the stable path.
- **sudo on Arch locks after 3 wrong passwords** for 10 minutes, even for the right one
  (`faillock --user <u> --reset`, or a reboot). Not relevant over ssh with `sudo -n`, but it hits anyone typing
  a password at the box.
- **Tailscale key expiry is off for both boxes.** If one drops off after months, check the admin console
  (login.tailscale.com/admin/machines) before blaming ssh.

## Check it is up before blaming SSH

```
tailscale status | grep -E 'omarchy|msi'     # expect "active", not "offline"
```

If the node is offline, the box is off or has no network. Say so; do not retry SSH.

## Running things there

- One command: `ssh <alias> bash -s <<'EOF' ... EOF`.
- Both boxes were reinstalled, so check what exists before relying on it (`command -v <tool>`). On 2026-11-03
  omarchy had only `rsync` and `git`; msi had `rsync`, `tmux`, `git` and `claude`. Neither had `codex`, `omc`
  or `mise`. Install with `sudo pacman -S --needed <pkg>` (passwordless sudo).
- omarchy used to run the CI and several services (nadavai-ci, runners, email-tracker, telephony-listener).
  After the reinstall they are not restored automatically; check `systemctl --user list-units` there before
  assuming one runs. The saved state is in `~/Archive/omarchy-keep-2026-11-03/` on the LENOVO.
- Long or interactive work: start it under `tmux` on the box so it survives the ssh session
  (`ssh msi 'tmux new -d -s <name> "<command>"'`), then read it with `ssh msi 'tmux capture-pane -p -t <name>'`.
- Files: `rsync -av <local> <alias>:<path>`.
- A Claude session started on another box is that machine's session. It does not appear in the LENOVO's
  `ListAgents`, and `claude --resume` here will not find it.

## Report

Say which path worked and what the box answered (`whoami`, `hostname`, `uptime`), so the next session does not
re-derive the connection.
