#!/usr/bin/env bash
# Run on nadavai-svc with sudo, from a folder holding age.pub and vm-pull.pub (REVIEW-1 F8).
# Daily backup of the WAHA session store (the WhatsApp link keys and message store):
#  - each SQLite database copied with sqlite3 .backup (consistent while WAHA runs) and checked with integrity_check;
#  - tar | age to one public key (the private key is in Nadav's vault only, ~/.claude/secrets/waha-backup-age.key);
#  - 14 kept here; nadavai-vm pulls the newest each day over the private network (a forced-command key that can only
#    print the newest encrypted file), so a lost VM does not lose the links. Nothing leaves Oracle.
set -euo pipefail
cd "$(dirname "$0")"
install -d -m 755 /etc/nadavai
install -m 644 age.pub /etc/nadavai/waha-backup-age.pub
cat > /usr/local/bin/waha-backup <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
src=/opt/waha/sessions; d=/var/backups/waha; install -d -m 755 "$d"
tmp=$(mktemp -d); trap 'rm -rf "${tmp:?}"' EXIT
mkdir -p "$tmp/sessions"
cd "$src"
find . -type d -exec mkdir -p "$tmp/sessions/{}" \;
find . -type f ! -name '*-wal' ! -name '*-shm' -print0 | while IFS= read -r -d '' f; do
  if head -c 16 "$f" | grep -q 'SQLite format 3'; then
    sqlite3 "$f" ".backup '$tmp/sessions/$f'"
    [ "$(sqlite3 "$tmp/sessions/$f" 'PRAGMA integrity_check;')" = ok ] || { echo "integrity check failed: $f" >&2; exit 1; }
  else
    cp -p "$f" "$tmp/sessions/$f"
  fi
done
out="$d/sessions-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.age"
tar -C "$tmp" -czf - sessions | age -R /etc/nadavai/waha-backup-age.pub > "$out.tmp"
mv "$out.tmp" "$out"; chmod 644 "$out"
ls -1t "$d"/sessions-*.tar.gz.age | tail -n +15 | xargs -r rm -f
# Old unencrypted copies from the first version.
rm -f "$d"/sessions-*.tar.gz
EOF
chmod 755 /usr/local/bin/waha-backup
cat > /usr/local/bin/waha-backup-latest <<'EOF'
#!/usr/bin/env bash
# Forced command for nadavai-vm's pull key: prints the newest encrypted backup, nothing else.
set -euo pipefail
f=$(ls -1t /var/backups/waha/sessions-*.tar.gz.age 2>/dev/null | head -1)
[ -n "$f" ] || exit 3
echo "# $(basename "$f")" >&2
cat "$f"
EOF
chmod 755 /usr/local/bin/waha-backup-latest
ak=/home/ubuntu/.ssh/authorized_keys
line="restrict,command=\"/usr/local/bin/waha-backup-latest\",from=\"10.0.0.81\" $(cat vm-pull.pub)"
grep -qF "$(cut -d' ' -f2 vm-pull.pub)" "$ak" || echo "$line" >> "$ak"
systemctl start waha-backup.service
ls -l /var/backups/waha
