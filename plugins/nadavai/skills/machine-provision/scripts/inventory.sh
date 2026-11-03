#!/usr/bin/env bash
# Print everything installed on this machine as "##section" blocks, one item per line, for
# compare.py. Read-only. Run it on both machines:
#   inventory.sh > src.txt;  ssh target bash -s < inventory.sh > dst.txt;  compare.py src.txt dst.txt
# Why: on 2026-11-03 the first MSI pass missed bun/pnpm globals, a Nerd Font, Playwright browsers,
# Chrome web-app launchers, uv Pythons and an app installed that afternoon; only a section-by-section
# diff found them.
main() {
set -u
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/share/pnpm:$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
sec() { printf '##%s\n' "$1"; }
json_keys() { python3 -I -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: raise SystemExit
if isinstance(d,list): d=d[0] if d else {}
print("\n".join((d or {}).get("dependencies",{})))'; }

sec pkg-explicit-native; pacman -Qqen 2>/dev/null
sec pkg-explicit-foreign; pacman -Qqem 2>/dev/null
sec pkg-all; pacman -Qq 2>/dev/null
sec npm; npm ls -g --depth=0 --json 2>/dev/null | json_keys | grep -v -x npm
sec pnpm; pnpm ls -g --depth=0 --json 2>/dev/null | json_keys
sec bun; [ -f "$HOME/.bun/install/global/package.json" ] && json_keys < "$HOME/.bun/install/global/package.json"
sec pipx; pipx list --short 2>/dev/null | awk '{print $1}'
sec uv-tools; uv tool list 2>/dev/null | grep -v '^-' | awk '{print $1}'
sec uv-pythons; uv python list --only-installed --managed-python 2>/dev/null | awk '{print $1}' | sed -E 's/^(cpython-[0-9]+\.[0-9]+).*/\1/' | sort -u
sec cargo-installed; cargo install --list 2>/dev/null | awk '/^[^ ]/{print $1}'
USERDIRS=("$HOME/.local/bin" "$HOME/.cargo/bin" "$HOME/.bun/bin" "$HOME/.deno/bin" "$PNPM_HOME" /usr/local/bin)
sec user-binaries   # compiled tools installed outside pacman (compared by name against the target's PATH)
for d in "${USERDIRS[@]}"; do
  for f in "$d"/*; do
    [ -x "$f" ] && [ ! -d "$f" ] || continue
    head -c4 "$(readlink -f "$f")" 2>/dev/null | grep -q $'\x7fELF' && basename "$f"
  done
done 2>/dev/null | sort -u
sec user-scripts    # scripts and wrappers: mostly the personal environment (nadavai bin, pip --user entry points)
for d in "${USERDIRS[@]}"; do
  for f in "$d"/*; do
    [ -x "$f" ] && [ ! -d "$f" ] || continue
    head -c4 "$(readlink -f "$f")" 2>/dev/null | grep -q $'\x7fELF' || basename "$f"
  done
done 2>/dev/null | sort -u
sec pip-user        # pip install --user packages, per Python minor
for py in /usr/bin/python3.[0-9]*; do
  case "$py" in *-config) continue;; esac
  [ -x "$py" ] || continue
  "$py" -m pip list --user --format=freeze 2>/dev/null | cut -d= -f1 | sed "s#^#$(basename "$py") #"
done
sec path-commands; compgen -c 2>/dev/null | sort -u
sec opt; ls /opt 2>/dev/null
sec fonts; fc-list : family 2>/dev/null | tr ',' '\n' | sed 's/^ *//' | sort -u
sec desktop-entries; ls /usr/share/applications "$HOME/.local/share/applications" 2>/dev/null | grep '\.desktop$' | sort -u
sec system-units-enabled; systemctl list-unit-files --state=enabled --no-legend 2>/dev/null | awk '{print $1}'
sec user-units-enabled; systemctl --user list-unit-files --state=enabled --no-legend 2>/dev/null | awk '{print $1}'
sec flatpak; flatpak list --app --columns=application 2>/dev/null
sec playwright-browsers; ls "$HOME/.cache/ms-playwright" 2>/dev/null | sed -E 's/-[0-9]+$//' | sort -u
sec chrome-profiles; ls "$HOME/.config/google-chrome" 2>/dev/null | grep -E '^(Default|Profile [0-9]+)$'
sec docker-images; docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null
sec toolchain-dirs; for d in "$HOME/Android/Sdk" "$HOME/java" "$HOME/.local/google-cloud-sdk" "$HOME/.local/share/supabase" "$HOME/.grok/downloads" "$HOME/flutter" "$HOME/.flutter-sdk"; do [ -e "$d" ] && printf '%s\n' "${d#"$HOME"/}"; done
sec groups; id -nG "$(id -un)" | tr ' ' '\n' | grep -v -x "$(id -gn)"   # from the group db, not this (possibly multiplexed) session
}

# The body is a function so bash reads all of it first: under `ssh host bash -s < script` a child
# that reads stdin would otherwise eat the rest of the script.
main "$@" < /dev/null
