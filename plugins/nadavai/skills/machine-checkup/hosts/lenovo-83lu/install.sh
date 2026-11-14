#!/bin/bash
# Restore the measured LENOVO tuning (Legion Pro 5 16IAX10H, type 83LU) after a reinstall.
# Idempotent. Refuses to run on any other model. Context: ../../references/host-notes.md.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
model=$(cat /sys/class/dmi/id/product_name 2>/dev/null)
[ "$model" = 83LU ] || { echo "not a Legion Pro 5 16IAX10H (product_name=$model); nothing installed" >&2; exit 1; }
# The baseline shared by every home machine: /tmp on disk, swap size, oops reboot, journal, rasdaemon.
"$here/../common/install.sh"
sudo install -m 755 "$here/legion-power-limits" /usr/local/bin/legion-power-limits
sudo install -m 644 "$here/legion-power-limits.service" "$here/legion-power-limits.timer" /etc/systemd/system/
sudo install -m 644 "$here/99-legion-power-limits.rules" /etc/udev/rules.d/
sudo install -m 755 "$here/legion-power-limits.sleep" /usr/lib/systemd/system-sleep/legion-power-limits
# Crash record (2026-11-14): a 60 s panic screen, and the kernel's last messages kept in a
# reserved RAM region across the reboot (ramoops.modprobe.conf says why not the firmware store).
# The boot option takes effect at the next reboot; lenovo-tuning-check shows which state it is in.
sudo install -m 644 "$here/61-lenovo-panic-screen.conf" /etc/sysctl.d/61-lenovo-panic-screen.conf
sudo sysctl -q -p /etc/sysctl.d/61-lenovo-panic-screen.conf
sudo install -m 644 "$here/ramoops.modprobe.conf" /etc/modprobe.d/ramoops.conf
sudo install -D -m 644 "$here/pstore-ramoops.conf" /etc/systemd/system/systemd-pstore.service.d/ramoops.conf
if ! grep -q 'reserve_mem=4M:4096:oops' /etc/sdboot-manage.conf; then
  sudo cp -a /boot/loader/entries "/root/loader-entries.before-ramoops.$(date +%Y%m%d-%H%M%S)"
  sudo sed -i -E 's/^(LINUX_OPTIONS="[^"]*)"/\1 reserve_mem=4M:4096:oops"/' /etc/sdboot-manage.conf
  grep -q 'reserve_mem=4M:4096:oops' /etc/sdboot-manage.conf || { echo "could not add reserve_mem to /etc/sdboot-manage.conf" >&2; exit 1; }
  sudo sdboot-manage gen
fi
sudo systemctl enable systemd-pstore.service
# Wi-Fi (2026-11-14): the RTL8922AE card stays on Wi-Fi 6 and never sleeps (the dispatcher file says why).
sudo install -m 755 -o root -g root "$here/90-wifi6-rtl8922ae" /etc/NetworkManager/dispatcher.d/90-wifi6-rtl8922ae
sudo install -m 644 "$here/60-wifi-powersave-off.conf" /etc/NetworkManager/conf.d/60-wifi-powersave-off.conf
sudo nmcli general reload conf
install -m 755 "$here/lenovo-tuning-check" "$HOME/.local/bin/lenovo-tuning-check"
sudo systemctl daemon-reload
sudo udevadm control --reload
sudo systemctl enable --now legion-power-limits.timer
sudo systemctl start legion-power-limits.service
# Always on AC: keep the battery near 80%.
echo 1 | sudo tee /sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode >/dev/null
powerprofilesctl set performance
"$HOME/.local/bin/lenovo-tuning-check"
