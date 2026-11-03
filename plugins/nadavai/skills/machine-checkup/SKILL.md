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
   sessions and 10-hour workflows at all times.
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
   about something that is provably regenerable or orphaned; delete it. Approval gates still
   apply: firewall/SSH/auth changes, DB deletions and paid items need his yes.
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
```

Decide which resource is the bottleneck before touching anything: CPU (0% idle, run queue far
above the thread count), memory (memory PSI, earlyoom kills in the journal), or disk (I/O PSI,
D-state tasks in `jbd2_log_wait_commit` / `folio_wait_bit_common` / `rq_qos_wait`).

If Nadav says the disk grew since a date ("a week ago we were at 67%"), the inventory audit must
answer it: list directories created since then (`find -maxdepth 3 -newermt`) and measure real
bytes per inode set, not `du` per tree. On 2026-10-28 this found 48 new SportChat v4 worktrees,
each with its own `npm ci` (about 2.5 GB, link count 1): 89% became 61% with one `hardlink` pass.

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

### 6. Updates and drivers, end to end

`scripts/update-audit.sh` (read-only; over ssh: `ssh host bash -s < scripts/update-audit.sh`)
reports every source with `ok`, `PENDING` (fix it now), `REBOOT` (finishes only with a reboot or
an app restart), `UNKNOWN` (the check failed, nothing proven) or `info`, and ends with a `RESULT:`
line (exit 0 current, 1 pending, 2 not verified, 3 reboot only; no `RESULT:` line = it did not
finish). It covers: repos, AUR,
the local .deb repacks in `~/.local/share/pkgbuilds/*/latest`, Node within its major, npm, pnpm
(including globals an older pnpm layout hid), pipx, uv, Rust, the self-updating CLIs, fwupd,
microcode against `intel-ucode`, BIOS against the vendor (Lenovo catalog, MSI download server),
devices whose driver exists but is not bound, firmware load failures, DKMS, the NVIDIA module
against `nvidia-utils`, ELF files with missing libraries, old binaries in `~/.local/bin` that
shadow the pacman ones, the running kernel, and failed units. Fix each PENDING line, then run it
again until it prints `everything current`. REBOOT lines are never acted on here (hard rule 1):
list them for Nadav. UNKNOWN lines are rerun or checked by hand, never reported as current. Only
then say "everything is up to date"; on 2026-11-03 that sentence was wrong three times before
this script existed.

Fixes it usually leads to: `pacman -Syu`; `paru -Sua`; bump `pkgver` + `sha256sums` from the
`latest` script and `makepkg -si`; `fnm install <newest>`, reinstall the globals under it
(`--allow-scripts`), `fnm default`; `npm update -g`; `pnpm self-update` and `pnpm update -g
--latest`; `pipx upgrade-all`; `uv tool upgrade --all` and `uv python upgrade`; `uv self update`,
`deno upgrade`, `bun upgrade`, `grok update`, `agy update`, `sdkmanager --update`. Firmware, BIOS
and EC flashes only with Nadav's yes and AC power (`fwupdmgr update --no-reboot-check`, never `-y`;
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

**MSI** (Pulse GL66, i7-11800H, 64 GB, Kingston OM8PCP3512F NVMe, passwordless sudo). Reinstalled
on 2026-11-03 as CachyOS + KDE (user `nadavmsi`, fish shell, `ssh msi` = Tailscale `msi-1`),
provisioned from the LENOVO with tools only (memory `msi-reinstall-2026-11.md`). BIOS
E1581IMS.313 is the newest on download.msi.com; msi-ec now comes from AUR `msi-ec-dkms-git`
(EC 1581EMS1.107) with nothing set. None of the tuning below is active since the reinstall; the
Pop!_OS files are in the LENOVO's `~/Archive/msi-20261103/system/` and come back only with an
A/B (step 5). The old tuning, measured on Pop!_OS: msi-ec (DKMS, BeardOverflow) `shift_mode=turbo` via
`msi-turbo.service`; `intel-undervolt` -50 mV core/cache (-85 mV crashed), PL1 40 W / PL2 45 W;
`cpu-maxfreq.service` 4.2 GHz (same clock as 4.6 under the 40 W cap, 5-7 C cooler); HWP on and
OC Lock off in the hidden BIOS menu; NVMe `bfq`, `nr_requests 64`, `wbt_lat_usec 2000`,
`iostats 1` in `/etc/udev/rules.d/60-nvme-scheduler.rules`; fstrim weekly Sun 03:30;
`agent-nice.timer` (Claude trees at nice 10); `docker-wifi-block.service`; logind lid ignore;
SSH via Tailscale only. The GPU was pinned at its highest state: Nadav's choice then.

**LENOVO** (Legion Pro 5 16IAX10H, Core Ultra 9 275HX 24 cores, 62 GB, RTX 5070 Ti, CachyOS,
BIOS Q6CN79WW = latest per `download.lenovo.com/catalog/83LU_Win11.xml`; the main machine since
2026-11-03). On Linux the firmware leaves `intel-rapl-mmio:0` at 30/30 W, so check that first:
`legion-power-limits.timer` (script `/usr/local/bin/legion-power-limits`, every 15 s, plus udev on
ADP0 and a system-sleep hook) sets PL1 110 W / PL2 125 W / tau 28 s in `performance` on AC
(measured: 4-6x the work of 30 W, 85-87 C sustained, 0 throttle events; PL2 160 gained 6% on bursts
at 104 C). `platform_profile` rejects `custom` and lenovo-wmi-other `ppt_*` writes return EBUSY, so
the script owns the limit. Undervolt is locked (MSR 0x194 bit 20). BIOS options are readable without
a reboot from efivars (`Setup-a04a27f4`, `CpuSetup-b08f97ff`, `SaSetup-72c5e28c`, 4-byte header;
offsets from the IFR of the official image) but writes are refused (EACCES), so BIOS changes are made
in F2. Read the dGPU's sleep state from `runtime_status`, never `nvidia-smi` (it wakes the card).
rasdaemon needs `DISABLE="signal:signal_generate"` or it logs every SIGCHLD. Every file lives in
`hosts/lenovo-83lu/`: after a reinstall run `hosts/lenovo-83lu/install.sh` (refuses any other
model, idempotent), and `lenovo-tuning-check` shows each layer. A change to the live script is
copied back there and committed. Details: memory `lenovo-performance-tuning-2026-11.md`.

**Omarchy / NadavAI** (`ssh omarchy`, no sudo, runs CI for every repo; the MSI also builds
therapy-flow-v2 branch heads through `nadavai-slot.service`). Archive target:
`/mnt/data/archive/<host>-<date>/` on the 2 TB disk. Do not move agent work there unless a
measurement shows spare capacity.

**New NVMe for the MSI**: clone the old drive to the new one, boot from it, then run this skill's
step 5 again; the bfq/nr_requests choice was made for the old drive and must be re-measured.
