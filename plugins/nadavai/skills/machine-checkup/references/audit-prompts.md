# Audit agent prompts

Launch all three in one message, `run_in_background: true`, default model (Sonnet). Each one is
read-only and writes one report under `~/cleanup-audit-<date>/`. Fill in the `<...>` parts from the
snapshot (step 1) and from what was already deleted this round, so they do not report it again.

Shared rules to paste into every prompt:

- You must NOT delete, move, stop, disable or modify anything. Write only under `~/cleanup-audit-<date>/`, never `/tmp`.
- Read `~/.claude/projects/-home-nadavcohen/memory/disk-cleanup-keep-list.md` first (what never to touch, lessons from earlier rounds).
- The disk may be saturated: run every `du`/`find` with `ionice -c2 -n7`, one at a time, never in parallel, never the same tree twice. Use `GIT_OPTIONAL_LOCKS=0` for git status scans (plain `git status` rewrites `.git/index` and fakes recent mtimes).
- Active projects: <list from the keep-list and running sessions>. Never propose deleting their source.
- Already done this round, do not list again: <list>.

## 1. Disk inventory

Goal: a complete inventory of the root filesystem so nothing on the machine is unexplained, plus every way to free space.

- Every directory or file of 100 MB or more anywhere on `/` (system dirs via sudo, every dotdir in `~`), down to the level where it is clear what it is.
- For each: what it is (owning package via `dpkg -S`, app, project, or "unknown"), real size (`du` counts each inode once within one invocation, so measure a set of hardlinked trees in one `du` call; never sum parents and children), last change, evidence of use (process, open file, symlink into it, config reference), regenerable or not, and a label: DELETE-SAFE / ARCHIVE / ASK-NADAV / KEEP.
- Cover: leftover config/data of uninstalled apps, orphan dotfiles, old kernels, apt cache, journal, snap revisions, Docker (anonymous volumes, exited containers, orphan overlay2 dirs; never the Green Room volumes), Claude/Codex session data (report only), idle worktree `node_modules`/`.next` (check symlinks from other worktrees into them), duplicate large files (hardlink candidates), big media, Android SDK/AVD, toolchains, stale venvs, what regrows and why.
- Totals per label, and the sum of the inventory versus `df` used, so the gap is visible. Unidentified items under an UNKNOWN heading with the evidence.

## 2. Software, services and config cruft

Goal: everything a reinstall would have cleaned, found so it can be fixed in place.

- `apt-mark showmanual` packages that look unused (size, last use, `apt-get -s` collateral), PPAs and sources that are dead, `rc` packages, snaps, flatpaks, global npm/pipx/uv tools (references in nadavai, `~/.claude.json`, `~/.codex/config.toml`, `~/.grok`, project scripts).
- Every enabled system and user unit, timer, cron entry, XDG autostart and login script: what it does, cost, whether its target still exists. Dead units, units that would undo the current tuning if started, executable `.bak` files in `/usr/lib/systemd/system-sleep/` (systemd runs every executable there).
- Background processes and listening ports (`ss -ltnp`) with RSS/CPU; services on 0.0.0.0; Docker published ports (they bypass ufw); stale ufw rules.
- Conflicting tuning: two files setting the same sysctl/udev/tmpfiles value, scripts in `/usr/local/bin` that would reset it.
- Plaintext secrets in shell rc files (report names only, never values).
- Journal warning hot spots, failed units, boot time (`systemd-analyze blame`).
- Each finding: REMOVE-SAFE / FIX / ASK-NADAV / KEEP and the exact command (not executed). End with the top 10 actions.

## 3. Performance and hardware health

Goal: numbers for every resource, and an honest answer whether a reinstall would fix anything.

- Disk: write/read latency and queue depth over a few 15 s windows (`/proc/diskstats`; if `iostats` is 0 the counters stay flat: report that and ask the main session to enable it, do not change it yourself), Orca stalls with `scripts/freeze-watch.py 300`, NVMe SMART, TRIM schedule and duration, ext4 journal stats, top writers per cgroup `io.stat`.
- CPU/thermal: `turbostat` over minutes of real load (PkgWatt, Bzy_MHz, PkgTmp, limit reasons via MSR 0x64F), applied undervolt and power limits, MCE errors.
- Memory: RSS by process group, zram/swap, PSI, growth over the window.
- GPU: `nvidia-smi` power, P-state, clocks at idle.
- Fork/exec rate (`/proc/stat` processes) and who causes it; system CPU share.
- Each problem: evidence, impact on Nadav (Orca freezes, typing lag, slow agents), fix, trade-off, cost. End with the 10 highest-impact fixes.
