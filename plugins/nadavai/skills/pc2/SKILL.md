---
name: pc2
description: "Connect to and operate Nadav's second Linux workstation (Omarchy, hostname NadavAI) over Tailscale. Use when Nadav types /pc2 or says PC2, the second computer, the other machine, omarchy, NadavAI, or asks to run a command, copy a file, or start an agent on the other box."
---
# pc2 — the second computer

The second workstation is an Omarchy (Arch) box. Its Tailscale name is `omarchy`, its own
hostname is `NadavAI`. The main box is MSI.

## Connect

```
ssh omarchy
```

That alias lives in `~/.ssh/config` on MSI. If `ssh omarchy` fails with
"Could not resolve hostname", the alias is missing on this machine — append it, then retry:

```
cat >> ~/.ssh/config <<'CONF'

Host omarchy
    HostName 100.93.63.88
    User nc
    StrictHostKeyChecking accept-new
CONF
```

Authentication is `~/.ssh/id_ed25519`, already authorized there. No password is needed,
and none should be asked for.

## What goes wrong, and why

- **The login user is `nc`, not `nadavcohen`.** Every attempt as `nadavcohen` returns
  `Permission denied (publickey,password)` whatever password is used, which reads like a
  wrong-password problem and is not one. `ssh-copy-id nadavcohen@...` fails for the same reason.
- **The LAN address `192.168.1.133` is dead** (`No route to host`). Older notes still name it.
  Tailscale (`100.93.63.88`) is the only working path.
- **MagicDNS names do not resolve from MSI.** `omarchy.tailda1373.ts.net` fails even though
  `tailscale status` shows the node, because the system resolver is not pointed at Tailscale.
  Use the IP.
- **Tailscale SSH is not enabled on that node** (`sshHostKeys: null` in `tailscale status --json`),
  so `tailscale ssh omarchy` is not an option.
- **The sudo password in `~/.claude/secrets/omarchy-sudo.env` is stale** — it was rejected on
  2026-09-17. Ask Nadav rather than looping on it, and never pass a password with `sshpass`
  when key auth is the working path.

## Check it is up before blaming SSH

```
tailscale status | grep omarchy     # expect no "offline"
ping -c 2 100.93.63.88              # expect ~2ms over Tailscale
```

If the node is offline, the box is asleep or off. Say so; do not retry SSH.

## Running things there

- One command: `ssh omarchy '<command>'`.
- Non-interactive ssh already has the right PATH, including the mise shims
  (`/home/nc/.local/share/mise/shims`), so `claude`, `codex`, `git`, `rsync` and `tmux`
  all resolve by name. `omc` is **not** installed there.
- Long or interactive work: start it under `tmux` on that box so it survives the SSH session
  (`ssh omarchy 'tmux new -d -s <name> "<command>"'`), then read it back with
  `ssh omarchy 'tmux capture-pane -p -t <name>'`.
- Files: `rsync -av <local> omarchy:<path>` — both ends have rsync.
- A Claude session started there is that machine's session. It does not appear in this
  machine's `ListAgents`, and `claude --resume` on MSI will not find it.

## Report

Say which path worked and what the box answered (`whoami`, `hostname`, `uptime`), so the next
session does not re-derive the connection.
