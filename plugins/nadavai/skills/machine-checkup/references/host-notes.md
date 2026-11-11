# Host notes

Per-machine hardware, measurements and where each tuning file lives. The baseline every machine
shares is in `../SKILL.md` (Host notes) and `../hosts/common/`.

**MSI** (Pulse GL66, i7-11800H, 64 GB, Kingston OM8PCP3512F NVMe, passwordless sudo). Reinstalled
on 2026-11-03 as CachyOS + KDE (user `nadavmsi`, fish shell, `ssh msi` = Tailscale `msi-1`),
provisioned from the LENOVO with tools only (memory `msi-reinstall-2026-11.md`). BIOS
E1581IMS.313 is the newest on download.msi.com; msi-ec now comes from AUR `msi-ec-dkms-git`
(EC 1581EMS1.107). It also runs a Woodpecker CI agent (owned by the CI session). The whole tuning
lives in `hosts/msi-gl66/`: after a reinstall run `hosts/msi-gl66/install.sh` (refuses any other
model or as root, idempotent), and `msi-tuning-check` shows each layer (ok/BAD per line, exit 1 on any BAD).
Also installs the lid-ignore drop-in (CI host), pins `bootctl set-default`, and sets rasdaemon's
`DISABLE="signal:signal_generate"`.
Measured on CachyOS on 2026-11-03: stock (EC mode unknown 192) ran 3.4 GHz at 51-59 W and 92-94 C,
on the throttle line. With Turbo + -50 mV core + 4.2 GHz cap, a 3 min matrixprod A/B with
`cooler_boost` on gave 40 W 2.8 GHz 85 C 0 throttles, 43 W +3% 89 C 2,604, 45 W +10% 92 C 7,124;
with the fans on auto, 40 W ran 88 C with 3,692 throttles. Kept 40/45 W (the 2026-10-27 MCE came at
89-93 C, and heat shrinks the undervolt margin) and `msi-fan-boost.service` (boost after >= 85 C for 9 s,
off after <= 65 C for 90 s, quiet at idle; a plain 80/65 C switch toggled the fans every ~30 s under
bursty CI load, which Nadav heard). Power limits live in `msi-power-limits.service` (+ a 1-minute timer) for both the MSR and MMIO
RAPL zones (intel-undervolt only writes the MSR and warned "MSR and memory values are not equal").
Undervolt: the effective core VID at a fixed 2.6 GHz (MSR 0x198 bits 47:32) was 819 mV at 0/0 and
774 mV at both -50/0 and -50/-50, so the cache plane follows the core: the 2026-10-27 "cache to 0"
fix changed nothing. Now -40 mV core (Nadav's choice, 10 mV under the crash). 10 min stress at -50: 0 MCE. NVMe: `disk-bench.sh`, 3 interleaved rounds: bfq probe p50 123-659 ms
against kyber's 369-1397 ms, and the small fsync writer 2-7x faster. kyber stalled 8-15 s; the cost
of bfq is ~25% less bulk write. Rounds 2-3 overlapped the CI agent's start, but every pair pointed the
same way. APST is off (PS4 exit latency 25 ms) live and in the boot entries plus `/etc/sdboot-manage.conf`.
The EFI default named the deleted Pop_OS entry, so it is now pinned with `bootctl set-default linux-cachyos.conf`.
CachyOS ananicy puts node/bun/rsync AND sshd/sshd-session in BG_CPUIO (SCHED_IDLE), so every command
run over ssh inherited idle priority. `/etc/ananicy.d/00-0-agents.rules` overrides both (as `zz-*` it
was ignored on this machine), and `agent-nice.timer` then puts Claude trees at nice 10 (proven:
0 -> 10 on all threads). The dGPU runtime-suspends with nothing on HDMI, so the old P0 pin was not
restored. With a screen on the HDMI port (wired to the dGPU, which then idles at P8 ~12 W on the
shared heat pipes) the final config (-40 mV, 40/45 W, boost) measured 2.9 GHz, 87 C avg, 92 C max,
1,468 throttle events per 150 s, clock not lower than without the screen; kept. 2026-11-03 15:54:18 the dGPU went to NV_ERR_RESET_REQUIRED ("Failed to get GCx pre-requisite" every 5 s, then CUDA_ERROR_NO_DEVICE): no CPU test ran then and the CI containers had no GPU access; cause unproven, a reboot clears it. If it recurs, try `NVreg_DynamicPowerManagement=0x02` (what Pop!_OS had), at the cost of the dGPU staying powered while kwin holds it. Drive wear: 59% used, 89.9 TB written, 0 media errors (watch it). The Pop!_OS files are
in the LENOVO's `~/Archive/msi-20261103/system/`. The old tuning, measured on Pop!_OS: msi-ec (DKMS, BeardOverflow) `shift_mode=turbo` via
`msi-turbo.service`; `intel-undervolt` -50 mV core/cache (-85 mV crashed), PL1 40 W / PL2 45 W;
`cpu-maxfreq.service` 4.2 GHz (same clock as 4.6 under the 40 W cap, 5-7 C cooler); HWP on and
OC Lock off in the hidden BIOS menu; NVMe `bfq`, `nr_requests 64`, `wbt_lat_usec 2000`,
`iostats 1` in `/etc/udev/rules.d/60-nvme-scheduler.rules`; fstrim weekly Sun 03:30;
`agent-nice.timer` (Claude trees at nice 10); `docker-wifi-block.service`; logind lid ignore;
battery charge stops at 80% since 2026-11-10 (`61-battery-charge.rules`; it held 74% of its design
capacity after living at 100% on AC);
SSH via Tailscale only. The GPU was pinned at its highest state: Nadav's choice then.

Undervolt worth test, 2026-11-10 (`scripts/cpu-ab.sh`, 5 interleaved rounds, CI agent paused for
3 m 43 s through `ci-agent`, four agent sessions working): -40 mV against 0 mV at the same
40/45 W gave whole-machine work 2368 (2301-2559) against 2186 (2062-2206), +8%, and 8-process
work 6318 against 5238, +20%; the ranges do not overlap, so the undervolt stays. Both ran at
94-96 C and throttled, so the machine is at its cooling limit and the undervolt is what buys
clock speed inside 40 W. What it does not prove is safety: watch `rasdaemon` and
`msi-tuning-check` ("no machine-check errors this boot") beside the CI flake rate, and go to
0 mV at the first machine-check event. Pending a reboot window from Nadav (he logs in after
it; tell the CI session first, it wants a Docker resolver change in the same reboot): 127
package updates with kernel 7.3.1 to 7.3.3, and `/tmp` moving to disk.

Reboot of 2026-11-10 (the only CI agent, so this matters): after `pacman -Su` (kernel 7.3.1 to
7.3.3, nvidia 615 to 620) `systemctl reboot` shut down cleanly at 18:03:51 and the machine then
stayed off for 13 minutes until Nadav pressed the power button; the 10-minute reboot watchdog
(`intel_oc_wdt`) did not bring it back. The Wi-Fi was not the cause: `Nadav_5G` connects at boot
with nobody logged in (psk-flags 0), and ssh answered before the desktop login. Two test reboots
right after, one with `/sys/kernel/reboot/type` = efi and one with the default acpi, each came
back by itself in 40 s. What the hung boot had and those did not: the dGPU's firmware had timed
out at 16:59:51 ("GSP Timeout", Xid 154, then "Failed to get GCx pre-requisite" every 5 s, 769
times) and the last kernel lines before the hang are NVIDIA's "Reset required". It is the fault
of 2026-11-03 again, so a faulted dGPU is the leading cause of a reboot that does not return;
not proven, because the fault cannot be produced on demand. `msi-tuning-check` now has a row for
it. Before a remote reboot of the MSI run `msi-tuning-check`: when the dGPU row is BAD, reboot
only with a person beside the machine. If the fault shows up again under nvidia 620, measure
`NVreg_DynamicPowerManagement=0x02` with `cpu-ab.sh` (the card then stays powered, about 12 W on
the shared heat pipes) before choosing it. A search on 2026-11-10 found the same fault class
reported across open-module versions 580 to 610 with no fix confirmed by NVIDIA (an RTX 3070
Mobile with an HDMI screen: https://forums.developer.nvidia.com/t/driver-580-gsp-firmware-crash-xid-120-154-on-rtx-3070-mobile-with-hdmi-display-535-works-with-gsp-disabled/364770 ;
GC6 exit: https://forums.developer.nvidia.com/t/gsp-rm-firmware-bug-heartbeat-stops-after-gc6-exit-leads-to-fatal-gpu-loss-xid-79-and-broken-display-recovery/366591 ),
so there is nothing to apply on evidence yet; the two levers people report are the runtime power
setting and the driver version.
It came back under nvidia 620.70.06 on 2026-11-10 at 23:05, five hours after boot:
`gpuWaitForGfwBootComplete_TU102: failed to wait for GFW_BOOT`, then Xid 119 (GSP RPC timeout),
`nvidia-smi` showing "[GPU requires reset]", `nvidia-cdi-refresh.service` failing on "error
getting MIG mode: GPU requires reset", and "GCx pre-requisite" every 5 s. Found by
`update-audit.sh` and `msi-tuning-check` on 2026-11-11; the GFW_BOOT line points at the card
waking from runtime sleep, which makes the `NVreg_DynamicPowerManagement=0x02` measurement the
next step.

Correction, 2026-11-11, read in NVIDIA's own README (chapter "PCI-Express Runtime D3 (RTD3) Power
Management", https://download.nvidia.com/XFree86/Linux-x86_64/570.144/README/dynamicpowermanagement.html):
`NVreg_DynamicPowerManagement=0x02` is fine-grained power control, and the default `0x03` already
means the same on Ampere and newer notebooks; this card is an RTX 3070 Mobile (GA104M) and
`/proc/driver/nvidia/params` shows 3. So every line above that names `0x02` as the setting that
keeps the card powered is wrong: `0x02` changes nothing here. What keeps the card awake is `0x00`
(module option, needs a reboot) or, live and without a reboot,
`echo on | sudo tee /sys/bus/pci/devices/0000:01:00.0/power/control` (`auto` puts it back; the
driver's own udev rule sets `auto` at bind). The next step is therefore, after a reboot that
clears the fault (with a person beside the machine, the reboot may not return): measure
`power/control` `on` against `auto` with `scripts/cpu-ab.sh` and the CI agent paused (heat and
work at the 40 W limit, since the card shares the heat pipes), and when the cost is acceptable
make it permanent with a udev rule on the card's bind event, then count the days without a
fault. That the fault comes from waking out of runtime sleep is the leading reading (the
GFW_BOOT line), not a proven one: the 2026-11-10 fault began at 16:59 and this one at 23:05
with no suspend or resume line near either.

Reproduced and fixed, 2026-11-11 evening. A session on the MSI updated and rebooted it at
22:15 with the card faulted: black screen until Nadav held the power button, so a faulted card
hung the reboot 2 times of 2 and a healthy one returned 2 of 2. Then `cpu-ab.sh` alternated
`power/control` between `auto` and `on` (CI paused 22:21 to 22:27): on the third forced wake-up,
at 22:23:11 under full CPU load at 95 C, the driver logged "failed to wait for GFW_BOOT ...
gpu_suspend.c:220", then the GSP timeout and "GPU requires reset". So the cause is the wake from
runtime sleep, and it can be produced on demand by toggling `power/control` under load. The two
rounds before the fault showed no cost of an awake card (whole-machine work 3420 and 3275 awake
against 3178 and 3035 asleep; one CI workflow was still running, so treat it as "no loss beyond
the spread", not a gain). Fix: `hosts/msi-gl66/72-nvidia-stay-awake.rules` sets
`power/control` to `on` when the driver binds, `install.sh` installs it and `msi-tuning-check`
has a row for it. Do not toggle `power/control` back to `auto` to measure anything: that is the
trigger. If the fault ever shows with the card held awake, the wake-up reading is wrong and the
next candidate is the driver version.

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

Measured again on 2026-11-10 under real agent load (load average 50): 110/125 W does 6% more
whole-machine work than 100/110 W and 9% more than 90/110 W, at 99-101 C with about 400 thermal
throttle events per 18 s (none at 100 W); a clock cap changed nothing; the dGPU drew 4 W. The
limits stay, and the machine is at its cooling limit: more speed now means better cooling, not
more watts. The 30 node SIGSEGV coredumps of that day were one program (the SportChat v4
calibration kit, same crash offset each time), so they are not evidence of bad hardware. CPU
share between the desktop and the agents is already split by cgroup (`app.slice`,
`session.slice` and Orca's `orca_ptys_*` slice each weigh 100), so nice values only matter inside
one terminal. Still pending, all needing Nadav's hands: memtest86+ overnight, BIOS Instant boot,
the SAGV A/B.

**Omarchy / NadavAI** (`ssh omarchy` = `nadav@100.93.63.88`, fish shell, passwordless sudo; ASUS ROG
STRIX Z390-F GAMING, BIOS 2203 = newest on the ASUS support API, i7-9700K, 46 GB, GTX 1660 Ti,
NVIDIA 615; usually no monitor attached). Reinstalled on 2026-11-03 as CachyOS + KDE and provisioned
from the LENOVO without desktop apps (memory `omarchy-provision-2026-11.md`). It runs CI for every
repo, owned by another session: never touch `~/ci`, the runners or dagu from here. BIOS settings
survive a reinstall (DDR4-2666 manual, not XMP, because the kits are mixed; VT-x; SpeedShift; BIOS
power limits off), so after a reinstall only the OS layer comes back: PL1 140 W in
`/etc/tmpfiles.d/rapl-pl1.conf` (unlimited reached 93-97 C under CI and throttled),
`power-profiles-daemon` enabled and set to performance with `sudo`, `/etc/sysctl.d/99-omarchy-restore.conf`
(the rest of the old sysctl file is already in `70-cachyos-settings.conf`), USB autosuspend off, and
the `LABEL=data` line in fstab, and `intel-undervolt` -70 mV core and cache (`enable yes`,
service enabled; the MSR is not locked on this board). Measured 2026-11-03 with 5 min stress-ng
`--verify` (8 CPU + 2x6 GB VM): stock 4.6-4.7 GHz, max 88 C; -50 mV 4.7 GHz, 87 C, 133 W; -80 mV
4.7 GHz, 84 C, 130 W; all 0 throttle events and 0 failures. -70 keeps a 10 mV margin under the
tested -80; if CI shows unexplained crashes or rasdaemon logs MCEs, go back to -50 before anything
else. RAM stays at 2666 (mixed 3200 and 2400 kits, already above the slower kit's rating; any change
is in the BIOS with a monitor attached, then memtest86+). The GPU power limit (130 of 160 W) is left
at default: CI barely uses the GPU. The 2 TB disk is a 7200 rpm HDD (bfq): archives
and CI data only, never tools, because nothing makes it as fast as the NVMe. Archive target:
`/mnt/data/archive/<host>-<date>/`. Do not move agent work there unless a measurement shows spare
capacity.

While omarchy is away (off since 2026-11-09) its values are recorded, unverified, in
`hosts/omarchy/README.md`, with what to do before it rejoins the network.

**New NVMe for the MSI**: clone the old drive to the new one, boot from it, then run this skill's
step 5 again; the bfq/nr_requests choice was made for the old drive and must be re-measured.
