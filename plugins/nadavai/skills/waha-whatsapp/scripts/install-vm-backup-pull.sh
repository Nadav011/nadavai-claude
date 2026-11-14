#!/usr/bin/env bash
# Run on nadavai-vm with sudo: pull the newest encrypted WAHA backup from nadavai-svc daily at 03:00, keep 14.
set -euo pipefail
cat > /usr/local/bin/waha-backup-pull <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
d=/var/backups/waha-offsite; install -d -m 755 "$d"
tmp="$d/.incoming"
ssh -i /root/.ssh/waha-backup-pull -o BatchMode=yes -o StrictHostKeyChecking=accept-new ubuntu@10.0.0.61 > "$tmp" 2>"$d/.name"
name=$(sed -n 's/^# //p' "$d/.name" | head -1)
[ -n "$name" ] && [ -s "$tmp" ] || { echo "waha-backup-pull: nothing pulled" >&2; nadavai-alert "WAHA backup: pull failed" "nadavai-vm could not pull the WAHA backup from nadavai-svc"; exit 1; }
mv "$tmp" "$d/$name"
# The newest backup must be under 26 h old (REVIEW-1 R3): a backup that stopped being made on nadavai-svc is told.
stamp=$(sed -n 's/^sessions-\([0-9]\{8\}T[0-9]\{6\}Z\).*/\1/p' <<<"$name")
made=$(date -u -d "$(sed -E 's/(....)(..)(..)T(..)(..)(..)Z/\1-\2-\3 \4:\5:\6/' <<<"$stamp")" +%s 2>/dev/null || echo 0)
if [ $(( $(date +%s) - made )) -gt $((26 * 3600)) ]; then
  nadavai-alert "WAHA backup: stale" "The newest WAHA backup on nadavai-svc is $name, older than 26 hours: waha-backup.timer on nadavai-svc is not producing backups (systemctl status waha-backup.service there)."
fi
ls -1t "$d"/sessions-*.tar.gz.age | tail -n +15 | xargs -r rm -f
EOF
chmod 755 /usr/local/bin/waha-backup-pull
cat > /etc/systemd/system/waha-backup-pull.service <<'EOF'
[Unit]
Description=Pull the WAHA session backup from nadavai-svc
[Service]
Type=oneshot
ExecStart=/usr/local/bin/waha-backup-pull
EOF
cat > /etc/systemd/system/waha-backup-pull.timer <<'EOF'
[Unit]
Description=Daily pull of the WAHA session backup
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now waha-backup-pull.timer
systemctl start waha-backup-pull.service
ls -l /var/backups/waha-offsite
