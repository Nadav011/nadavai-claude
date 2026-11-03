---
name: machine-provision
description: "Make a fresh or reinstalled Linux machine of Nadav's match an existing one: every package, app, driver, toolchain, global tool, font, Chrome profile and (by choice) login, then prove it with a section-by-section diff. Also the cleanup after copying a home from another machine or distro (broken launchers, missing libraries, stale binaries, masked units). Use when Nadav formats or buys a machine, says \"תעשה לו את אותו דבר\", \"תתקין שם את כל מה שיש פה\", \"תעביר את כל ההתחברויות\", \"מה יש פה שאין שם\", or after a migration (\"בגלל המעבר\")."
---
# machine-provision

Source = the machine that has everything (today the LENOVO), target = the one being set up.
Read memory `msi-reinstall-2026-11.md` and `lenovo-migration-leftovers-2026-11.md` first: they
hold the last run's decisions and what was intentionally left out.

## Hard rules

1. **The diff decides, not memory.** "Nothing is missing" is said only after `scripts/compare.py`
   prints `ok` for every section (or each remaining line is an intended difference in the ignore
   file), and `machine-checkup/scripts/update-audit.sh` ends with `RESULT: everything current` on
   the target. On the source, fix only PENDING lines that need no restart; its REBOOT lines (and
   any update of an app that is running there) go to Nadav, because rule 3 forbids acting on them.
   A run without a `RESULT:` line did not finish. Why: on 2026-11-03 "done" was claimed four
   times; each new diff found more.
2. **Nadav decides the scope.** Ask once (AskUserQuestion, multiSelect), by category, after the
   first diff so the question names real items: command-line tools (Node, pnpm, bun, uv, pipx,
   Docker, gh); agents and nadavai (Claude Code, Codex, Gemini, omc, rules, the Bright Data token);
   desktop apps (Orca, Claude Desktop, Codex Desktop, Grok Bot, OpenWhispr, terminals, LibreOffice);
   heavy kits (Android SDK, JDK, Playwright browsers, gcloud, Maestro). Then which Chrome data, and
   which logins. A box he rarely sits at (omarchy, a CI host) gets no desktop apps by default.
   Files, projects and agent sessions never move unless he names them. CI (`nadavai-slot`, `~/ci`,
   runners, dagu) is never touched without him: another session owns it.
3. **Never interrupt the source.** No reboot, no restart of Orca, Chrome or Docker there. Ask him
   to close Chrome for the profile copy. Reboot the target only when he says so.
4. **Logins follow `references/logins.md`**: static and Google tokens may be copied, rotating
   refresh tokens get a fresh login on the target, WhatsApp never. Secrets are never printed.
5. **Hardware-specific items stay hardware-specific**: host tuning (`legion-power-limits`,
   undervolt), NPU drivers on CPUs without an NPU, vendor EC drivers. Each goes into the ignore file
   with a reason, and the target gets its own vendor drivers (step 6).

## Steps

### 0. Reach the target
Tailscale name and IP (`tailscale status`), `ssh <host>` with a key, passwordless sudo
(`sudo -n true`). If the login shell is fish, send every command as `ssh <host> bash -s <<'EOF'`
(fish rejects `${...}` and `$?`). The exception is a command that pipes a secret: it uses
`... | ssh <host> "bash -c '...'"` (see `references/logins.md`), and the secret is never written
into a heredoc. Record the username: paths that embed `/home/<user>` must be rewritten on the target.
Inside the heredoc, wrap the body in `main() { ...; }; main </dev/null`. Never write
`bash -s <<'EOF' </dev/null` (the second redirect replaces the heredoc, so nothing runs) or
`exec </dev/null` at the top (it closes the script bash is still reading). Both returned empty
output, with no error, on 2026-11-03.

Where tools go: on the SSD. A second HDD (omarchy's 2 TB) holds archives and data only. No kernel
or scheduler makes a spinning disk as fast as NVMe for node_modules, SDKs and Docker layers, and
Nadav's condition for using it was "the same speed", so the answer is no unless the SSD is full.

### 1. Inventory both sides
`scripts/inventory.sh > src.txt`, `ssh <host> bash -s < scripts/inventory.sh > dst.txt`,
`python3 -I scripts/compare.py src.txt dst.txt --ignore ignore.txt` (start the ignore file from
`references/ignore.example`, or `references/ignore.omarchy` for a box without desktop apps; one
reason per line, after a `#`, or the line silently matches nothing; its `user-scripts *` and
`user-units-enabled *` lines fit a tools-only scope: drop them when Nadav wants the environment too). Run it again at the end and after every pass:
another session may install something on the source meanwhile (OpenWhispr and espeak-ng arrived
mid-run on 2026-11-03). Sections to read with care: `user-binaries` (compiled tools, which the
target may get from a pacman package instead), `user-scripts` (mostly the personal environment),
`pip-user` (`pip install --user` packages per Python: never reproduce them on a target. The
LENOVO's 436-package python3.12 set was unused and went to `~/Archive/python312-user-2026-11-03/`
on 2026-11-03; a tool that came from it is installed from the repos instead, as pyright and
git-filter-repo were, and a project installs its own libraries with uv), and `groups` (read from the group db; a
multiplexed ssh session shows stale groups).

### 2. System packages
On the target: `pacman -Syu --needed` with the source's explicit native list
(`pacman -Qqen`), minus hardware-specific items. Conflicts to expect: `rustup` vs `rust` (keep
one; pacman `rust` is fine), `socket` vs `@socketsecurity/cli` under pnpm 12 (install separately).

### 3. Apps outside the repos
- AUR packages: start from `pacman -Qqem` on the source, drop the local repacks (anything with a
  `pkgbuilds/` dir here, plus `codex-desktop`) and names `paru -Si` cannot find, or the whole batch
  aborts. Read the PKGBUILD of any package new to Nadav's machines before building it (paru runs it
  with passwordless sudo); known ones may use `paru -S --needed --noconfirm --skipreview <list>`.
  Packages built on the source can be copied and installed with `pacman -U` (same arch), but paru
  clears its clone dirs, so they are often gone.
- Repacked .debs (Orca, Grok Bot): `pkgbuilds/<app>/PKGBUILD` in this skill, same `/opt` layout as
  the official .deb. Copy the dir to `~/.local/share/pkgbuilds/<app>/` on the target and run
  `makepkg -si`. Each has a `latest` script (version, then sha256) that `update-audit.sh` reads.
  The package owns `/opt/<app>` and its links: move an earlier unpackaged copy aside first
  (`mv /opt/Orca /opt/Orca.pre-pkg`, delete it after the app was restarted), never
  `--overwrite '*'`. Updating an app that is running finishes only on its next restart.
  After an Orca install, run `orca-rtl-apply` only if the target has nadavai.
- Codex Desktop: `github.com/ilysenko/codex-desktop-linux`, `make bootstrap-native` (pacman
  package plus `codex-update-manager`), or copy the built package from the source.
- Claude Desktop: the `claude-desktop` package in the cachyos repo (signed), not a copied
  `/usr/lib/claude-desktop`.
- Copied app trees in `/opt` without a package are a defect (no launcher link, no icons, no
  updates): replace them with a package. `scripts/leftovers.sh` lists unowned files.

### 4. User toolchains and global tools
- Node: pacman `fnm`, `fnm install <same version>`, `fnm default`, and point scripts at
  `~/.local/share/fnm/aliases/default`, never a versioned path. Install the source's npm globals
  with `npm i -g --allow-scripts=<names>`: npm 11 skips install scripts otherwise (node-pty,
  esbuild, puppeteer, claude-code).
- pnpm 12: `pnpm config set global-bin-dir "$PNPM_HOME"`, then `pnpm add -g` the source's list.
  A home copied with an older pnpm keeps working binaries that `pnpm ls -g` no longer sees:
  reinstall them.
- bun (`bun add -g`), pipx (`pipx install` each; a copied home needs `pipx reinstall-all`), uv
  (`uv tool install` each, `uv python install` the same minors), cargo binaries (build them, or
  copy the binary when upstream fails to build, as parry-guard did).
- Standalone binaries in `~/.local/bin`: install the pacman package when one exists
  (`pacman -F usr/bin/<name>` after `pacman -Fy`), otherwise copy the binary (grok, agy, csq,
  wacli, ngrok, supabase). Copy toolchain dirs (Android SDK, JDKs, gcloud SDK) and add their
  paths for the target's shell (fish: `~/.config/fish/conf.d/`).
- Playwright browsers: `npx -y playwright@<version> install chromium chromium-headless-shell webkit ffmpeg`.
- Fonts in `~/.local/share/fonts`: copy, then `fc-cache -f`.

### 5. Services and system config
Compare enabled system units. Typical set: docker (copy `/etc/docker/daemon.json`, add the user to
`docker`, `nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml`), logid with `/etc/logid.cfg`,
cronie, earlyoom, rasdaemon (`/etc/sysconfig/rasdaemon`), the SSH hardening drop-in
(`sshd -t` before the reload, then prove key login with `-o ControlPath=none` and that password
login is refused). User services belong to the environment: only with Nadav's yes.

### 5b. Host tuning after a reformat
A reinstall keeps the BIOS and loses the OS layer. Prove the BIOS part first: `dmidecode -t memory`
(configured speed), `/dev/kvm`, `hwp` in cpuinfo with `intel_pstate` active, and the RAPL limit
(4095 W in `constraint_0_power_limit_uw` = BIOS limits off). Then bring back the OS part from the
pre-format keep set (its `/etc` tarballs: tmpfiles.d, sysctl.d, modprobe.d, udev rules, systemd
drop-ins, fstab), and diff each value against what the new distro already ships: CachyOS's
`cachyos-settings` already sets swappiness 150, page-cluster 0, vfs_cache_pressure 50, dirty bytes,
inotify watches and zswap off, so only the rest is restored. A second drive needs its fstab line
back (`findmnt --verify`, `daemon-reload`). `power-profiles-daemon` is not enabled at boot on
CachyOS KDE, and `powerprofilesctl set` over ssh needs `sudo` (polkit refuses a remote session):
enable it, then set the profile, then read the EPP back. Drop items for hardware the box no longer
has (omarchy's RTL8192EU Wi-Fi). Prove it under load: 5 min of
`stress-ng --cpu <cores> --vm 2 --vm-bytes 6G`, sampling the package temperature and clock every
10 s, then `package_throttle_count` before/after and the kernel log for MCE. Power from
`energy_uj` needs root. The host's limits and numbers live in machine-checkup's host notes.

### 6. Drivers and firmware
Run `machine-checkup/scripts/update-audit.sh` on the target and fix each PENDING line. Then the
vendor drivers for the target's own hardware (`lsusb`, `lspci -k`, DMI vendor):
`msi-ec-dkms-git` for MSI laptops (the in-tree `msi_ec` refuses newer EC firmware; the DKMS one
in `updates/` loads it), `openrazer-driver-dkms` + `openrazer-daemon` for Razer devices (user in
group `openrazer`), `logiops` for Logitech MX, `intel-npu-driver` only where `/dev/accel*`
exists, `intel-compute-runtime` + `level-zero-loader` for Intel GPU compute. Firmware, BIOS and
EC flashes need Nadav's explicit yes and AC power: `fwupdmgr update --no-reboot-check`, never
`-y` (it may reboot), and with Secure Boot on, check first that the bootloader is not revoked by
a dbx update.

### 7. Chrome and logins
Follow `references/logins.md`: close Chrome on the source, copy the profiles, rewrite the home
path, move the Safe Storage key, prove decryption with `scripts/chrome-verify.py`, then the tool
logins Nadav approved, each checked with the tool's own status command. On a KDE target never
install `gnome-keyring`: ksecretd already owns the Secret Service, and a second provider can take
the name at the next login and hide the Chrome key.

### 7b. Agents and nadavai (only when Nadav chose them)
Clone `Nadav011/nadavai-claude` to `~/nadavai` (gh over HTTPS; the SSH key is not on GitHub) and run
`./setup.sh` with the fnm path first on PATH. It installs no services and no CI pieces. Then fix
what its "System tools" block reports MISSING (git-lfs, sox, Maestro: copy `~/.maestro` and the
versioned `~/.maestro-<ver>` it links to) and move the `BRIGHTDATA_API_TOKEN` env value into the
target's `~/.claude/settings.json` on a pipe. The secrets vault is not copied unless Nadav asks.
Claude Code and Codex get a fresh login on the target (rotating tokens).
`setup.sh` does not write `~/.codex/config.toml`. Copy the source's Codex config without its
sessions, history, sqlite, logs, `auth.json`, `.env` and `secrets/`: `config.toml` (rewrite the home
path, drop the `[projects.*]` tables, desktop-only entries such as `node_repl` from
`/opt/codex-desktop` and removed plugins), `hooks.json` (point the omx hook at
`~/.local/share/fnm/aliases/default`, never a versioned Node; the changed hash means Nadav trusts the
hooks once in Codex `/hooks`), `AGENTS.md`, `agents`, `prompts`, `skills`, `local-marketplaces`,
`.omx`, `plugins`. Then `codex plugin marketplace upgrade` (the Git marketplaces live in `~/.codex/.tmp`, which is not copied; without it `update.sh` fails with "marketplace root does not contain a supported manifest") and `./update.sh` again. The same error names a local marketplace that was not copied: on the MSI on 2026-11-03 these were `local-marketplaces/wondelai-skills`, `local-marketplaces/chrome-devtools` and `plugins/cache/claude-cowork`. Copy every root that `codex plugin marketplace list` prints on the source before the first `update.sh`. Check with `tomllib`, `codex mcp list` and `omx doctor` (the same warnings as on
the source are parity). Also `~/.config/claude-omc` (OMC tiers, outside nadavai), `.tmux.conf` and
`.tmux`, `.pnpmrc`, `.bunfig.toml`, `~/.config/act`, and the `pw-clean` timer.
Then diff the top level of `~` and `~/.config` by name between the two machines: inventory.sh does
not see configs, and that diff is what found the missing Codex config on 2026-11-03.

### 7c. Prove the tools run
A list proves nothing works. On the target: `docker run --rm --device nvidia.com/gpu=all ubuntu:24.04
nvidia-smi -L` (the docker group applies only to a new login: use `sudo` for the proof); a Playwright
Chromium launch that renders Hebrew; `google-chrome-stable --headless=new --user-data-dir=<tmp>
--dump-dom`; `gh api user`; and `--version` for the rest. Playwright WebKit cannot run natively on Arch (it
links Ubuntu's libicu 74, flite, libjxl 0.8); it runs in the official image, pulled on the LENOVO
and the MSI (3.6 GB, tag = the global `@playwright/test` version):
`docker run --rm --ipc=host --init -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v<ver>-noble npx playwright test --project=webkit`,
or as a browser server for the host's tests (`npx -y playwright@<ver> run-server --port 3000 --host 0.0.0.0`
in the container with `-p 3000:3000`, then `PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3000/` on the
host). Proven 2026-11-03: WebKit 27.2 rendered Hebrew on both. Bump the tag with every Playwright update.

Android emulator: `sdkmanager --install emulator "system-images;android-36;google_apis;x86_64"`, then
`avdmanager create avd -n pixel-36 -k "system-images;android-36;google_apis;x86_64" -d pixel_8`;
`emulator -accel-check` must say `accel`, and a headless boot (`-no-window -gpu swiftshader_indirect`)
reaches `sys.boot_completed=1` in 20-30 s on the LENOVO and the MSI. On omarchy the CI session owns it.

parry-guard: the default `onnx-fetch` feature downloads ONNX Runtime from a CDN that answers 403.
Build against the system library instead: `pacman -S onnxruntime-cpu`, then
`ORT_LIB_LOCATION=/usr/lib ORT_PREFER_DYNAMIC_LINK=1 cargo install parry-guard --locked --no-default-features --features onnx --force`.
The binary dlopens `libonnxruntime.so`, so every machine that gets a copy needs `onnxruntime-cpu`.

### 8. Prove and report
- `compare.py` again until only ignore-file lines remain, `update-audit.sh` on both machines,
  `leftovers.sh` on the target.
- Record the run in memory (what was done, what was intentionally left out and why).
- Tell Nadav in Hebrew: what was installed, a table of what did NOT move (item, why, what he
  does), and what needs his hands (reboot, logins).

## After copying a home from another machine or distro
Run `scripts/leftovers.sh` on the receiving machine. Each line maps to a fix: install the
library's package (`pacman -F`), recreate a launcher link, install the app as a package, move a
shadowing old binary away, unmask a copied mask, drop a stale known_hosts key. It is read-only.
