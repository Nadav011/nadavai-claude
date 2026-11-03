# Moving tool logins to the second machine

Logins are copied only when Nadav asks for it, over SSH, with mode 600, and secrets are never
printed (compare `sha256sum | cut -c1-12` on both sides instead). A secret travels only on a pipe
into `ssh target "bash -c '...'"`, never inside a heredoc or on a command line (both end up in
the transcript). Measured on 2026-11-03, LENOVO -> MSI.

## Copy: static tokens, or Google OAuth (Google refresh tokens do not rotate)

| Tool | What | How |
|---|---|---|
| GitHub (`gh`, and git over HTTPS) | PAT in the keyring | `gh auth token \| ssh target 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus gh auth login --with-token -h github.com && gh auth setup-git'`, then `gh auth status` must say `(keyring)`: if the keyring was locked, gh fell back to plain text in `~/.config/gh/hosts.yml`; log out there and redo it from the desktop session |
| SSH | `~/.ssh/id_*`, `config`, `known_hosts` | rsync, 600 for private keys; never overwrite the target's `authorized_keys` |
| git identity | `~/.gitconfig` | copy, then `git config --file <copy> --unset core.hookspath` unless the target gets nadavai (the hooks path is nadavai's) |
| Grok | `~/.grok/auth.json` | holds a `key`, not a refresh token |
| Gemini CLI | `~/.gemini/oauth_creds.json`, `google_accounts.json` | Google OAuth |
| gcloud | `~/.config/gcloud/` | Google OAuth; check with `gcloud auth list` |
| Firebase | `~/.config/configstore/firebase-tools.json` | Google OAuth |
| Netlify | `~/.config/netlify/config.json` | static token; check with `netlify status` |
| Chrome | see below | |

## Do not copy: rotating refresh tokens

When one machine refreshes, the other's copy becomes invalid, so one of them gets logged out
(Codex reports "refresh token already used"). Nadav logs in once on the target instead. Ask him
before copying any of these anyway.

- Claude Code: every Orca account in `~/.config/orca/claude-profiles/*/home/.credentials.json`
  (`~/.claude/.credentials.json` holds only MCP OAuth such as PostHog).
- Claude Desktop (its Electron session), Codex (`~/.codex/auth.json`), Vercel
  (`~/.local/share/com.vercel.cli/auth.json`, has `refreshToken`), Wrangler
  (`~/.config/.wrangler/config/default.toml`, has `refresh_token`), Higgsfield
  (`~/.config/higgsfield/credentials.json`).
- To classify a new tool, list key paths only, never values, recursively (Codex keeps
  `refresh_token` under `tokens`):
  `python3 -I -c 'import json,sys,tomllib;f=sys.argv[1];d=tomllib.load(open(f,"rb")) if f.endswith(".toml") else json.load(open(f));w=lambda o,p="":[k for kk,v in o.items() for k in [p+kk]+w(v,p+kk+".")] if isinstance(o,dict) else [];print("\n".join(w(d)))' FILE`.
  Any path containing `refresh` means rotating, unless the issuer is Google.

## Never copy

- WhatsApp (`wacli` store): a second copy of one linked device can log out the first. Pair the
  target with its own QR (wacli skill) if Nadav wants WhatsApp there too.
- The secrets vault (`~/.claude/secrets-vault`) and anything under nadavai's environment, unless
  Nadav asked for the environment.

## Chrome: profiles, passwords and logins

Chrome (with `--password-store=gnome-libsecret`) encrypts cookies and saved passwords with a key
it keeps in the Secret Service as "Chrome Safe Storage". Copying the profile without the key
loses every login and password.

1. Ask Nadav to close Chrome on the source (`ls ~/.config/google-chrome/SingletonLock` must be
   gone). A live copy can catch a database mid-write.
2. Make sure Chrome is not running on the target, and move any profile already there aside
   (`mv ~/.config/google-chrome ~/.config/google-chrome.pre-copy-$(date +%F)`): the copy uses
   `--delete`. Then copy without the caches:
   `rsync -a --delete --exclude='Cache/' --exclude='Code Cache/' --exclude='GPUCache/' --exclude='*ShaderCache/' --exclude='*DawnCache/' --exclude='Service Worker/CacheStorage/' --exclude='component_crx_cache/' --exclude='Crashpad/' --exclude='Singleton*' ~/.config/google-chrome/ target:.config/google-chrome/`
   (5.3 GB for 6 profiles). Also copy `~/.config/chrome-flags.conf`, the `chrome-*.desktop`
   web-app launchers from `~/.local/share/applications`, and their `chrome-*` icons from
   `~/.local/share/icons/hicolor`.
3. If the username differs, replace `/home/<old>` with `/home/<new>` in `Local State`,
   `*/Preferences` and the launchers. Never edit `Secure Preferences`: its MACs would reset
   protected settings.
4. Move the key: `secret-tool lookup application chrome | ssh target 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus secret-tool store --label="Chrome Safe Storage" xdg:schema chrome_libsecret_os_crypt_password_v2 application chrome'`.
   Note which service owns `org.freedesktop.secrets` on the target (`busctl --user list`):
   ksecretd on KDE, or gnome-keyring. If that owner ever changes, store the key again.
5. Prove it: `scripts/chrome-verify.py` on the target checks every profile and must show
   `decrypt_ok` equal to `tested` (2026-11-03, Default: 200/200 cookies, 122/122 passwords).
