#!/usr/bin/env bash
# Carry the part of the Claude environment that a public repo must never hold:
# secrets, per-project memory, and the secret env keys from settings.json.
# Everything else is reproduced by setup.sh, so this stays deliberately small.
#
#   ./carry.sh pack [--with-history]   encrypted archive on the Desktop
#   ./carry.sh send <host> [--with-history]   pack, then copy to host over ssh/Tailscale
#   ./carry.sh restore <file.gpg>      unpack into this machine's ~/.claude
#
# --with-history adds ~/.claude/projects in full (session transcripts, ~GBs).
# Without it only the memory directories travel, which is what a new machine needs.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$REPO/lib/common.sh"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${CARRY_OUT_DIR:-$HOME/Desktop}"
WITH_HISTORY=0

# Secret-bearing keys inside settings.json "env". Extend as new ones appear.
SECRET_ENV_KEYS='BRIGHTDATA_API_TOKEN'

usage() { sed -n '2,11p' "$0"; exit "${1:-0}"; }

parse_flags() {
  for a in "$@"; do
    case "$a" in
      --with-history) WITH_HISTORY=1 ;;
      -h|--help) usage ;;
    esac
  done
}

need_gpg() { need gpg "Install gnupg: the archive is never written unencrypted."; }

pack() {
  need_gpg
  local stage plain out
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' RETURN

  step "Collecting"

  if [ -d "$CFG/secrets" ]; then
    mkdir -p "$stage/secrets"
    cp -a "$CFG/secrets/." "$stage/secrets/"
    log "secrets: $(find "$stage/secrets" -type f | wc -l) files"
  else
    warn "no $CFG/secrets on this machine"
  fi

  # Per-project memory lives at projects/<slug>/memory. Keep the slug so restore
  # puts each memory back under the project it belongs to.
  local n=0 d slug
  for d in "$CFG"/projects/*/memory; do
    [ -d "$d" ] || continue
    slug="$(basename "$(dirname "$d")")"
    mkdir -p "$stage/memory/$slug"
    cp -a "$d/." "$stage/memory/$slug/"
    n=$((n + 1))
  done
  log "memory: $n project directories"

  # Only the secret keys, never the whole settings file: the rest is settings.base.json.
  if [ -f "$CFG/settings.json" ]; then
    node -e '
      const fs = require("fs");
      const [src, dst, keys] = process.argv.slice(1);
      const env = (JSON.parse(fs.readFileSync(src, "utf8")).env) || {};
      const out = {};
      for (const k of keys.split(",")) if (env[k] !== undefined) out[k] = env[k];
      fs.writeFileSync(dst, JSON.stringify({ env: out }, null, 2) + "\n");
      console.log("  secret env keys: " + (Object.keys(out).join(", ") || "(none)"));
    ' "$CFG/settings.json" "$stage/settings-secrets.json" "$SECRET_ENV_KEYS"
  fi

  if [ "$WITH_HISTORY" = 1 ] && [ -d "$CFG/projects" ]; then
    log "history: copying $CFG/projects ($(du -sh "$CFG/projects" | cut -f1)), this takes a while"
    mkdir -p "$stage/projects"
    cp -a "$CFG/projects/." "$stage/projects/"
  fi

  step "Encrypting"
  mkdir -p "$OUT_DIR"
  plain="$(mktemp -t nadavai-carry-XXXXXX.tar.gz)"
  out="$OUT_DIR/nadavai-carry-$STAMP.tar.gz.gpg"
  tar czf "$plain" -C "$stage" .
  # Symmetric, so one passphrase travels instead of a keyring. gpg prompts for it:
  # no --batch here, or it would fail with nothing to read the passphrase from.
  gpg --yes -c --cipher-algo AES256 -o "$out" "$plain" || { shred -u "$plain" 2>/dev/null || rm -f "$plain"; die "gpg failed; nothing was written"; }
  shred -u "$plain" 2>/dev/null || rm -f "$plain"
  chmod 600 "$out"
  log "$out ($(du -h "$out" | cut -f1))"
  CARRY_LAST="$out"
}

send() {
  local host="${1:-}"
  [ -n "$host" ] || die "send needs a host: ./carry.sh send msi"
  pack
  step "Sending to $host"
  scp "$CARRY_LAST" "$host:~/" || die "scp failed; is $host reachable (tailscale status) and ssh set up?"
  log "copied to $host:~/$(basename "$CARRY_LAST")"
  log "there, run: ~/nadavai/carry.sh restore ~/$(basename "$CARRY_LAST")"
}

restore() {
  local archive="${1:-}"
  [ -n "$archive" ] && [ -f "$archive" ] || die "restore needs the .gpg archive"
  need_gpg
  local stage
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' RETURN

  step "Decrypting"
  gpg -d "$archive" 2>/dev/null | tar xzf - -C "$stage" || die "could not decrypt or unpack $archive"

  step "Restoring"
  mkdir -p "$CFG"

  if [ -d "$stage/secrets" ]; then
    [ -d "$CFG/secrets" ] && backup_path "$CFG/secrets" "secrets"
    cp -a "$stage/secrets" "$CFG/secrets"
    chmod 700 "$CFG/secrets"; chmod 600 "$CFG"/secrets/* 2>/dev/null || true
    log "secrets restored to $CFG/secrets (mode 600)"
  fi

  local slug n=0
  for slug in "$stage"/memory/*; do
    [ -d "$slug" ] || continue
    mkdir -p "$CFG/projects/$(basename "$slug")/memory"
    cp -an "$slug/." "$CFG/projects/$(basename "$slug")/memory/" 2>/dev/null || true
    n=$((n + 1))
  done
  log "memory restored into $n project directories (existing files kept)"

  if [ -f "$stage/settings-secrets.json" ]; then
    node -e '
      const fs = require("fs");
      const [frag, target] = process.argv.slice(1);
      const add = JSON.parse(fs.readFileSync(frag, "utf8")).env || {};
      const cur = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};
      cur.env = Object.assign({}, cur.env, add);
      fs.writeFileSync(target, JSON.stringify(cur, null, 2) + "\n");
      console.log("  merged into settings.json: " + (Object.keys(add).join(", ") || "(none)"));
    ' "$stage/settings-secrets.json" "$CFG/settings.json"
  fi

  if [ -d "$stage/projects" ]; then
    cp -an "$stage/projects/." "$CFG/projects/" 2>/dev/null || true
    log "session history merged into $CFG/projects"
  fi

  step "Done"
  log "Sign the MCP servers in once with /mcp (Supabase, Cloudflare, PostHog, Vercel)."
}

ACTION="${1:-}"; shift || true
parse_flags "$@"
case "$ACTION" in
  pack)    pack ;;
  send)    send "${1:-}" ;;
  restore) restore "${1:-}" ;;
  ""|-h|--help) usage ;;
  *) usage 1 ;;
esac
