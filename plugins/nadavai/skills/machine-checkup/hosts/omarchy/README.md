# omarchy (ASUS ROG STRIX Z390-F GAMING, i7-9700K, 46-48 GB, GTX 1660 Ti)

**Unverified record.** Written on 2026-11-10 from the notes of 2026-11-03, while the machine was
off (since 2026-11-09 16:38 UTC, by Nadav, with no return date). Nothing here was read from the
machine itself, so there is no install script yet: a script nobody ran against the hardware is
worse than none. When the machine is back, read each value below from it, then turn this file
into `install.sh` and `omarchy-tuning-check` like the other hosts.

## Before it rejoins the network
- Disable its secscan user timers first (`secscan-poll.timer`, `secscan-nightly.timer`). The
  security scanner moved to the Oracle VM `nadavai-svc` on 2026-11-10, and two scanners would post
  the same `nadavai-security` commit status.
- Run `hosts/common/install.sh` (the shared baseline), then `machine-baseline-check`.

## BIOS (set by Nadav, survives a reinstall; BIOS 2203)
- VT-x on, Speed Shift on, Restore AC Power Loss = Power On.
- CPU power limits removed in the BIOS; the limit is set from Linux instead (below).
- Memory at DDR4-2666, set by hand, not XMP: the kits are mixed (3200 and 2400) and have no ECC.
  memtest86+ passed at 2666. Any change is made in the BIOS with a monitor attached, then memtest.

## OS layer (comes back only by hand after a reinstall)
| What | Value | Where | Measured 2026-11-03 |
|---|---|---|---|
| Package power limit | PL1 140 W | `/etc/tmpfiles.d/rapl-pl1.conf` | unlimited drew about 170 W and throttled at 93-97 C; at 140 W 4.7 GHz held, max 85 C |
| Undervolt | -70 mV core and cache | `intel-undervolt` (`/etc/intel-undervolt.conf`, service enabled) | 5 min `stress-ng --verify` passed at -50 and at -80; -70 keeps 10 mV under the tested -80 |
| Power profile | performance | `power-profiles-daemon` | |
| sysctl | `tcp_mtu_probing`, `watermark_scale_factor = 125` | `/etc/sysctl.d/99-omarchy-restore.conf` | |
| USB autosuspend | off | | |
| Data disk | `LABEL=data` on `/mnt/data` | `/etc/fstab` | a 7200 rpm disk: archives and CI data only, never tools |
| GPU power limit | 130 of 160 W, left at default | | CI barely uses the GPU |

## Open questions for the first session that has the machine
- The undervolt passed only a 5-minute stress. On a machine that produces CI verdicts, a
  marginal undervolt shows up as a crash or a wrong result in a test, which reads as a flaky
  test. Run `scripts/cpu-ab.sh` first (0 mV against -70 mV): when -70 does not win by more than
  the spread between rounds, set 0 mV and skip the stress run. If it stays, log machine-check
  events (`rasdaemon`) beside the CI flake rate; on unexplained crashes go back to -50 mV first.
- `/mnt/data` holds the only copy of the archive of the projects moved to the MSI and of Green
  Room's 25 GB of artifacts. Make a second copy before anything else is done with that disk.
- It is the CI box: do not load it with other heavy jobs, and never touch `~/ci` from here.
