#!/usr/bin/env bash
# Read-only scan for what a copy from another machine (or distro) leaves broken. Run it on the
# machine that received the copy. Every line it prints is something to fix or to explain.
# Why: the 2026-11-03 MSI -> LENOVO copy brought home, /opt and /usr/share but not the distro's
# packages or the /usr/bin links a .deb postinst makes: Claude Pet lacked three libraries, Grok and
# Codex had no launcher or icon, old Ubuntu binaries (hurl, fd -> fdfind, kitty) shadowed the
# pacman ones, and wacli-sync arrived masked by a /dev/null link copied from the old machine.
main() {
set -u
out() { printf '%s\n' "$*"; }

out "== ELF files with missing libraries (~/.local/bin, ~/bin, /usr/local/bin, /opt)"
while IFS= read -r -d '' f; do
  head -c4 "$f" 2>/dev/null | grep -q $'\x7fELF' || continue
  case "$f" in *libqt5_shim.so) continue;; esac
  m=$(ldd "$f" 2>/dev/null | grep 'not found' | awk '{print $1}' | sort -u | tr '\n' ' ')
  [ -n "$m" ] && out "  $f: $m   (pacman -F <lib> finds the package)"
done < <(find -L "$HOME/.local/bin" "$HOME/bin" /usr/local/bin /opt -maxdepth 3 -type f -perm -u+x -print0 2>/dev/null)

out "== dangling links in bin dirs"
find "$HOME/.local/bin" "$HOME/bin" /usr/local/bin /usr/bin -maxdepth 1 -xtype l -printf '  %p -> %l\n' 2>/dev/null

out "== scripts whose interpreter is missing"
for f in "$HOME"/.local/bin/* "$HOME"/bin/*; do
  [ -f "$f" ] || continue; l=$(head -1 "$f" 2>/dev/null | tr -d '\0')
  case "$l" in '#!'*) ;; *) continue;; esac
  i=$(printf '%s' "${l#\#!}" | awk '{print $1}')
  if [ "$i" = /usr/bin/env ]; then i2=$(printf '%s' "${l#\#!}" | awk '{print ($2=="-S"?$3:$2)}'); command -v "$i2" >/dev/null || out "  $f: env $i2"
  else [ -x "$i" ] || out "  $f: $i"; fi
done

out "== ~/.local/bin entries that shadow a different /usr/bin binary (old copies win on PATH)"
for f in "$HOME"/.local/bin/*; do
  n=$(basename "$f"); [ -e "/usr/bin/$n" ] || continue
  t=$(readlink -f "$f"); [ "$t" = "$(readlink -f "/usr/bin/$n")" ] && continue
  case "$t" in /usr/*) continue;; esac
  out "  $n: $t hides /usr/bin/$n"
done

out "== desktop entries whose program or icon is missing"
for f in /usr/share/applications/*.desktop "$HOME"/.local/share/applications/*.desktop "$HOME"/.config/autostart/*.desktop; do
  [ -f "$f" ] || continue
  e=$(grep -m1 '^Exec=' "$f" | sed 's/^Exec=//' | awk '{for(i=1;i<=NF;i++){ if($i=="env"||$i ~ /^[A-Za-z_]+=/) continue; print $i; exit}}' | tr -d '"')
  [ -n "$e" ] && ! command -v "$e" >/dev/null 2>&1 && [ ! -x "$e" ] && out "  exec  $f -> $e"
  i=$(grep -m1 '^Icon=' "$f" | cut -d= -f2)
  if [ -n "$i" ] && [ "${i#/}" = "$i" ]; then
    find /usr/share/icons /usr/share/pixmaps "$HOME/.local/share/icons" -name "$i.*" -print -quit 2>/dev/null | grep -q . || out "  icon  $f -> $i"
  elif [ -n "$i" ] && [ ! -e "$i" ]; then out "  icon  $f -> $i"; fi
done 2>/dev/null | grep -v -E 'org\.kde\.kiod6|kcm_netpref|lstopo'

out "== user units: missing ExecStart, masked by a /dev/null link, or enabled-but-dead"
for f in "$HOME"/.config/systemd/user/*.service; do
  [ -e "$f" ] || continue
  if [ "$(readlink "$f")" = /dev/null ]; then out "  masked $(basename "$f") (a copied mask? systemctl --user unmask)"; continue; fi
  grep -E '^ExecStart' "$f" 2>/dev/null | sed 's/^ExecStart[^=]*=//; s/^[-@!+]*//' | awk '{print $1}' | while read -r e; do
    e=${e//%h/$HOME}; [ "$e" = /usr/bin/env ] && continue
    command -v "$e" >/dev/null 2>&1 || [ -x "$e" ] || out "  $(basename "$f"): ExecStart $e missing"
  done
done
for l in "$HOME"/.config/systemd/user/*.wants/*; do [ -L "$l" ] && [ ! -e "$l" ] && out "  dangling wants link $l"; done 2>/dev/null

out "== unowned files under /usr/bin, /usr/lib (top level), /opt, /usr/share/applications"
owned=$(mktemp); pacman -Qlq 2>/dev/null | sed 's#/$##' | sort -u > "$owned"
{ ls -d /opt/* 2>/dev/null; find /usr/bin /usr/lib /usr/share/applications -maxdepth 1 -mindepth 1 2>/dev/null; } | sort -u | comm -23 - "$owned" |
  grep -v -E '^/usr/lib/(modules|python3)|mimeinfo.cache|/opt/containerd' | sed 's/^/  /'
rm -f "$owned"

out "== Debian/Ubuntu names left in configs (fdfind, batcat, apt-get, dpkg)"
grep -I -l -E '\b(fdfind|batcat|apt-get|dpkg -i)\b' "$HOME"/.local/bin/* "$HOME"/bin/* "$HOME"/.bashrc "$HOME"/.zshrc 2>/dev/null | sed 's/^/  /'   # -I: text files only

out "== wrapper scripts whose target is missing (exec \"\$HOME/...\" lines)"
for f in "$HOME"/.local/bin/*; do
  [ -f "$f" ] && ! head -c4 "$f" 2>/dev/null | grep -q $'\x7fELF' || continue
  grep -o -E '(exec|REAL_[A-Z]+=)[[:space:]]*"?\$HOME/[^" ]+' "$f" 2>/dev/null | sed -E 's/^(exec|REAL_[A-Z]+=)[[:space:]]*"?//' | while read -r t; do
    p=${t/\$HOME/$HOME}; [ -e "$p" ] || out "  $(basename "$f") -> $t"
  done
done

out "== known hosts that still carry the old machine's key for this one"
for h in localhost 127.0.0.1 "$(hostname)"; do
  ssh-keygen -F "$h" -f "$HOME/.ssh/known_hosts" >/dev/null 2>&1 || continue
  timeout 5 ssh -n -o BatchMode=yes -o ControlPath=none -o ConnectTimeout=3 "$h" true 2>&1 | grep -q 'Host key verification failed' && out "  $h (ssh-keygen -R $h)"
done
out "done"
}

# The body is a function so bash reads all of it first: under `ssh host bash -s < script` a child
# that reads stdin would otherwise eat the rest of the script.
main "$@" < /dev/null
