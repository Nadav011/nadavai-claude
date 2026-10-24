---
name: machine-checkup
description: "Full checkup of one of Nadav's Linux machines: why it freezes or is slow, a complete inventory of the disk, deleting and archiving everything that is not needed without losing anything, retiring dead services and conflicting tuning, and verifying the result with measurements. The in-place alternative to reinstalling the OS. Use when Nadav types /machine-checkup or says the computer is stuck, slow, freezing, Orca freezes, the disk is full, clean the computer, scan everything, \"תנקה את המחשב\", \"למה המחשב נתקע\", \"המחשב איטי\", \"הדיסק מלא\", \"לעשות פרמוט\", or asks to get the machine to 100% known."
---
# machine-checkup

One round takes a few hours, most of it background scans and copies. Nadav runs it regularly.
State of the previous round lives in memory: `disk-cleanup-keep-list.md` (what never to touch,
per-round logs and lessons), `msi-thermal-diagnosis-2026-10.md` and
`ram-pressure-chrome-kills-2026-09-29.md` (tuning history). Read all three first.

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
| Codex `~/.codex/.tmp/marketplaces/.staging/*` older than 1 h, `~/.cache/codex-update-manager/{workspaces,packages}` not in use | `rm -rf` by literal name; MSI has `codex-leftovers-clean.timer` for this |
| npm `_cacache`, deno, trivy, pip, pnpm metadata, uv, go-build caches, `go clean -modcache` | only when the tool is not running |
| `node_modules`, `.next`, `.turbo`, `.expo`, `.vite` in worktrees idle 2+ days | skip anything `git ls-files` tracks and anything other worktrees symlink into |
| Anonymous Docker volumes with no container | list `docker volume ls -qf dangling=true`, inspect each (`CreatedAt`, size, a `PG_VERSION` file means a database); remove by name only the ones older than 2 days whose creating stack is gone; never `docker volume prune`, never named volumes (the Green Room `supabase_*_jfqwucrzhzojelrptqxb` volumes look reclaimable and are not) |
| Installer downloads whose installed version is newer, old plugin cache versions no live session started from, unused Playwright browsers, apt cache | `apt-get clean`; vacuum the journal (`--vacuum-time=14d`) only after a freeze investigation is closed, the journal is its evidence |

Then dedupe instead of deleting anything still in use. Hardlinked files share one inode, so an
in-place write in one worktree (Node `fs.writeFile`, Python `write_bytes`) silently changes every
other worktree: dedupe only dependency trees (`node_modules`, which pnpm already hardlinks; skip
repos with a `patches/` dir or postinstall steps that write into `node_modules`) and git-tracked
asset folders that are clean in `git status`, and after an asset dedupe make the linked files
read-only (`find <dirs> -type f -links +1 -exec chmod a-w {} +`) so an in-place write fails loudly
instead. `git checkout` and `git pull` still work: git replaces files rather than writing into them.

```bash
hardlink -n -t -s 4k <all node_modules dirs>     # dry run, prints "Saved"
hardlink -t -s 4k <same dirs>                     # real: 23 GB on 2026-10-24, nothing deleted
```

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

### 6. Verify and record

- `df -h /`, `freeze-watch.py` again, `systemctl --failed`, `systemctl --user --failed`.
- Append the round to `disk-cleanup-keep-list.md` (sizes, what was archived where, new lessons)
  and tuning results to the thermal/RAM memories.
- Tell Nadav in Hebrew: before and after numbers, what was archived and where, what is left and
  why (active, user data, or his decision), and whether a reinstall would still help (so far: no;
  the remaining limits were the NVMe drive, the cooling and the agent workload).

## Host notes

**MSI** (Pulse GL66, i7-11800H, 64 GB, Kingston OM8PCP3512F NVMe, passwordless sudo). Settings
that must stay live, all measured: msi-ec (DKMS, BeardOverflow) `shift_mode=turbo` via
`msi-turbo.service`; `intel-undervolt` -50 mV core/cache (-85 mV crashed), PL1 40 W / PL2 45 W;
`cpu-maxfreq.service` 4.2 GHz (same clock as 4.6 under the 40 W cap, 5-7 C cooler); HWP on and
OC Lock off in the hidden BIOS menu; NVMe `bfq`, `nr_requests 64`, `wbt_lat_usec 2000`,
`iostats 1` in `/etc/udev/rules.d/60-nvme-scheduler.rules`; fstrim weekly Sun 03:30;
`agent-nice.timer` (Claude trees at nice 10); `docker-wifi-block.service`; logind lid ignore;
SSH via Tailscale only. The GPU stays pinned at its highest state: Nadav's choice.

**Omarchy / NadavAI** (`ssh omarchy`, no sudo, runs all CI). Archive target:
`/mnt/data/archive/<host>-<date>/` on the 2 TB disk. Do not move agent work there unless a
measurement shows spare capacity.

**New NVMe for the MSI**: clone the old drive to the new one, boot from it, then run this skill's
step 5 again; the bfq/nr_requests choice was made for the old drive and must be re-measured.
