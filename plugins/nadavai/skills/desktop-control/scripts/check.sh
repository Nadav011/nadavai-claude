#!/usr/bin/env bash
# Report which desktop-control capabilities work on this machine right now.
# Read-only. Exit 0 when everything is ready, 1 when something is missing.
# Run setup.sh to fix what it reports.
set -uo pipefail

AD_VERSION=1.1.0
fail=0
ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  MISS  %s  -> %s\n' "$1" "$2"; fail=1; }
note() { printf '  note  %s\n' "$1"; }

echo "session: ${XDG_SESSION_TYPE:-?} / ${XDG_CURRENT_DESKTOP:-?}"
case "${XDG_CURRENT_DESKTOP:-}" in
  *KDE*) ;;
  *) note "verified only on KDE Plasma (Wayland); kdotool, window-content.sh, type.sh layout switching and screenshot.sh need KWin/Spectacle" ;;
esac

if command -v agent-desktop >/dev/null; then
  v=$(agent-desktop version 2>/dev/null | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["data"]["version"])' 2>/dev/null)
  [ "$v" = "$AD_VERSION" ] && ok "agent-desktop $v" || note "agent-desktop $v (skill written for $AD_VERSION)"
  s=$(agent-desktop status 2>/dev/null)
  grep -q '"window"' <<<"$s" && ok "AT-SPI accessibility bus answers" || bad "AT-SPI bus" "run inside the graphical session; see agent-desktop skills get platform"
else
  bad "agent-desktop" "setup.sh"
fi

command -v ydotool >/dev/null && ok "ydotool installed" || bad "ydotool" "setup.sh"
systemctl --user is-active -q ydotool && ok "ydotoold service running" || bad "ydotoold service" "systemctl --user enable --now ydotool"
[ -w /dev/uinput ] && ok "/dev/uinput writable" || bad "/dev/uinput not writable" "needs a uaccess udev rule; ask Nadav (permission change)"

if command -v qdbus6 >/dev/null && [[ "${XDG_CURRENT_DESKTOP:-}" == *KDE* ]]; then
  dev=""
  for n in $(qdbus6 org.kde.KWin /org/kde/KWin/InputDevice org.freedesktop.DBus.Introspectable.Introspect 2>/dev/null | grep -o 'node name="[^"]*"' | cut -d'"' -f2); do
    [ "$(qdbus6 org.kde.KWin /org/kde/KWin/InputDevice/$n org.freedesktop.DBus.Properties.Get org.kde.KWin.InputDevice name 2>/dev/null)" = "ydotoold virtual device" ] && dev=$n
  done
  if [ -z "$dev" ]; then bad "ydotoold virtual device not seen by KWin" "start the ydotool service"
  elif [ "$(qdbus6 org.kde.KWin /org/kde/KWin/InputDevice/$dev org.freedesktop.DBus.Properties.Get org.kde.KWin.InputDevice pointerAccelerationProfileFlat)" = true ]; then ok "ydotool pointer on flat acceleration (exact moves)"
  else bad "ydotool pointer acceleration is not flat" "setup.sh"; fi
fi

command -v kdotool >/dev/null && ok "kdotool (window focus/move/size, cursor location)" || bad "kdotool" "setup.sh"
command -v spectacle >/dev/null && ok "spectacle (screenshots)" || bad "spectacle" "install spectacle"
command -v magick >/dev/null && ok "imagemagick (window crops)" || bad "imagemagick" "install imagemagick"
command -v wl-copy >/dev/null && ok "wl-clipboard (Hebrew typing by paste)" || bad "wl-clipboard" "install wl-clipboard"
[ -r /usr/include/linux/input-event-codes.h ] && ok "key code table" || bad "input-event-codes.h" "install linux-api-headers"

grep -qs '^QT_ACCESSIBILITY=1' "$HOME/.config/environment.d/"*.conf && ok "Qt/KDE apps set to expose accessibility (QT_ACCESSIBILITY=1)" || bad "QT_ACCESSIBILITY not set" "setup.sh, then log out and in"
ps_pid=$(pgrep -xo plasmashell || true)
if [ -n "$ps_pid" ] && ! tr '\0' '\n' <"/proc/$ps_pid/environ" 2>/dev/null | grep -q '^QT_ACCESSIBILITY=1'; then
  note "this login predates QT_ACCESSIBILITY: apps opened from the KDE launcher stay invisible until Nadav logs out and in (or launch them with QT_ACCESSIBILITY=1)"
fi
grep -qsx -- '--force-renderer-accessibility' "$HOME/.config/chrome-flags.conf" && ok "Chrome flag --force-renderer-accessibility" || bad "Chrome accessibility flag" "setup.sh, then restart Chrome"
pgrep -af '/opt/google/chrome/chrome' 2>/dev/null | grep -v -- '--type=' | grep -q -- '--force-renderer-accessibility' || { pgrep -f /opt/google/chrome/chrome >/dev/null && note "running Chrome started without the flag: its pages stay invisible to agent-desktop until Chrome restarts"; }

exit $fail
