#!/usr/bin/env bash
# Installs wp-watchdog as a user timer for ubuntu on the Oracle VM. The token arrives on stdin.
set -euo pipefail
umask 077
mkdir -p ~/wp-watchdog ~/.config/systemd/user
cat > ~/wp-watchdog/token
install -m 700 /tmp/wp-watchdog.py ~/wp-watchdog/wp-watchdog.py
cat > ~/.config/systemd/user/wp-watchdog.service <<'U'
[Unit]
Description=Cancel and restart Woodpecker runs orphaned by an agent restart
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 %h/wp-watchdog/wp-watchdog.py
U
cat > ~/.config/systemd/user/wp-watchdog.timer <<'U'
[Unit]
Description=wp-watchdog every 2 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
U
sudo loginctl enable-linger ubuntu
systemctl --user daemon-reload
systemctl --user enable --now wp-watchdog.timer
python3 ~/wp-watchdog/wp-watchdog.py && echo "first run ok"
systemctl --user list-timers wp-watchdog.timer --no-legend | head -1
