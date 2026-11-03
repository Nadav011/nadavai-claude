#!/usr/bin/env bash
# On nadavai-vm or nadavai-svc (as ubuntu, uses sudo). Installs nadavai-alert / nadavai-watch /
# nadavai-watch-http, /etc/nadavai/alert.env (from /tmp/alert.env), and a 5-minute user timer
# that runs ~/.config/nadavai/checks.sh (written per host by the caller as /tmp/checks.sh).
set -euo pipefail
for f in nadavai-alert nadavai-watch nadavai-watch-http; do sudo install -o root -g root -m 755 "/tmp/$f" "/usr/local/bin/$f"; done
sudo install -d -o root -g root -m 755 /etc/nadavai
if [ -f /tmp/alert.env ]; then sudo install -o root -g ubuntu -m 640 /tmp/alert.env /etc/nadavai/alert.env; rm -f /tmp/alert.env; fi
command -v jq >/dev/null || sudo apt-get -y -qq install jq >/dev/null
install -d "$HOME/.config/nadavai" "$HOME/.config/systemd/user"
install -m 755 /tmp/checks.sh "$HOME/.config/nadavai/checks.sh"
cat > "$HOME/.config/systemd/user/nadavai-checks.service" <<'EOF'
[Unit]
Description=NadavAI cross-host health checks (alerts by email after 2 failures)
After=network-online.target
[Service]
Type=oneshot
ExecStart=%h/.config/nadavai/checks.sh
EOF
cat > "$HOME/.config/systemd/user/nadavai-checks.timer" <<'EOF'
[Unit]
Description=Run NadavAI health checks every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true
[Install]
WantedBy=timers.target
EOF
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now nadavai-checks.timer 2>&1 | grep -v "^Created symlink" ; systemctl --user is-enabled --quiet nadavai-checks.timer || { echo "timer not enabled" >&2; exit 1; }
systemctl --user start nadavai-checks.service || true
journalctl --user -u nadavai-checks.service -n 8 --no-pager -q -o cat
