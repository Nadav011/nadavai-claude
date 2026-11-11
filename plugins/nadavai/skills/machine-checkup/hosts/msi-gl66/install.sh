#!/bin/bash
# Restore the measured MSI tuning (Pulse GL66 11UGKV, i7-11800H) after a reinstall on CachyOS/Arch.
# Idempotent. Refuses to run on any other model or as root (it sudos itself).
# Run as the desktop user, e.g. from the LENOVO:  ssh msi 'bash ~/nadavai/plugins/nadavai/skills/machine-checkup/hosts/msi-gl66/install.sh < /dev/null'
# Needs in the BIOS (hidden menu, survives a reinstall): Intel Speed Shift on, Overclocking Lock off.
# Context and measurements: ../../references/host-notes.md.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
[ "$EUID" -ne 0 ] || { echo "run as the desktop user, not root; the script sudos itself" >&2; exit 1; }
model=$(cat /sys/class/dmi/id/product_name 2>/dev/null)
[ "$model" = "Pulse GL66 11UGKV" ] || { echo "not an MSI Pulse GL66 11UGKV (product_name=$model); nothing installed" >&2; exit 1; }

# The baseline shared by every home machine: /tmp on disk, swap size, oops reboot, journal, rasdaemon.
"$here/../common/install.sh"

# Packages: msi-ec from AUR (the in-tree msi_ec refuses EC 1581EMS1.107), intel-undervolt, tools for the check.
for p in intel-undervolt msr-tools turbostat stress-ng fio nvme-cli; do pacman -Q "$p" >/dev/null 2>&1 || sudo pacman -S --needed --noconfirm "$p"; done
pacman -Q msi-ec-dkms-git >/dev/null 2>&1 || paru -S --needed --noconfirm msi-ec-dkms-git
sudo modprobe msr
oc=$(sudo rdmsr -p0 0x194)
if (( (0x$oc >> 20) & 1 )); then echo "WARNING: Overclocking Lock is on in the BIOS; the undervolt will not apply" >&2; fi

# CPU: EC Turbo, -50 mV core (effective -45 mV; the cache plane follows the core on this CPU), PL1 40 /
# PL2 45 W in both RAPL zones (re-applied every minute), 4.2 GHz cap, fans boosted only under load.
echo msi-ec | sudo tee /etc/modules-load.d/msi-ec.conf >/dev/null
sudo modprobe msi-ec   # loud failure here if the DKMS build failed (missing headers)
sudo install -m 644 "$here/intel-undervolt.conf" /etc/intel-undervolt.conf
sudo install -m 755 "$here/msi-fan-boost" /usr/local/bin/msi-fan-boost
sudo install -m 644 "$here/msi-turbo.service" "$here/cpu-maxfreq.service" "$here/msi-power-limits.service" \
  "$here/msi-power-limits.timer" "$here/cpu-maxfreq.timer" "$here/msi-fan-boost.service" "$here/docker-wifi-block.service" /etc/systemd/system/

# Always-on box (CI agent): closing the lid must not suspend it.
sudo install -D -m 644 "$here/50-lid-ignore.conf" /etc/systemd/logind.conf.d/50-lid-ignore.conf

# DNS for the CI step containers (CI session, 2026-11-10): the home router was the only resolver, and
# every clone failure of that week was "Could not resolve host: github.com". Docker copies the host's
# list into each new container, so the Wi-Fi connection gets two public resolvers behind the router.
if nmcli -g connection.id connection show Nadav_5G >/dev/null 2>&1; then
  nmcli connection modify Nadav_5G ipv4.dns "192.168.1.1 1.1.1.1 9.9.9.9" ipv4.ignore-auto-dns yes
  nmcli device reapply wlan0 >/dev/null 2>&1 || true
fi

# dGPU: never in runtime sleep (its firmware fails to wake, and then the next reboot hangs).
sudo install -m 644 "$here/72-nvidia-stay-awake.rules" /etc/udev/rules.d/
echo on | sudo tee /sys/bus/pci/devices/0000:01:00.0/power/control >/dev/null

# Battery: stop charging at 80% (always on AC).
sudo install -m 644 "$here/61-battery-charge.rules" /etc/udev/rules.d/
echo 80 | sudo tee /sys/class/power_supply/BAT1/charge_control_end_threshold >/dev/null

# Disk: bfq rule (won the fsync A/B) and APST off (PS4 exit latency 25 ms on this Kingston).
sudo install -m 644 "$here/60-nvme-scheduler.rules" /etc/udev/rules.d/
P='nvme_core.default_ps_max_latency_us=0'
for e in /boot/loader/entries/linux-cachyos.conf /boot/loader/entries/linux-cachyos-lts.conf; do
  if sudo test -f "$e" && ! sudo grep -q "$P" "$e"; then sudo sed -i "/^options[[:space:]]/ s/\$/ $P/" "$e"; fi
done
if [ -f /etc/sdboot-manage.conf ] && ! grep -q "$P" /etc/sdboot-manage.conf; then
  sudo sed -i "s/^LINUX_OPTIONS=[\"']\(.*\)[\"']/LINUX_OPTIONS=\"\1 $P\"/" /etc/sdboot-manage.conf
fi
echo 0 | sudo tee /sys/class/nvme/nvme0/power/pm_qos_latency_tolerance_us >/dev/null   # live, until the reboot
# The EFI default may still name an old distro's entry; pin the one that boots.
sudo test -f /boot/loader/entries/linux-cachyos.conf && sudo bootctl set-default linux-cachyos.conf

# Scheduling: agents at nice 10 instead of CachyOS's SCHED_IDLE; sshd at normal priority.
sudo install -m 644 "$here/99-dev-limits.conf" /etc/sysctl.d/
sudo install -m 644 "$here/00-0-agents.rules" /etc/ananicy.d/
install -D -m 755 "$here/agent-nice" "$HOME/.local/bin/agent-nice"
install -D -m 644 "$here/agent-nice.service" "$HOME/.config/systemd/user/agent-nice.service"
install -D -m 644 "$here/agent-nice.timer" "$HOME/.config/systemd/user/agent-nice.timer"
install -D -m 755 "$here/msi-tuning-check" "$HOME/.local/bin/msi-tuning-check"

# Never locked (Nadav, 2026-11-03): no auto-lock, no Meta+L, and a listener that opens any lock that still happens
# (the screen locked twice in the first hour with Autolock already off, so the cause is unknown).
install -D -m 755 "$here/msi-keep-unlocked" "$HOME/.local/bin/msi-keep-unlocked"
install -D -m 644 "$here/msi-keep-unlocked.service" "$HOME/.config/systemd/user/msi-keep-unlocked.service"
if command -v kwriteconfig6 >/dev/null; then
  kwriteconfig6 --file kscreenlockerrc --group Daemon --key Autolock false
  kwriteconfig6 --file kscreenlockerrc --group Daemon --key LockOnResume false
  kwriteconfig6 --file kglobalshortcutsrc --group ksmserver --key 'Lock Session' $'none,Screensaver\tMeta+L,Lock Session'
fi

sudo sysctl -q -p /etc/sysctl.d/99-dev-limits.conf
sudo udevadm control --reload && sudo udevadm trigger -s block --sysname-match='nvme*' -c change
sudo systemctl daemon-reload
sudo systemctl enable --now msi-turbo.service intel-undervolt.service cpu-maxfreq.service cpu-maxfreq.timer msi-power-limits.timer msi-fan-boost.service
# restart, not start: an older unit file had RemainAfterExit=yes, and an "active (exited)" oneshot is not re-run
sudo systemctl restart msi-power-limits.service cpu-maxfreq.service msi-fan-boost.service
if systemctl list-unit-files docker.service >/dev/null 2>&1; then sudo systemctl enable --now docker-wifi-block.service; fi
sudo systemctl restart ananicy-cpp
systemctl --user daemon-reload && systemctl --user enable --now agent-nice.timer msi-keep-unlocked.service
echo "APST off in the boot entries takes effect at the next reboot (live already). The lid drop-in needs a logind restart or reboot."
"$HOME/.local/bin/msi-tuning-check"
