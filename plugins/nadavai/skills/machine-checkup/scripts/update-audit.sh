#!/usr/bin/env bash
# Read-only report: is every update source current and does every device have its driver?
# One block per source. Each line is one of:
#   ok        checked and current
#   PENDING   fixable on the live machine (an install or update command)
#   REBOOT    applied, but only a reboot or app restart finishes it (never done on a machine
#             with running sessions: report it to Nadav)
#   UNKNOWN   the check itself failed (offline, tool error): nothing was proven
#   info      not checkable from here (said so, never counted as ok)
# Exit: 0 everything current, 1 PENDING, 2 UNKNOWN (and nothing pending), 3 only REBOOT items.
# A run without the final "RESULT:" line did not finish: treat it as a failure.
# usage: update-audit.sh      or over ssh:  ssh host bash -s < update-audit.sh
# Why: on 2026-11-03 "all updated" was claimed three times; each recheck found more (pnpm 10 with
# stale globals, Orca one release behind, Node 24.14 below what new packages required, old Ubuntu
# binaries shadowing current ones, BIOS never compared to the vendor).

main() {
set -u
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/share/pnpm:$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
F=$(mktemp -d); trap 'rm -rf "$F"' EXIT   # flag files: list_or_ok runs inside pipelines (subshells)
say()     { printf '%s\n' "$*"; }
block()   { printf '\n== %s\n' "$1"; }
pending() { echo "$*" >> "$F/pending"; printf '  PENDING %s\n' "$*"; }
reboot()  { echo "$*" >> "$F/reboot";  printf '  REBOOT  %s\n' "$*"; }
unknown() { echo "$*" >> "$F/unknown"; printf '  UNKNOWN %s\n' "$*"; }
info()    { printf '  info    %s\n' "$*"; }
have()    { command -v "$1" >/dev/null 2>&1; }
# list_or_ok LABEL RC: items on stdin; RC is the producing command's exit status (0 = it ran)
list_or_ok() {
  local items; items=$(grep -v '^[[:space:]]*$' || true)
  if [ "${2:-0}" != 0 ]; then unknown "$1: the check failed (exit $2)"; fi
  if [ -n "$items" ]; then pending "$1: $(printf '%s' "$items" | tr '\n' ' ')"
  elif [ "${2:-0}" = 0 ]; then say "  ok"; fi
}

block "kernel (running vs installed)"
if [ ! -d "/usr/lib/modules/$(uname -r)" ]; then reboot "kernel $(uname -r) is running but its modules are gone (upgraded): reboot"
else say "  running $(uname -r): ok"; fi

block "pacman (repos)"
if have checkupdates; then
  out=$(checkupdates 2>/dev/null); rc=$?; [ $rc = 2 ] && rc=0      # 2 = no updates
  printf '%s\n' "$out" | awk 'NF{print $1}' | list_or_ok "repo packages" $rc
else unknown "checkupdates missing (pacman -S pacman-contrib)"; fi

block "AUR (including -git packages)"
if have paru; then out=$(paru -Qua --devel 2>/dev/null); rc=$?; [ $rc = 1 ] && [ -z "$out" ] && rc=0
  printf '%s\n' "$out" | awk 'NF{print $1}' | list_or_ok "AUR packages" $rc
elif have yay; then out=$(yay -Qua --devel 2>/dev/null); printf '%s\n' "$out" | awk 'NF{print $1}' | list_or_ok "AUR packages" 0
else info "no AUR helper"; fi

block "local PKGBUILD repacks (~/.local/share/pkgbuilds/*)"
found=0
for d in "$HOME"/.local/share/pkgbuilds/*/; do
  [ -f "$d/PKGBUILD" ] || continue; found=1
  name=$(basename "$d"); have_v=$(pacman -Q "$name" 2>/dev/null | awk '{print $2}' | sed 's/-[0-9]*$//')
  if [ ! -x "$d/latest" ]; then unknown "$name: no 'latest' script, upstream not checked"; continue; fi
  want=$("$d/latest" 2>/dev/null | head -1)
  if [ -z "$want" ]; then unknown "$name: 'latest' printed nothing (network or gh auth?)"
  elif [ "$want" != "$have_v" ]; then pending "$name installed ${have_v:-none}, upstream $want (bump pkgver + sha256 from 'latest', makepkg -si; restart the app after)"
  else say "  $name $have_v ok"; fi
done
[ $found = 0 ] && say "  none"

block "Node (fnm default vs newest of the same major)"
if have fnm && have node; then
  cur=$(node -v 2>/dev/null); major=${cur%%.*}
  newest=$(fnm list-remote 2>/dev/null | grep -o "^$major\.[0-9]*\.[0-9]*" | tail -1)
  if [ -z "$newest" ]; then unknown "fnm list-remote gave nothing (offline?)"
  elif [ "$newest" != "$cur" ]; then pending "node $cur, newest $newest (fnm install, reinstall globals with --allow-scripts, fnm default)"
  else say "  node $cur ok"; fi
else info "no fnm/node"; fi

block "npm globals"
if have npm; then out=$(npm outdated -g 2>/dev/null); rc=$?; [ $rc = 1 ] && rc=0   # 1 = something outdated
  printf '%s\n' "$out" | tail -n +2 | awk 'NF{print $1" "$2"->"$4}' | list_or_ok "npm -g" $rc
else info "no npm"; fi

block "pnpm (self and globals)"
if have pnpm; then
  out=$(pnpm outdated -g 2>/dev/null); rc=$?; [ $rc = 1 ] && rc=0
  printf '%s\n' "$out" | grep -E '^│ [@a-z]' | awk '{print $2}' | list_or_ok "pnpm -g" $rc
  n=$(pnpm ls -g --depth=0 2>/dev/null | grep -c '──'); bins=$(find "$PNPM_HOME" -maxdepth 1 -type f 2>/dev/null | wc -l)
  [ "$n" = 0 ] && [ "$bins" -gt 3 ] && pending "pnpm lists no globals but $PNPM_HOME has $bins files: globals from an older pnpm layout, reinstall them with this pnpm"
else info "no pnpm"; fi

block "bun globals"
if have bun && [ -f "$HOME/.bun/install/global/package.json" ]; then
  out=$(cd "$HOME/.bun/install/global" && bun outdated 2>/dev/null); rc=$?
  printf '%s\n' "$out" | grep -E '^\|' | grep -v -E 'Package|^\|-' | awk -F'|' '{gsub(/ /,"",$2); print $2}' | list_or_ok "bun -g" $rc
else info "no bun globals"; fi

block "pipx (installed vs PyPI)"
if have pipx; then
  sp="$HOME/.local/share/pipx/shared/bin/python"
  [ -x "$sp" ] && ! "$sp" -c 'import pip' 2>/dev/null && pending "pipx shared pip is broken (copied home?): pipx reinstall-all"
  pipx list --json 2>/dev/null | python3 -I -c '
import json, sys, urllib.request
try: venvs = json.load(sys.stdin)["venvs"]
except Exception: sys.exit(2)
bad = 0
for name, v in venvs.items():
    mp = v["metadata"]["main_package"]; pkg, have = mp["package"], mp["package_version"]
    try:
        with urllib.request.urlopen(f"https://pypi.org/pypi/{pkg}/json", timeout=20) as r: want = json.load(r)["info"]["version"]
    except Exception: bad = 2; continue
    if want != have: print(f"{pkg} {have}->{want}")
sys.exit(bad)' > "$F/pipx"; rc=$?
  list_or_ok "pipx (pipx upgrade-all)" $rc < "$F/pipx"
else info "no pipx"; fi

block "uv tools and managed Pythons"
if have uv; then
  out=$(uv tool list --outdated 2>/dev/null); rc=$?
  printf '%s\n' "$out" | grep -E '\[latest' | awk '{print $1}' | list_or_ok "uv tools (uv tool upgrade --all)" $rc
  uv python list --output-format json 2>/dev/null | python3 -I -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(2)
cp = [x for x in d if x.get("implementation") == "cpython" and x.get("variant") in (None, "", "default")]
inst, avail = {}, {}
for x in cp:
    p = x["version_parts"]; minor = (p["major"], p["minor"]); ver = (p["major"], p["minor"], p["patch"])
    if x.get("path") and "/uv/python/" in (x.get("path") or ""): inst[minor] = max(inst.get(minor, ver), ver)
    elif x.get("url"): avail[minor] = max(avail.get(minor, ver), ver)
for m, v in sorted(inst.items()):
    if avail.get(m, v) > v: print("python %d.%d.%d->%d.%d.%d" % (v + avail[m]))' > "$F/uvpy"; rc=$?
  list_or_ok "uv Pythons (uv python upgrade)" $rc < "$F/uvpy"
else info "no uv"; fi

block "Rust and cargo-installed binaries"
if have rustup; then out=$(rustup check 2>/dev/null); rc=$?; printf '%s\n' "$out" | grep -v 'up to date' | list_or_ok "rustup" $rc
elif have rustc; then say "  rustc $(rustc --version | awk '{print $2}') from pacman (covered by the repo check)"; fi
if have cargo; then
  cargo install --list 2>/dev/null | awk '/^[^ ].* v[0-9]/{sub(/:$/,"",$2); print $1, substr($2,2)}' | while read -r c v; do
    want=$(curl -s -m 20 -A 'nadavai-update-audit' "https://crates.io/api/v1/crates/$c" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["crate"]["max_stable_version"])' 2>/dev/null)
    if [ -z "$want" ]; then echo "UNKNOWN $c"; elif [ "$want" != "$v" ]; then echo "$c $v->$want"; fi
  done > "$F/cargo"
  grep '^UNKNOWN' "$F/cargo" | while read -r _ c; do unknown "crates.io gave no version for $c"; done
  grep -v '^UNKNOWN' "$F/cargo" | list_or_ok "cargo install (a crate that fails to build upstream stays here: say so)"
fi

block "flatpak, Android SDK"
if have flatpak; then out=$(flatpak remote-ls --updates --columns=application 2>/dev/null); printf '%s\n' "$out" | list_or_ok "flatpak" $?
else info "no flatpak"; fi
if have sdkmanager; then
  out=$(timeout 120 sdkmanager --list 2>/dev/null); rc=$?
  printf '%s\n' "$out" | sed -n '/Available Updates:/,$p' | awk 'NR>3 && NF && $1!~/^-/{print $1}' | list_or_ok "Android SDK (sdkmanager --update)" $rc
else info "no sdkmanager"; fi

block "self-updating CLIs (no read-only check; run their update command)"
for c in grok agy; do have "$c" && info "$c $("$c" --version 2>/dev/null | head -1 | cut -c1-40): '$c update'"; done
if have deno && ! pacman -Qo "$(command -v deno)" >/dev/null 2>&1; then
  out=$(deno upgrade --dry-run 2>&1); printf '%s\n' "$out" | grep -q -i 'already the latest\|is the latest' && say "  deno ok" || info "deno: $(printf '%s' "$out" | tail -1 | cut -c1-80)"
fi
if have bun && ! pacman -Qo "$(command -v bun)" >/dev/null 2>&1; then
  want=$(curl -s -m 20 https://api.github.com/repos/oven-sh/bun/releases/latest | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].removeprefix("bun-v"))' 2>/dev/null)
  if [ -z "$want" ]; then unknown "bun latest release not readable"; elif [ "$want" != "$(bun --version)" ]; then pending "bun $(bun --version)->$want (bun upgrade)"; else say "  bun ok"; fi
fi
if have uv && ! pacman -Qo "$(command -v uv)" >/dev/null 2>&1; then
  want=$(curl -s -m 20 https://api.github.com/repos/astral-sh/uv/releases/latest | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])' 2>/dev/null)
  cur=$(uv --version | awk '{print $2}')
  if [ -z "$want" ]; then unknown "uv latest release not readable"; elif [ "$want" != "$cur" ]; then pending "uv $cur->$want (uv self update)"; else say "  uv ok"; fi
fi

block "firmware (fwupd; applying it needs Nadav's yes)"
if have fwupdmgr; then
  fwupdmgr get-updates --no-unreported-check --json 2>/dev/null | python3 -I -c '
import json, sys
raw = sys.stdin.read()
if not raw.strip(): sys.exit(0)          # fwupd prints nothing when there are no updates
try: d = json.loads(raw)
except Exception: sys.exit(2)
for x in d.get("Devices", []):
    for r in x.get("Releases", [])[:1]: print(x.get("Name"), str(x.get("Version")) + "->" + str(r.get("Version")))' > "$F/fw"; rc=$?
  list_or_ok "fwupd" $rc < "$F/fw"
  fwupdmgr get-history 2>/dev/null | grep -q -i 'needs reboot' && reboot "a firmware update was applied and waits for a reboot"
else info "no fwupdmgr"; fi

block "CPU microcode (running vs newest in the package)"
python3 -I - <<'PY'
import re, struct, os, sys
cpu = open("/proc/cpuinfo").read()
vend = re.search(r"vendor_id\s*:\s*(\S+)", cpu)
run = re.search(r"microcode\s*:\s*(\S+)", cpu)
if not vend or not run:
    print("  info    no microcode line in /proc/cpuinfo (VM?)"); sys.exit(0)
vend, run = vend.group(1), int(run.group(1), 16)
if vend != "GenuineIntel":
    print(f"  {vend} running {hex(run)}: amd-ucode is covered by the repo check"); sys.exit(0)
fam, mod, st = (int(re.search(rf"{k}\s*:\s*(\d+)", cpu).group(1)) for k in ("cpu family", "model", "stepping"))
f = f"/usr/lib/firmware/intel-ucode/{fam:02x}-{mod:02x}-{st:02x}"
if not os.path.exists(f):
    print(f"  running {hex(run)}; intel-ucode has no file for this CPU (BIOS microcode only)"); sys.exit(0)
pkg = struct.unpack("<I", open(f, "rb").read()[4:8])[0]
print(f"  running {hex(run)}, package {hex(pkg)}")
sys.exit(3 if run < pkg else 0)
PY
[ $? = 3 ] && reboot "microcode newer in the package: reboot (check 'microcode' in mkinitcpio HOOKS)"

block "BIOS / EC against the vendor (flashing needs Nadav's yes and AC power)"
vendor=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null); product=$(cat /sys/class/dmi/id/product_name 2>/dev/null)
bios=$(cat /sys/class/dmi/id/bios_version 2>/dev/null); bdate=$(cat /sys/class/dmi/id/bios_date 2>/dev/null)
say "  $vendor $product: BIOS $bios ($bdate)"
case "$vendor" in
  LENOVO)
    cat=$(curl -s -m 30 "https://download.lenovo.com/catalog/${product}_Win11.xml" 2>/dev/null)
    latest=$(printf '%s' "$cat" | grep -o -i -E "${bios:0:4}[0-9]{2}WW" | tr '[:lower:]' '[:upper:]' | sort -u | tail -1)
    if [ -z "$latest" ]; then unknown "Lenovo catalog gave no BIOS for $product (offline, or a model without a catalog)"
    elif [ "$latest" != "$(printf '%s' "$bios" | tr '[:lower:]' '[:upper:]')" ]; then pending "BIOS $bios, Lenovo catalog has $latest"
    else say "  ok: $latest is the newest in the Lenovo catalog"; fi ;;
  "Micro-Star International Co., Ltd.")
    base=${bios%.*}
    url() { printf 'https://download.msi.com/bos_exe/nb/%s.%s.zip' "$base" "$1"; }
    code() { curl -s -o /dev/null -I -L -m 20 -w '%{http_code}' "$(url "$1")"; }
    if [ "$(code "${bios##*.}")" != 200 ]; then
      unknown "MSI download server does not answer for the installed $bios (offline, or a new URL scheme): check the support page"
    else
      next=""
      for n in $(python3 -I - "${bios##*.}" <<'PY'
import sys
try: i = int(sys.argv[1], 16)
except ValueError: sys.exit()
print(" ".join(format(i + k, "X") for k in range(1, 17)))
PY
); do [ "$(code "$n")" = 200 ] && next="$base.$n"; done
      if [ -n "$next" ]; then pending "BIOS $bios, MSI download server has $next"; else say "  ok: no newer $base.* (checked 16 versions ahead)"; fi
    fi ;;
  *) unknown "no vendor check for '$vendor': look up the support page by hand" ;;
esac

block "devices whose driver exists but is not bound (USB and PCI)"
# A device with no matching module at all has no Linux driver (host bridges, eSPI, Intel
# 8086:7f2f, GNA): nothing to install. Only a module that matches and is not bound is a gap.
for d in /sys/bus/pci/devices/* /sys/bus/usb/devices/*:*; do
  [ -e "$d/driver" ] && continue; [ -r "$d/modalias" ] || continue
  mods=$(modprobe -R "$(cat "$d/modalias")" 2>/dev/null | tr '\n' ' ')
  [ -n "$mods" ] && printf '%s wants %s\n' "${d##*/}" "$mods"
done | list_or_ok "unbound devices (modprobe the module, or install its DKMS package)"

block "firmware load failures and DKMS"
out=$(journalctl -k -b --no-pager -q 2>/dev/null); rc=$?
printf '%s\n' "$out" | grep -i -E 'direct firmware load .* failed|firmware: failed to load' | sed 's/^.*kernel: //' | sort -u | list_or_ok "firmware" $rc
if have dkms; then dkms status 2>/dev/null | grep -v -E ': installed' | list_or_ok "dkms modules not installed for every kernel"; fi

block "GPU drivers"
if have nvidia-smi; then
  run=$(cat /sys/module/nvidia/version 2>/dev/null); pkg=$(pacman -Q nvidia-utils 2>/dev/null | awk '{print $2}' | sed 's/-[0-9]*$//')
  if [ -z "$run" ]; then unknown "nvidia module not loaded"
  elif [ "$run" != "$pkg" ]; then reboot "nvidia module $run loaded, nvidia-utils $pkg installed"
  else say "  nvidia $run ok"; fi
fi
have vulkaninfo && vulkaninfo --summary 2>/dev/null | grep -E 'deviceName' | sed 's/^[[:space:]]*/  vulkan: /'

block "broken installs (missing libraries, dangling links, shadowed binaries)"
{
  for f in "$HOME"/.local/bin/* /usr/local/bin/* /opt/*/*; do
    [ -f "$f" ] && head -c4 "$f" 2>/dev/null | grep -q $'\x7fELF' || continue
    case "$f" in *libqt5_shim.so) continue;; esac   # Electron loads the Qt6 shim when Qt5 is absent
    m=$(ldd "$f" 2>/dev/null | grep 'not found' | awk '{print $1}' | sort -u | tr '\n' ' ')
    [ -n "$m" ] && printf 'missing libs %s: %s\n' "$f" "$m"
  done
  find "$HOME/.local/bin" /usr/local/bin -maxdepth 1 -xtype l -printf 'dangling %p\n' 2>/dev/null
  # An old copied binary earlier on PATH than the pacman one (eza 0.23.4 over 0.23.5, kitty 0.45
  # over 0.49). Wrapper scripts and the Android SDK's adb are deliberate, so only ELF copies count.
  for f in "$HOME"/.local/bin/*; do
    n=$(basename "$f"); [ -e "/usr/bin/$n" ] || continue
    t=$(readlink -f "$f"); [ "$t" = "$(readlink -f "/usr/bin/$n")" ] && continue
    case "$t" in /usr/*|"$HOME"/Android/*) continue;; esac
    head -c4 "$t" 2>/dev/null | grep -q $'\x7fELF' || continue
    printf 'shadow ~/.local/bin/%s (%s) hides /usr/bin/%s\n' "$n" "$t" "$n"
  done
} | list_or_ok "items"

block "failed units"
{ systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1}'; systemctl --user --failed --no-legend --plain 2>/dev/null | awk '{print "user:"$1}'; } | list_or_ok "units"

echo
if   [ -s "$F/pending" ]; then echo "RESULT: PENDING items above (fix them, then run again)"; return 1
elif [ -s "$F/unknown" ]; then echo "RESULT: NOT VERIFIED: some checks failed, nothing is proven for them"; return 2
elif [ -s "$F/reboot" ];  then echo "RESULT: current, but a reboot/restart is needed to finish (ask Nadav; never on a machine with running sessions)"; return 3
fi
echo "RESULT: everything current"
}

# The whole body is a function so bash reads all of it before running anything: under
# `ssh host bash -s < update-audit.sh` a child that reads stdin would otherwise eat the rest
# of the script (gemini --version did, in review).
main "$@" < /dev/null
