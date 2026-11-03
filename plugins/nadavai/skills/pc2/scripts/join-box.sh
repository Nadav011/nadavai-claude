#!/usr/bin/env bash
# join-box.sh: put a freshly (re)installed Linux box under full remote control from the main machine.
#
# Run ON THE BOX, from the normal user:
#   sudo bash join-box.sh '<ssh public key line>' <name>
# <name> becomes the OS hostname and the Tailscale node name (for example msi or omarchy).
#
# It installs and enables Tailscale and OpenSSH, authorizes the key, makes sshd key-only, gives the user
# passwordless sudo, stops the box from sleeping (lid, suspend, hibernate), and joins the tailnet.
# Safe to run again. See the pc2 skill for how to deliver it and what to do afterwards.
set -euo pipefail

usage() {
  echo "Usage: sudo bash $0 '<ssh public key line>' <name>" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || { echo "Run it with sudo." >&2; usage; }
U="${SUDO_USER:-}"
if [ -z "$U" ] || [ "$U" = root ]; then
  echo "Run it with sudo from your normal user, not from a root shell." >&2
  exit 1
fi

KEY="${1:-}"
NAME="${2:-}"
case "$KEY" in
  *$'\n'*) echo "The key must be one line." >&2; usage ;;
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *|sk-*\ *) ;;
  *) echo "The first argument must be an ssh public key line." >&2; usage ;;
esac
case "$NAME" in
  ''|-*|*[!a-z0-9-]*) echo "The name must be lowercase letters, digits and dashes." >&2; usage ;;
esac

HOME_DIR="$(getent passwd "$U" | cut -d: -f6)"
GROUP="$(id -gn "$U")"

pm_install() {
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
  elif command -v pacman >/dev/null 2>&1; then
    pacman -S --needed --noconfirm "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  else
    echo "No apt, pacman or dnf found; install $* by hand." >&2
    exit 1
  fi
}

echo "== 1/7 Hostname: $NAME"
hostnamectl set-hostname "$NAME"
if grep -q '^127\.0\.1\.1' /etc/hosts; then
  sed -i "s/^127\.0\.1\.1[[:space:]].*/127.0.1.1  $NAME/" /etc/hosts
else
  printf '127.0.1.1  %s\n' "$NAME" >> /etc/hosts
fi

echo "== 2/7 Tailscale"
command -v curl >/dev/null 2>&1 || pm_install curl
command -v tailscale >/dev/null 2>&1 || curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled

echo "== 3/7 OpenSSH server"
if ! command -v sshd >/dev/null 2>&1 && [ ! -x /usr/sbin/sshd ]; then
  if command -v pacman >/dev/null 2>&1; then pm_install openssh; else pm_install openssh-server; fi
fi

echo "== 4/7 Authorized key for $U"
install -d -m 700 -o "$U" -g "$GROUP" "$HOME_DIR/.ssh"
touch "$HOME_DIR/.ssh/authorized_keys"
grep -qxF "$KEY" "$HOME_DIR/.ssh/authorized_keys" || printf '%s\n' "$KEY" >> "$HOME_DIR/.ssh/authorized_keys"
chown "$U:$GROUP" "$HOME_DIR/.ssh/authorized_keys"
chmod 600 "$HOME_DIR/.ssh/authorized_keys"

echo "== 5/7 Key-only sshd"
install -d /etc/ssh/sshd_config.d
if ! grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config; then
  sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config
fi
cat > /etc/ssh/sshd_config.d/10-hardened.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
# A fresh Arch install has no host keys until sshd first starts, and "sshd -t" fails without them.
ssh-keygen -A
sshd -t
if systemctl cat ssh.service >/dev/null 2>&1; then SSHSVC=ssh; else SSHSVC=sshd; fi
systemctl enable --now "$SSHSVC"
systemctl restart "$SSHSVC"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow in on tailscale0 >/dev/null
fi

echo "== 6/7 Passwordless sudo for $U, and no sleep"
SUDOERS="/etc/sudoers.d/99-${U}-nopasswd"
printf '%s ALL=(ALL) NOPASSWD: ALL\n' "$U" > "$SUDOERS.tmp"
chmod 440 "$SUDOERS.tmp"
visudo -cf "$SUDOERS.tmp" >/dev/null
mv "$SUDOERS.tmp" "$SUDOERS"
install -d /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/50-lid-ignore.conf <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
EOF
systemctl kill -s HUP systemd-logind || true
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

echo "== 7/7 Join the tailnet (open the link it prints and approve it)"
if tailscale status >/dev/null 2>&1; then
  tailscale set --hostname="$NAME"
else
  tailscale up --hostname="$NAME"
fi

TSIP="$(tailscale ip -4 | head -n1)"
echo
echo "=================== READY ==================="
echo "user=$U host=$(hostname) tailscale_ip=$TSIP"
ss -ltn 2>/dev/null | grep -q ':22 ' && echo "sshd: listening on :22" || echo "sshd: NOT listening on :22"
echo "Send the 'user=' line above back to the main machine."
