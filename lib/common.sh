#!/usr/bin/env bash
# Shared helpers for setup.sh and update.sh. Sourced, not executed.

CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$CFG/nadavai-backup-$TS"

log()  { printf '  %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required. $2"; }

same_path() { [ -e "$1" ] && [ -e "$2" ] && [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$(cd "$2" 2>/dev/null && pwd -P)" ]; }

backup_path() {
  # Move an existing file or directory out of the way, keeping it under $BACKUP.
  local src="$1" name="$2"
  mkdir -p "$BACKUP"
  mv "$src" "$BACKUP/$name"
  log "moved existing $src to $BACKUP/$name"
}

link_dir() {
  # link_dir <repo dir> <target path>: make target a symlink to the repo dir.
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    same_path "$dst" "$src" && { log "$dst already linked"; return; }
    rm "$dst"
  elif [ -e "$dst" ]; then
    backup_path "$dst" "$(basename "$dst")"
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  log "$dst -> $src"
}

link_file() {
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    [ "$(readlink "$dst")" = "$src" ] && { log "$dst already linked"; return; }
    rm "$dst"
  elif [ -e "$dst" ]; then
    backup_path "$dst" "$(basename "$dst")"
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  log "$dst -> $src"
}

marketplace_known() {
  node -e '
    const p = process.argv[1], name = process.argv[2];
    let d = {}; try { d = require(p); } catch {}
    process.exit(d[name] ? 0 : 1);
  ' "$CFG/plugins/known_marketplaces.json" "$1" 2>/dev/null
}

add_marketplace() {
  # add_marketplace <name> <source>
  local name="$1" source="$2"
  if marketplace_known "$name"; then log "marketplace $name already known"; return; fi
  claude plugin marketplace add "$source"
}

plugin_installed() {
  node -e '
    const p = process.argv[1], id = process.argv[2];
    let d = {}; try { d = require(p); } catch {}
    const e = d.plugins && d.plugins[id];
    process.exit(Array.isArray(e) ? (e.length ? 0 : 1) : (e ? 0 : 1));
  ' "$CFG/plugins/installed_plugins.json" "$1" 2>/dev/null
}

link_rules() { link_dir "$REPO/rules" "$CFG/rules"; }

retire_duplicate_skills() {
  # A user-level skill with the same name as a plugin skill shadows it. Move such copies aside.
  local d name
  for d in "$REPO"/plugins/nadavai/skills/*/; do
    name="$(basename "$d")"
    if [ -e "$CFG/skills/$name" ] || [ -L "$CFG/skills/$name" ]; then
      mkdir -p "$BACKUP/skills"
      mv "$CFG/skills/$name" "$BACKUP/skills/$name"
      log "moved duplicate user skill $name to $BACKUP/skills/"
    fi
  done
}

merge_settings() {
  # Deep-merge settings/settings.base.json into $CFG/settings.json. Base wins on
  # conflicts; keys only present locally (for example machine-specific hooks) are kept.
  local target="$CFG/settings.json"
  mkdir -p "$CFG"
  if [ -f "$target" ]; then mkdir -p "$BACKUP"; cp "$target" "$BACKUP/settings.json"; fi
  node -e '
    const fs = require("fs");
    const [base, target] = process.argv.slice(1);
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    const merge = (a, b) => { for (const k of Object.keys(b)) a[k] = isObj(b[k]) ? merge(isObj(a[k]) ? a[k] : {}, b[k]) : b[k]; return a; };
    const cur = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};
    fs.writeFileSync(target, JSON.stringify(merge(cur, JSON.parse(fs.readFileSync(base, "utf8"))), null, 2) + "\n");
  ' "$REPO/settings/settings.base.json" "$target"
  log "merged settings.base.json into $target"
}

link_git() {
  link_dir "$REPO/git/hooks" "$HOME/.git-hooks"
  git config --global core.hooksPath "$HOME/.git-hooks"
  link_file "$REPO/git/ignore" "$HOME/.config/git/ignore"
  log "core.hooksPath=$HOME/.git-hooks, global ignore linked"
}

ensure_omc() {
  if ! command -v omc >/dev/null 2>&1; then
    # The package is oh-my-claude-sisyphus, not oh-my-claudecode: the latter name
    # on npm is an unrelated project at 0.2.15 that ships no omc binary, so
    # installing it leaves `omc setup` unable to run at all.
    log "installing the omc CLI (npm -g oh-my-claude-sisyphus)"
    npm install -g oh-my-claude-sisyphus
  fi
  # Installs ~/.claude/CLAUDE.md (OMC block), the HUD statusline and OMC hooks.
  omc setup --quiet || warn "omc setup reported a problem; run 'omc setup' by hand"
}

ensure_continues() {
  if ! command -v continues >/dev/null 2>&1; then
    log "installing the continues CLI (npm -g continues)"
    npm install -g continues
  fi
}

link_shortcuts() {
  # `cs` runs continues. Claude Squad ships a binary of the same name, so the first
  # run moves it to `csq` and nothing overwrites a binary that is already there.
  local dst="$HOME/.local/bin/cs"
  if [ -f "$dst" ] && [ ! -L "$dst" ]; then
    if [ -e "$HOME/.local/bin/csq" ]; then
      backup_path "$dst" "cs"
    else
      mv "$dst" "$HOME/.local/bin/csq"
      log "moved the existing cs binary (Claude Squad) to csq"
    fi
  fi
  link_file "$REPO/bin/cs" "$dst"

  # Every other script in bin/ is linked under the same name. A local file that is
  # not already our symlink is moved to the backup first, so nothing is overwritten.
  local src name target
  for src in "$REPO"/bin/*; do
    name="$(basename "$src")"
    [ "$name" = "cs" ] && continue
    target="$HOME/.local/bin/$name"
    if [ -e "$target" ] && [ ! -L "$target" ]; then backup_path "$target" "$name"; fi
    link_file "$src" "$target"
  done
}

dependency_ids() {
  node -e '
    const m = require(process.argv[1]);
    for (const d of m.dependencies || []) console.log(typeof d === "string" ? d : `${d.name}@${d.marketplace || "nadavai"}`);
  ' "$REPO/plugins/nadavai/.claude-plugin/plugin.json"
}

npm_globals() {
  # Names from npm-globals.txt, comments and blank lines stripped.
  sed -e 's/#.*//' -e 's/[[:space:]]//g' "$REPO/npm-globals.txt" | grep -v '^$'
}

ensure_npm_globals() {
  # Opt-in: hundreds of MB. Only installs what is missing.
  local installed missing=() pkg
  installed="$(npm ls -g --depth=0 --parseable 2>/dev/null | sed 's|.*/node_modules/||')"
  while read -r pkg; do
    grep -qxF "$pkg" <<<"$installed" || missing+=("$pkg")
  done < <(npm_globals)
  if [ "${#missing[@]}" -eq 0 ]; then log "all global npm packages present"; return; fi
  log "installing ${#missing[@]} missing: ${missing[*]}"
  npm install -g "${missing[@]}" || warn "npm install -g reported a problem"
}

report_npm_globals() {
  local installed pkg missing=0
  installed="$(npm ls -g --depth=0 --parseable 2>/dev/null | sed 's|.*/node_modules/||')"
  while read -r pkg; do
    grep -qxF "$pkg" <<<"$installed" || { missing=$((missing + 1)); }
  done < <(npm_globals)
  if [ "$missing" -gt 0 ]; then
    printf '  %-8s %-22s %s\n' "MISSING" "npm globals ($missing)" "run ./setup.sh --npm"
  else
    printf '  %-8s %-22s\n' "ok " "npm globals"
  fi
}

link_shell() {
  # One source line in ~/.bashrc, so the repo owns the shared shell environment
  # and ~/.bashrc keeps everything machine-specific.
  local rc="$HOME/.bashrc" marker="# nadavai shell environment"
  if grep -qF "$marker" "$rc" 2>/dev/null; then log "$rc already sources shell/nadavai.sh"; return; fi
  {
    printf '\n%s\n' "$marker"
    printf '%s\n' '[ -r "$HOME/nadavai/shell/nadavai.sh" ] && . "$HOME/nadavai/shell/nadavai.sh"'
  } >> "$rc"
  log "appended the source line to $rc"
}

system_check() {
  # Tools the rules and hooks expect. Reported, never installed here.
  local line name check hint ok
  while IFS='|' read -r name check hint; do
    [ -z "$name" ] && continue
    if eval "$check" >/dev/null 2>&1; then ok="ok "; else ok="MISSING"; fi
    printf '  %-8s %-22s %s\n' "$ok" "$name" "$([ "$ok" = "MISSING" ] && printf '%s' "$hint")"
  done <<'LIST'
gh|command -v gh|GitHub CLI: https://cli.github.com (then gh auth login)
pnpm|command -v pnpm|npm i -g pnpm
trivy|command -v trivy|pre-push CVE scan: https://trivy.dev/latest/getting-started/installation/
delta|command -v delta|git pager (git config core.pager): https://dandavison.github.io/delta/
git-lfs|command -v git-lfs|https://git-lfs.com
tmux|command -v tmux|OMC qa-tester and omc launch need tmux
playwright|ls "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"|npx playwright install chromium
codex|command -v codex|omc ask codex: npm i -g @openai/codex
android-sdk|[ -d "${ANDROID_HOME:-$HOME/Android/Sdk}" ]|Capacitor Android builds: install cmdline-tools + platform 36 + emulator
maestro|command -v maestro|mobile flows: curl -fsSL https://get.maestro.mobile.dev | bash
bubblewrap|command -v bubblewrap|TWA: npm i -g @bubblewrap/cli
sox|command -v sox|/voice input
brightdata-token|grep -q BRIGHTDATA_API_TOKEN "$CFG/settings.json"|add {"env":{"BRIGHTDATA_API_TOKEN":"..."}} to ~/.claude/settings.json (README, Secrets)
LIST
}

mirror_rules_to_codex() {
  # Codex reads only $CODEX_HOME/AGENTS.md globally, so the rules are mirrored into a
  # delimited block there. OMX owns the rest of the file; only the block is rewritten,
  # and it is appended when absent.
  local home="${CODEX_HOME:-$HOME/.codex}"
  local target="$home/AGENTS.md"
  [ -d "$home" ] || { log "no $home; skipping Codex rules mirror"; return; }
  local body; body="$(mktemp)"
  {
    printf '<!-- NADAVAI RULES START - generated from %s/rules by ~/nadavai/update.sh. Do not edit by hand. -->\n\n' "$CFG"
    printf '# Global rules (mirrored from Claude Code)\n\n'
    local f
    for f in "$CFG"/rules/*.md; do
      [ -e "$f" ] || continue
      printf '<!-- source: rules/%s -->\n' "$(basename "$f")"
      cat "$f"; printf '\n'
    done
    printf '<!-- NADAVAI RULES END -->\n'
  } > "$body"
  if [ -f "$target" ] && grep -q 'NADAVAI RULES START' "$target"; then
    local out; out="$(mktemp)"
    awk -v body="$body" '
      /NADAVAI RULES START/ { while ((getline line < body) > 0) print line; close(body); skip=1; next }
      /NADAVAI RULES END/   { skip=0; next }
      !skip
    ' "$target" > "$out"
    mv "$out" "$target"
  else
    printf '\n' >> "$target"
    cat "$body" >> "$target"
  fi
  rm -f "$body"
  log "$target rules block refreshed"
}
