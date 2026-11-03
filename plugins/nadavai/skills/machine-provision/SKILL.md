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
2. **Nadav decides the scope.** Ask once (AskUserQuestion): tools only, or also the agent
   environment (nadavai, rules, user services, Orca RTL); which Chrome data; whether logins move.
   Files and projects never move unless he names them. CI (`nadavai-slot`) is never touched
   without him.
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

### 1. Inventory both sides
`scripts/inventory.sh > src.txt`, `ssh <host> bash -s < scripts/inventory.sh > dst.txt`,
`python3 -I scripts/compare.py src.txt dst.txt --ignore ignore.txt` (start the ignore file from
`references/ignore.example`, one reason per line; its `user-scripts *` and `user-units-enabled *`
lines fit a tools-only scope: drop them when Nadav wants the environment too). Run it again at the end and after every pass:
another session may install something on the source meanwhile (OpenWhispr and espeak-ng arrived
mid-run on 2026-11-03). Sections to read with care: `user-binaries` (compiled tools, which the
target may get from a pacman package instead), `user-scripts` (mostly the personal environment),
`pip-user` (`pip install --user` packages per Python; the LENOVO's python3.12 set serves the
copied Ubuntu scripts, so ask before reproducing it), and `groups` (read from the group db; a
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
logins Nadav approved, each checked with the tool's own status command.

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
