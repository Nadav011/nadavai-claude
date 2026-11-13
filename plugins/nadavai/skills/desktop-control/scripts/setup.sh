#!/usr/bin/env bash
# Idempotent setup of desktop control on a KDE Plasma (Wayland) machine on Arch/CachyOS.
# Installs: agent-desktop (npm, pinned), ydotool + kdotool + helpers (pacman/paru),
# enables the ydotoold user service, sets the ydotool pointer to flat acceleration,
# exposes Qt apps (QT_ACCESSIBILITY=1) to the accessibility bus. Changes no
# permission: /dev/uinput must already be writable by the user (systemd's uaccess
# rule does that on a local seat). Chrome gets no accessibility flag on purpose: it
# would cost memory and CPU on every page Nadav opens, and web pages go through the
# browser routing instead. Afterwards: log out and in (Qt). Then run check.sh.
set -euo pipefail

AD_VERSION=1.1.0
log() { printf '>> %s\n' "$*"; }

[[ "${XDG_CURRENT_DESKTOP:-}" == *KDE* ]] || { echo "this setup targets KDE Plasma; current desktop: ${XDG_CURRENT_DESKTOP:-unknown}" >&2; exit 3; }
[ -w /dev/uinput ] || { echo "/dev/uinput is not writable by $USER; that needs a uaccess udev rule: add it with sudo and name it in the report" >&2; exit 3; }

need=()
for p in ydotool spectacle imagemagick wl-clipboard linux-api-headers; do pacman -Q "$p" >/dev/null 2>&1 || need+=("$p"); done
if [ ${#need[@]} -gt 0 ]; then log "pacman: ${need[*]}"; sudo pacman -S --needed --noconfirm "${need[@]}"; fi
if ! command -v kdotool >/dev/null; then
  command -v paru >/dev/null || { echo "kdotool comes from the AUR and paru is missing" >&2; exit 3; }
  # PKGBUILD reviewed 2026-11-03 (0.3.0, Arch TU maintainer, checksummed GitHub tarball).
  # A newer pkgver deserves a fresh look at the PKGBUILD before this line runs.
  log "AUR: kdotool"; paru -S --needed --noconfirm --skipreview kdotool
fi

if [ "$(agent-desktop version 2>/dev/null | grep -o '"version":"[0-9.]*"}' | grep -o '[0-9][0-9.]*' || true)" != "$AD_VERSION" ]; then
  log "npm: agent-desktop@$AD_VERSION"; npm install -g "agent-desktop@$AD_VERSION"
fi

log "ydotoold user service"
systemctl --user enable --now ydotool >/dev/null 2>&1 || systemctl --user enable --now ydotool
sleep 1

log "flat acceleration for the ydotoold virtual device (KWin saves it by device name)"
dev=""
for _ in 1 2 3 4 5; do
  for n in $(qdbus6 org.kde.KWin /org/kde/KWin/InputDevice org.freedesktop.DBus.Introspectable.Introspect | grep -o 'node name="[^"]*"' | cut -d'"' -f2); do
    [ "$(qdbus6 org.kde.KWin /org/kde/KWin/InputDevice/$n org.freedesktop.DBus.Properties.Get org.kde.KWin.InputDevice name 2>/dev/null)" = "ydotoold virtual device" ] && dev=$n
  done
  [ -n "$dev" ] && break; sleep 1
done
[ -n "$dev" ] || { echo "KWin does not list the ydotoold virtual device" >&2; exit 4; }
qdbus6 org.kde.KWin /org/kde/KWin/InputDevice/$dev org.freedesktop.DBus.Properties.Set org.kde.KWin.InputDevice pointerAccelerationProfileFlat true
qdbus6 org.kde.KWin /org/kde/KWin/InputDevice/$dev org.freedesktop.DBus.Properties.Set org.kde.KWin.InputDevice pointerAcceleration 0

envf="$HOME/.config/environment.d/50-accessibility.conf"
if ! grep -qs '^QT_ACCESSIBILITY=1' "$HOME/.config/environment.d/"*.conf; then
  log "QT_ACCESSIBILITY=1 -> $envf (takes effect at next login)"
  mkdir -p "$(dirname "$envf")"
  [ ! -s "$envf" ] || [ -z "$(tail -c1 "$envf")" ] || echo >>"$envf"
  printf '%s\n' '# Expose Qt (KDE) apps on the AT-SPI accessibility bus for agent-desktop.' 'QT_ACCESSIBILITY=1' >>"$envf"
fi

log "done; run check.sh"
