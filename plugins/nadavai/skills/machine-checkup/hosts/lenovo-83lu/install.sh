#!/bin/bash
# Restore the measured LENOVO tuning (Legion Pro 5 16IAX10H, type 83LU) after a reinstall.
# Idempotent. Refuses to run on any other model. Context: ../../SKILL.md host notes.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
model=$(cat /sys/class/dmi/id/product_name 2>/dev/null)
[ "$model" = 83LU ] || { echo "not a Legion Pro 5 16IAX10H (product_name=$model); nothing installed" >&2; exit 1; }
sudo install -m 755 "$here/legion-power-limits" /usr/local/bin/legion-power-limits
sudo install -m 644 "$here/legion-power-limits.service" "$here/legion-power-limits.timer" /etc/systemd/system/
sudo install -m 644 "$here/99-legion-power-limits.rules" /etc/udev/rules.d/
sudo install -m 755 "$here/legion-power-limits.sleep" /usr/lib/systemd/system-sleep/legion-power-limits
install -m 755 "$here/lenovo-tuning-check" "$HOME/.local/bin/lenovo-tuning-check"
# Crash forensics (2026-11-04): auto-reboot after a kernel oops, and a 1G journal.
sudo install -m 644 "$here/60-oops-reboot.conf" /etc/sysctl.d/60-oops-reboot.conf
sudo install -d -m 755 /etc/systemd/journald.conf.d
sudo install -m 644 "$here/60-journal-size.conf" /etc/systemd/journald.conf.d/60-journal-size.conf
sudo sysctl -q -p /etc/sysctl.d/60-oops-reboot.conf
sudo systemctl restart systemd-journald
sudo systemctl daemon-reload
sudo udevadm control --reload
sudo systemctl enable --now legion-power-limits.timer
sudo systemctl start legion-power-limits.service
# Always on AC: keep the battery near 80%.
echo 1 | sudo tee /sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode >/dev/null
powerprofilesctl set performance
# rasdaemon (AUR) records MCE/AER; v1.0 logs every SIGCHLD unless signal tracing is disabled.
if pacman -Q rasdaemon >/dev/null 2>&1; then
  grep -q '^DISABLE="signal:signal_generate"' /etc/sysconfig/rasdaemon || echo 'DISABLE="signal:signal_generate"' | sudo tee -a /etc/sysconfig/rasdaemon >/dev/null
  sudo systemctl enable --now rasdaemon
else
  echo "rasdaemon not installed: paru -S rasdaemon, then rerun this script"
fi
"$HOME/.local/bin/lenovo-tuning-check"
