---
name: machine-checkup
description: "Full checkup of one of Nadav's Linux machines: why it freezes or is slow, a complete inventory of the disk, deleting and archiving everything that is not needed without losing anything, retiring dead services and conflicting tuning, every update source and driver brought current (packages, AUR, npm/pnpm/bun/pipx/uv, Node, firmware, BIOS against the vendor, microcode, vendor drivers), and verifying the result with measurements. The in-place alternative to reinstalling the OS. Use when Nadav types /machine-checkup or says the computer is stuck, slow, freezing, Orca freezes, the disk is full, clean the computer, scan everything, update everything, all drivers, \"תנקה את המחשב\", \"למה המחשב נתקע\", \"המחשב איטי\", \"הדיסק מלא\", \"לעשות פרמוט\", \"הכל מעודכן?\", \"תעדכן את כל הדרייברים\", or asks to get the machine to 100% known. Setting up a second machine like this one is machine-provision."
---
# machine-checkup

One round takes a few hours, most of it background scans and copies. Nadav runs it regularly.
State of the previous round lives in memory: `disk-cleanup-keep-list.md` (what never to touch,
per-round logs and lessons), `msi-thermal-diagnosis-2026-10.md`,
`ram-pressure-chrome-kills-2026-09-29.md` (tuning history) and, on the LENOVO,
`lenovo-performance-tuning-2026-11.md`. Read them first.

## Hard rules

1. **Never stop, restart or slow down a running session's work.** No reboot, no `docker restart`,
   no `swapoff` of zram, no `systemctl restart` of logind/display. Why: Nadav runs 10+ agent
   sessions and 10-hour workflows at all times. A reboot is the one exception, and only while
   nothing is running on the machine (no agent session, CI job, deploy or `heavy-slot` job;
   Nadav, 2026-11-14); the Oracle servers always have something running, so they are not
   rebooted without him.
2. **Nothing needed is lost.** Delete only what is regenerable (caches, build output,
   `node_modules`, old downloads) or proven orphaned. User data, history and anything without a
   second copy goes to the archive on the other machine first (`scripts/archive.sh`), and is
   deleted only after its sha256 manifest matched. Why: Nadav's condition for "delete everything".
3. **Every `rm` names literal paths.** The harness blocks `rm -rf "$var"`; never route around it
   with a script or `xargs`. `scripts/archive.sh` therefore only copies and verifies.
   Re-check each target right before its `rm` (no process has it as cwd or open file, mtime not
   newer than the scan or receipt); when ownership is in doubt, skip it and list it for Nadav.
4. **Ask only what only Nadav knows** (does he use an app, keep a backup, want a trade-off), in
   AskUserQuestion batches of up to four questions, each option with size and evidence. Never ask
   about something that is provably regenerable or orphaned; delete it. Paid items are the
   money gate and a deletion with no way back waits for him (`rules/working-style.md`, Approval
   gates). Firewall, SSH and auth changes run without asking and are named in the report; a
   BIOS, EC or firmware flash waits for his yes (Nadav, 2026-11-14).
5. **Folders owned by a running session are cleaned by that session.** Find the owner with
   ListAgents (and by checking which session's cwd or recent commits live there), send it a
   SendMessage with the size and what to drop, and archive only what it hands back. Why: on
   2026-10-23 the SportChat v4 session freed 12 GB itself and named 21 items safe to archive,
   which no scan could have known.
6. **Measure before and after** every tuning change (A/B in interleaved rounds, at least two),
   and keep a change only if the numbers say so. Say the trade-off in one line.
7. **One owner per knob, one heavy job at a time.** If another session announces it owns an
   area (GPU, power limits, sysctl, swap, zram, earlyoom), do not touch it and do not run heavy
   disk jobs during its measurement window; run archives with `ARCH_IONICE=-c3` if Nadav insists.
   Heavy jobs (full `du` sweeps, archive, hardlink, fstrim, disk-bench) take
   `flock ~/.cache/machine-checkup.heavy.lock <command>` so two never overlap, including the
   audit agents' sweeps.
8. Retired config is moved, not deleted: `/root/retired-tuning/` (files) or a tarball made with
   `tar --remove-files`. Logs: `~/cleanup-log-<date>.txt`; reports: `~/cleanup-audit-<date>/`.

## Steps

### 1. Snapshot (2 minutes)

```bash
uptime; free -h; swapon --show; df -h /; cat /proc/pressure/{cpu,memory,io}
ps -eo pid,ppid,ni,stat,pcpu,pmem,etime,args --sort=-pcpu | head -30
ps -eo stat,comm | awk '$1~/^D/' | sort | uniq -c        # tasks stuck on disk
sudo turbostat --quiet --show PkgWatt,PkgTmp,Bzy_MHz,Busy% -i 10 -n 1
machine-baseline-check      # the shared OS baseline: ok / BAD / REBOOT per line
heavy-slot --status         # heavy jobs running and waiting, and why
```

Decide which resource is the bottleneck before touching anything: CPU (0% idle, run queue far
above the thread count), memory (memory PSI, earlyoom kills in the journal), or disk (I/O PSI,
D-state tasks in `jbd2_log_wait_commit` / `folio_wait_bit_common` / `rq_qos_wait`).

If Nadav says the disk grew since a date ("a week ago we were at 67%"), the inventory audit must
answer it: list directories created since then (`find -maxdepth 3 -newermt`) and measure real
bytes per inode set, not `du` per tree. On 2026-10-28 this found 48 new SportChat v4 worktrees,
each with its own `npm ci` (about 2.5 GB, link count 1): 89% became 61% with one `hardlink` pass.

If Nadav says sessions or terminals "crashed" or vanished, first read
`journalctl -u systemd-oomd` and `journalctl --user | grep 'systemd-oomd killed'`: on CachyOS,
systemd-oomd kills the whole Orca terminal scope (Claude and every child) that holds the most
swap once swap passes 90%, so it looks like a crash with no coredump. Then check `findmnt /tmp`:
`/tmp` must be on disk on every machine (fstab line commented out, `tmp.mount` masked,
`/etc/tmpfiles.d/tmp.conf` with `q /tmp 1777 root root 3d`; `hosts/common/install.sh` sets all
three, and the move itself happens at the next reboot). Why: the CachyOS installer puts
`/tmp` on tmpfs; on the LENOVO (2026-11-07) agent scratchpads and `agent-browser` profiles
(about 5 GB each) grew it to 24 GB, nearly all of it in zram, and oomd killed three terminals
in two hours. The MSI had the same fix in September, and the migration did not carry it over.

If Nadav reports freezes, run `python3 -I scripts/freeze-watch.py 600` in the background. It
separates "Orca's main thread blocked on disk" from "the whole machine stalled"; on 2026-10-20
it showed 44 Orca stalls and 0 system stalls in 10 minutes, which moved the work from CPU to disk.

### 2. Three read-only audits in parallel

Launch the three prompts in `references/audit-prompts.md` (disk inventory, software/services,
performance) as background agents. While they run, do step 3; do not duplicate their scans.

### 3. Delete-safe pass (no questions)

Before each item, checked fresh right before its `rm` (a snapshot taken at the start goes stale):
no process has it as cwd or open file (`/proc/*/cwd`, `/proc/*/fd`), and the tool that owns a
cache is not running.

| Item | How |
|---|---|
| Codex `~/.codex/.tmp/marketplaces/.staging/*` older than 1 h, `~/.cache/codex-update-manager/{workspaces,packages}` not in use | `rm -rf` by literal name; MSI has `codex-leftovers-clean.timer` for this (workspaces older than 90 minutes, `.deb` older than a day). Marketplace clones of plugins whose `config.toml` entry is `source_type=local` are orphans |
| npm `_cacache`, deno, trivy, pip, pnpm metadata, uv, go-build caches, `go clean -modcache` | only when the tool is not running |
| `node_modules`, `.next`, `.turbo`, `.expo`, `.vite` in worktrees idle 2+ days | skip anything `git ls-files` tracks and anything other worktrees symlink into. File mtimes are not an idleness signal (mass checkouts refresh them): use dirty/unpushed/merged, a process cwd, and the owner's skip list |
| Anonymous Docker volumes with no container | list `docker volume ls -qf dangling=true`, inspect each (`CreatedAt`, size, a `PG_VERSION` file means a database); remove by name only the ones older than 2 days whose creating stack is gone; never `docker volume prune`, never named volumes (the Green Room `supabase_*_jfqwucrzhzojelrptqxb` volumes look reclaimable and are not) |
| Installer downloads whose installed version is newer, old plugin cache versions no live session started from, unused Playwright browsers, apt cache | `apt-get clean`; vacuum the journal (`--vacuum-time=14d`) only after a freeze investigation is closed, the journal is its evidence |
| Firmware for hardware the machine does not have (`/usr/lib/firmware` qcom, netronome, mellanox, amdgpu, mrvl, mediatek, ath1xk, qed: 1.1 GB on the MSI) | `path-exclude` lines in `/etc/dpkg/dpkg.cfg.d/90-firmware-exclude` so upgrades do not bring them back, then `rm -rf` the trees by literal path. Check `lspci`/`lsusb` first; do not rebuild the initramfs |

Then dedupe instead of deleting anything still in use. Hardlinked files share one inode, so an
in-place write in one worktree (Node `fs.writeFile`, Python `write_bytes`) silently changes every
other worktree: dedupe only dependency trees (`node_modules`, which pnpm already hardlinks; skip
repos with a `patches/` dir or postinstall steps that write into `node_modules`) and git-tracked
asset folders that are clean in `git status`, and after an asset dedupe make the linked files
read-only (`find <dirs> -type f -links +1 -exec chmod a-w {} +`) so an in-place write fails loudly
instead. `git checkout` and `git pull` still work: git replaces files rather than writing into them.

```bash
hardlink -n -t -s 4k -x '/\.(vite|cache)(/|$)' <all node_modules dirs>   # dry run, prints "Saved"
flock ~/.cache/machine-checkup.heavy.lock ionice -c2 -n7 nice -n 10 \
  hardlink -t -s 4k -x '/\.(vite|cache)(/|$)' <same dirs>   # real: 23 GB on 2026-10-24, 87 GB on 2026-10-28
```

`hardlink` prints no progress and is idempotent: if a restart cuts a run, rerun the same command
(on 2026-10-28 it took 35 minutes for 6.4 million files). Build the directory list fresh on every
run, and drop worktrees that are a lane base or train, have a process cwd/fd/exe inside, or
changed in the last two hours; take the owner session's skip list first (rule 5), because a
linked tree that is rewritten in place changes every other tree. Afterwards check a sample:
link counts above 1, `require('next')` loads, `git status` clean. Worktrees skipped as busy get a
later pass.

Identical asset folders copied into every worktree (SportChat `public/images/chat-backgrounds/teams`
saved 13.7 GB) go the same way, after Nadav says yes.

After freeing a lot of space, run `sudo fstrim -v /` once at night (163 GiB took 15 minutes on
the MSI and stalls writes meanwhile).

### 4. Merge the reports into one decision round

- **DELETE-SAFE / REMOVE-SAFE**: do them, simulate apt first (`apt-get -s purge`, check for
  collateral; keep foreign-arch essentials like `libc6:i386` instead of `--allow-remove-essential`).
  Before retiring a unit: `systemctl list-dependencies --reverse <unit>`, any `.socket`/`.timer`/
  `.path` that activates it, and who talks to its port; disable it, then move the file to
  `/root/retired-tuning/` and `daemon-reload` (rollback = move back, reload, enable).
- **ARCHIVE**: `scripts/archive.sh <host>-<date>[-n] <paths>` in the background (new name per
  round; it refuses paths already in the archive, paths through symlinks, a full or unmounted
  archive disk, and archiving to the same machine). It writes a per-run receipt
  (`archive-<run>.receipt`: path, manifest, time) and exits 1 if anything failed. Right before
  deleting, run `scripts/archive.sh --check <receipt>`: it recomputes each source's manifest now
  and prints `OK` or `CHANGED`. Delete only `OK` lines, with literal-path `rm`; archive `CHANGED`
  ones again under a new name. Leave a `MOVED-TO-NADAVAI.txt` stub where other tools may look.
  `NOTE absolute symlink` lines in the run log point outside the copy: check them first.
  Wait for it with `tail --pid=<archive.sh PID> -f /dev/null` in a background command; a
  `pgrep -f` waiter matches itself or the wrong process.
- **ASK-NADAV**: AskUserQuestion batches, largest first. Typical questions: unused apps (with
  last-use date), toolchains, old project copies, swapfile size, kernel fallback, firewall
  exposure, background services that duplicate each other.
- **Owner sessions**: SendMessage requests for project scratch, design history, polling loops
  and throwaway-database durability (see the machine-load rule).

### 5. Tuning: verify, then improve only with an A/B

Verify the persistent settings are live (host notes below). For disk changes use
`scripts/disk-bench.sh <label> 45` per configuration, interleaved over three rounds, and judge
by the probe's p95/p99 and ">1 s" count against the writers' MB/s. Never trust a single round:
on 2026-10-23 the same config measured 157 ms and 280 ms p50 a few minutes apart.

For a CPU value (a power limit, a clock cap, an undervolt) the first question is whether it is
worth having at all: `heavy-slot -- scripts/cpu-ab.sh --pause '<units>' <rounds> '<reset>' base=true <name>='<apply>'`
runs real single-thread and 8-process V8 work under each configuration in interleaved rounds,
with whatever the machine is doing, and prints that work, the whole machine's work, thermal
throttle events, peak temperature and watts. `--pause` names the timers that would write the
tested value back mid-run (`legion-power-limits.timer`; on the MSI `cpu-maxfreq.timer` and
`msi-power-limits.timer`): without it every configuration measures the timer's value. Keep a value only when it wins by more than the spread between its own rounds. An
undervolt that does not win goes to 0 mV with no stress run. An all-core stress test does not
prove an undervolt safe (the MSI crashed in normal use at 89-93 C, not under stress), so beside
it watch `rasdaemon` and the CI flake rate. Tell the CI session before a measurement on a
machine that runs a CI agent, and pause the agent for it.

### 6. Updates and drivers, end to end

`scripts/update-audit.sh` (read-only; over ssh: `ssh host bash -s < scripts/update-audit.sh`)
reports every source with `ok`, `PENDING` (fix it now), `REBOOT` (finishes only with a reboot or
an app restart), `UNKNOWN` (the check failed, nothing proven) or `info`, and ends with a `RESULT:`
line (exit 0 current, 1 pending, 2 not verified, 3 reboot only; no `RESULT:` line = it did not
finish). It covers: repos, AUR,
the local .deb repacks in `~/.local/share/pkgbuilds/*/latest`, Node within its major, npm, pnpm
(including globals an older pnpm layout hid), pipx, uv, Rust, the self-updating CLIs, fwupd,
microcode against `intel-ucode`, BIOS against the vendor (Lenovo catalog, MSI download server, ASUS support API),
devices whose driver exists but is not bound, firmware load failures, DKMS, the NVIDIA module
against `nvidia-utils`, ELF files with missing libraries, old binaries in `~/.local/bin` that
shadow the pacman ones, the running kernel, and failed units. Fix each PENDING line, then run it
again until it prints `everything current`. A REBOOT line is acted on only under hard rule 1's
condition; otherwise list it for Nadav. UNKNOWN lines are rerun or checked by hand, never reported as current. Only
then say "everything is up to date"; on 2026-11-03 that sentence was wrong three times before
this script existed.

Fixes it usually leads to: `pacman -Syu`; `paru -Sua`; bump `pkgver` + `sha256sums` from the
`latest` script and `makepkg -si`; `fnm install <newest>`, reinstall the globals under it
(`--allow-scripts`), `fnm default`; `npm update -g`; `pnpm self-update` and `pnpm update -g
--latest`; `pipx upgrade-all`; `uv tool upgrade --all` and `uv python upgrade`; `uv self update`,
`deno upgrade`, `bun upgrade`, `grok update`, `agy update`, `sdkmanager --update`. Firmware, BIOS
and EC flashes only with Nadav's yes (his decision of 2026-11-14) and AC power (`fwupdmgr update --no-reboot-check`, never `-y`;
Secure Boot state first). Vendor drivers the hardware calls for, checked by
`lsusb`/`lspci`: msi-ec on MSI, openrazer for Razer, logiops for Logitech MX, intel-npu-driver
only where `/dev/accel*` exists, intel-compute-runtime for Intel GPU compute,
nvidia-container-toolkit + CDI for Docker GPU access.

### 7. Verify and record

- `df -h /`, `freeze-watch.py` again, `systemctl --failed`, `systemctl --user --failed`,
  `update-audit.sh`. Read `df`
  last, after the deletions: running agents add 3-10 GB an hour, so the figure from the middle of
  the round is already stale (61% became 64% during the 2026-10-28 archive).
- Append the round to `disk-cleanup-keep-list.md` (sizes, what was archived where, new lessons)
  and tuning results to the thermal/RAM memories.
- Tell Nadav in Hebrew: before and after numbers, what was archived and where, what is left and
  why (active, user data, or his decision), and whether a reinstall would still help (so far: no;
  the remaining limits were the NVMe drive, the cooling and the agent workload).

## Host notes

**Every home machine** shares one OS baseline, `hosts/common/` (`install.sh`, idempotent, stops
nothing; each host's `install.sh` calls it; `machine-baseline-check` prints it): `/tmp` on disk,
compressed swap twice the RAM, a reboot 10 s after a kernel oops, 1 GB of journal, rasdaemon,
weekly fstrim, and earlyoom set to end one process by the kernel's oom_score at 80% of swap,
before systemd-oomd takes a terminal at 90% (`hosts/common/earlyoom.default` says why each flag
is there and what it cannot do; do not add `--prefer`, `--avoid` or `--sort-by-rss`). Compressed swap is twice the RAM because systemd-oomd kills the Orca terminal with
the most swap at 90% of the uncompressed size: on the LENOVO on 2026-11-10 a 62 GB device stood at
56% while those pages took 5.8 GB of real memory (6.5 to 1) and 20 GB were free. A running
machine gets the second half as a hot-added `/dev/zram1` (no swapoff); after a reboot the
generator file makes one device. Heavy local jobs are admitted by `heavy-slot` on measured load
(`~/.config/nadavai/capacity` per host, `heavy-slot --help`): raise or lower its numbers only
from `heavy-slot --status` readings under real work, never to a fixed count again.

Per machine (hardware, every measurement, where each file lives): `references/host-notes.md`.
Read the machine's section before touching its tuning. In short:
- **LENOVO** (Legion Pro 5, Core Ultra 9 275HX, the main agent machine): `hosts/lenovo-83lu/`,
  check with `lenovo-tuning-check`. The firmware caps the CPU at 30 W on Linux, so check the
  power limits first.
- **MSI** (Pulse GL66, i7-11800H; also the CI agent): `hosts/msi-gl66/`, check with
  `msi-tuning-check`. Tell the CI session before a stress run or a reboot.
- **omarchy** (i7-9700K desktop): off since 2026-11-09; an unverified record in
  `hosts/omarchy/README.md`, with what to do before it rejoins the network.
