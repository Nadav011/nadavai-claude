#!/usr/bin/env bash
# Run on nadavai-vm with sudo: installs the WAHA watchdog. Expects /tmp/waha-watchdog and /tmp/waha.env.
set -euo pipefail
install -m 755 /tmp/waha-watchdog /usr/local/bin/waha-watchdog
install -d -m 755 /etc/nadavai
install -m 600 /tmp/waha.env /etc/nadavai/waha.env
shred -u /tmp/waha.env
cat > /etc/systemd/system/waha-watchdog.service <<'EOF'
[Unit]
Description=WAHA WhatsApp watchdog (emails Nadav when WAHA or a session is down)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/waha-watchdog
EOF
cat > /etc/systemd/system/waha-watchdog.timer <<'EOF'
[Unit]
Description=Run the WAHA watchdog every 2 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now waha-watchdog.timer
systemctl start waha-watchdog.service
systemctl status waha-watchdog.service --no-pager | tail -3
