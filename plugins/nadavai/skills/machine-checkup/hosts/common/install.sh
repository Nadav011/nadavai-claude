#!/bin/bash
# The OS baseline that every home machine shares (LENOVO, MSI, omarchy), whatever its hardware.
# Idempotent. Stops nothing that runs: no reboot, no swapoff, no unmount. What only a reboot
# applies is printed at the end. Run as the desktop user (it sudos itself); each host's
# install.sh calls it first. Check afterwards with `machine-baseline-check`.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
[ "$EUID" -ne 0 ] || { echo "run as the desktop user, not root; the script sudos itself" >&2; exit 1; }
later=()

# /tmp on disk: no tmpfs line in fstab, tmp.mount masked, a 3-day clean.
if grep -qE '^[^#]*[[:space:]]/tmp[[:space:]]+tmpfs' /etc/fstab; then
  sudo install -d -m 700 /root/retired-tuning
  sudo cp -p /etc/fstab "/root/retired-tuning/fstab.$(date +%Y%m%d-%H%M%S)"
  sudo sed -i -E '/^[^#]*[[:space:]]\/tmp[[:space:]]+tmpfs/ s/^/# machine-checkup, \/tmp on disk: /' /etc/fstab
fi
[ "$(systemctl is-enabled tmp.mount 2>/dev/null)" = masked ] || sudo systemctl mask tmp.mount >/dev/null 2>&1
sudo install -m 644 "$here/tmp.conf" /etc/tmpfiles.d/tmp.conf
[ "$(findmnt -no FSTYPE /tmp 2>/dev/null)" = tmpfs ] && later+=("/tmp is still tmpfs until the next reboot")

# Compressed swap twice the RAM. The generator file applies at boot; until then a second device
# makes up the difference, added live.
sudo install -m 644 "$here/zram-generator.conf" /etc/systemd/zram-generator.conf
ram_kb=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
zram_kb=$(awk '$1 ~ /^\/dev\/zram/ { s += $3 } END { print s + 0 }' /proc/swaps)
if [ "$zram_kb" -lt $((ram_kb * 19 / 10)) ] && [ -e /sys/class/zram-control/hot_add ]; then
  add_kb=$((ram_kb * 2 - zram_kb))
  id=$(sudo cat /sys/class/zram-control/hot_add)
  echo zstd | sudo tee "/sys/block/zram$id/comp_algorithm" >/dev/null
  echo "${add_kb}K" | sudo tee "/sys/block/zram$id/disksize" >/dev/null
  sudo mkswap -q "/dev/zram$id"
  sudo swapon -p 100 "/dev/zram$id"
  echo "added /dev/zram$id ($((add_kb / 1048576)) GB) live"
fi

# After a kernel oops, reboot 10 s later instead of limping on; keep 1 GB of journal.
sudo install -m 644 "$here/60-oops-reboot.conf" /etc/sysctl.d/60-oops-reboot.conf
sudo sysctl -q -p /etc/sysctl.d/60-oops-reboot.conf
sudo install -D -m 644 "$here/60-journal-size.conf" /etc/systemd/journald.conf.d/60-journal-size.conf
sudo systemctl restart systemd-journald

# rasdaemon records machine-check and memory errors; v1.0 logs every SIGCHLD unless signal
# tracing is disabled.
if pacman -Q rasdaemon >/dev/null 2>&1; then
  grep -q '^DISABLE="signal:signal_generate"' /etc/sysconfig/rasdaemon 2>/dev/null ||
    echo 'DISABLE="signal:signal_generate"' | sudo tee -a /etc/sysconfig/rasdaemon >/dev/null
  systemctl is-active -q rasdaemon || sudo systemctl enable --now rasdaemon
else
  later+=("rasdaemon is not installed: paru -S rasdaemon, then run this again")
fi

systemctl is-enabled -q fstrim.timer 2>/dev/null || sudo systemctl enable --now fstrim.timer
install -D -m 755 "$here/machine-baseline-check" "$HOME/.local/bin/machine-baseline-check"
for l in "${later[@]}"; do echo "LATER: $l"; done
"$HOME/.local/bin/machine-baseline-check" || true
