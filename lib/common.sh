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

# Refresh only an already configured Codex marketplace; never write its cache directly.
refresh_codex_plugin() {
  if ! command -v codex >/dev/null 2>&1; then
    log "Codex plugin refresh skipped: codex is not installed"
    return 0
  fi

  local marketplaces configured plugins state
  marketplaces="$(codex plugin marketplace list --json)" || {
    warn "Codex marketplace listing failed; a CLI with plugin marketplace support is required"
    return 1
  }
  configured="$(printf '%s' "$marketplaces" | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(input);
        if (!data || !Array.isArray(data.marketplaces) ||
            data.marketplaces.some(m => !m || typeof m.name !== "string")) {
          throw new Error("invalid marketplace list");
        }
        console.log(data.marketplaces.some(m => m.name === "nadavai") ? "yes" : "no");
      } catch {
        console.error("Invalid Codex marketplace list JSON");
        process.exitCode = 1;
      }
    });
  ')" || return 1
  if [ "$configured" = no ]; then
    log "Codex plugin refresh skipped: nadavai marketplace is not configured"
    return 0
  fi

  plugins="$(codex plugin list --marketplace nadavai --json)" || {
    warn "Codex plugin listing failed"
    return 1
  }
  state="$(printf '%s' "$plugins" | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(input);
        if (!data || !Array.isArray(data.installed) || !Array.isArray(data.available) ||
            data.installed.some(p => !p || typeof p.pluginId !== "string" ||
              typeof p.installed !== "boolean" || typeof p.enabled !== "boolean")) {
          throw new Error("invalid plugin list");
        }
        const plugin = data.installed.find(p => p.pluginId === "nadavai@nadavai");
        console.log(!plugin || !plugin.installed ? "missing" : plugin.enabled ? "enabled" : "disabled");
      } catch {
        console.error("Invalid Codex plugin list JSON");
        process.exitCode = 1;
      }
    });
  ')" || return 1
  if [ "$state" != enabled ]; then
    log "Codex plugin refresh skipped: nadavai plugin is $state"
    return 0
  fi

  codex plugin marketplace upgrade nadavai --json || {
    warn "Codex nadavai marketplace upgrade failed"
    return 1
  }
  codex plugin add nadavai@nadavai --json || {
    warn "Codex nadavai plugin refresh failed"
    return 1
  }
  log "Codex nadavai plugin refreshed"
  # Codex runs a plugin hook only after it was reviewed in /hooks; until then agent-guard
  # (forks, long sleeps, gh pr merge without a main-tier landing) is skipped without a word.
  local cfg="${CODEX_HOME:-$HOME/.codex}/config.toml"
  if [ -f "$cfg" ] && [[ $(<"$cfg") != *'"nadavai@nadavai:hooks/hooks.json:pre_tool_use:0:0"'* ]]; then
    warn "Codex has not trusted nadavai's PreToolUse hook (agent-guard): open codex, run /hooks and approve it"
  fi
}

link_rules() { link_dir "$REPO/rules" "$CFG/rules"; }

link_my_menu() {
  # The Ctrl+P menu of the /my-* prompts (mods/my-menu) is a mod. Claude Code loads a plugin
  # folder it finds under the skills folder, which every Orca account profile shares, so one
  # link reaches them all. It stays out of plugins/nadavai/hooks/hooks.json, which Codex reads.
  local skills="$HOME/.claude/skills" d
  link_dir "$REPO/mods/my-menu" "$skills/my-menu"
  if [ -d "$CFG/skills" ] && ! same_path "$CFG/skills" "$skills"; then
    link_dir "$REPO/mods/my-menu" "$CFG/skills/my-menu"
  fi
  # The keys live in ~/.claude/keybindings.json: Orca copies that file over each account
  # profile's own copy whenever it prepares the profile for a launch (a key written only into a
  # profile is gone at the next launch). The profiles are written too so that open sessions get
  # the keys now. A key that already runs something else is kept, and keybind.mjs names it.
  # Ctrl+P gives the keyboard to the band above the prompt, where the mod keeps a row of no
  # height that opens the list when it takes the focus (a mod cannot take the keyboard itself).
  # Until 2026-11-14 the key ran the mod's command, which opened a list without the keyboard:
  # that binding is this function's own, and is replaced. In the list, left and right move the
  # focus off it, which the mod reads as "the next group" and "the group before" (the list reads
  # right to left, so left is forward), and Ctrl+P hands the keyboard back, which closes it.
  for d in "$HOME/.claude" "$HOME"/.config/orca/claude-profiles/*/home; do
    [ -d "$d" ] || continue
    node "$REPO/lib/keybind.mjs" --was=command:my-menu "$d/keybindings.json" Chat \
      'ctrl+p=abovePrompt:focus' 'ctrl+shift+p=abovePrompt:focus' \
      && node "$REPO/lib/keybind.mjs" "$d/keybindings.json" AbovePromptSelect \
        'left=abovePrompt:next' 'right=abovePrompt:previous' \
        'ctrl+p=abovePrompt:leave' 'ctrl+shift+p=abovePrompt:leave' \
      || warn "could not bind the prompt menu keys in $d/keybindings.json"
  done
}

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
  # A plugin that an installed copy of nadavai still lists as a dependency is not turned off by
  # the merge either (see apply_model_policy): it keeps the value it had, or is turned on.
  local kept
  kept="$(NADAVAI_STILL_NEEDED="$(installed_nadavai_dependencies)" node -e '
    const fs = require("fs");
    const [base, target] = process.argv.slice(1);
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    const merge = (a, b) => { for (const k of Object.keys(b)) a[k] = isObj(b[k]) ? merge(isObj(a[k]) ? a[k] : {}, b[k]) : b[k]; return a; };
    const cur = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};
    const before = { ...(cur.enabledPlugins || {}) };
    const out = merge(cur, JSON.parse(fs.readFileSync(base, "utf8")));
    const kept = [];
    for (const p of (process.env.NADAVAI_STILL_NEEDED || "").split(/\s+/).filter(Boolean)) {
      if (out.enabledPlugins && out.enabledPlugins[p] === false && before[p] !== false) {
        out.enabledPlugins[p] = true;
        kept.push(p);
      }
    }
    fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
    console.log(kept.join(" "));
  ' "$REPO/settings/settings.base.json" "$target")"
  local p
  for p in $kept; do
    warn "$p stays on in $target: an installed copy of nadavai still lists it as a dependency (update that copy, then run update.sh again)"
  done
  log "merged settings.base.json into $target"
}

installed_nadavai_dependencies() {
  # The dependency ids (name@marketplace) of every installed copy of nadavai, all scopes, one per
  # line. Read from the copies on disk, not from this checkout: they are what Claude Code loads.
  python3 -I - "$HOME/.claude/plugins/installed_plugins.json" "${CFG:-$HOME/.claude}/plugins/installed_plugins.json" <<'PY' 2>/dev/null | sort -u
import json, os, sys
seen = set()
for registry in sys.argv[1:]:
    try:
        entries = json.load(open(registry)).get("plugins", {}).get("nadavai@nadavai", [])
    except (OSError, ValueError):
        continue
    for e in entries:
        path = os.path.join(e.get("installPath") or "", ".claude-plugin", "plugin.json")
        if path in seen:
            continue
        seen.add(path)
        try:
            deps = json.load(open(path)).get("dependencies") or []
        except (OSError, ValueError):
            continue
        for d in deps:
            if isinstance(d, dict) and d.get("name") and d.get("marketplace"):
                print(f"{d['name']}@{d['marketplace']}")
PY
}

apply_model_policy() {
  # Re-apply only the policy keys of settings.base.json on update (model, advisorModel, availableModels, missing modelSettings entries, plugins that base turns off,
  # deniedMcpServers, and the env vars CLAUDE_AUTOCOMPACT_PCT_OVERRIDE and OMC_QUIET). A full merge would also reset per-machine values such as the concurrency
  # caps. Every Orca account profile keeps its own settings.json, so the keys go to each one,
  # not only to the profile update.sh happens to run in (on 2026-11-07 only one of the
  # LENOVO's profiles had them).
  local target="$CFG/settings.json"
  if [ ! -f "$target" ]; then merge_settings; fi
  local f n=0 needed
  # Claude Code does not load a plugin whose dependency is turned off. A plugin that an installed
  # copy of nadavai still lists as a dependency is therefore not turned off here, whatever base
  # says: an install that did not update (the project-scope one, a pull that was skipped, a commit
  # not pushed yet) would otherwise leave nadavai, and its guards, unloaded in every session.
  needed="$(installed_nadavai_dependencies)"
  if [ -z "$needed" ] && ! command -v python3 >/dev/null 2>&1; then
    warn "python3 is missing, so the installed copies of nadavai could not be read: no plugin is protected from being turned off"
  fi
  for f in "$target" "$HOME/.claude/settings.json" "$HOME"/.config/orca/claude-profiles/*/home/settings.json; do
    [ -f "$f" ] || continue
    n=$((n+1))
    NADAVAI_STILL_NEEDED="$needed" node -e '
      const fs = require("fs");
      const [base, target, backup] = process.argv.slice(1);
      const stillNeeded = new Set((process.env.NADAVAI_STILL_NEEDED || "").split(/\s+/).filter(Boolean));
      const b = JSON.parse(fs.readFileSync(base, "utf8"));
      const raw = fs.readFileSync(target, "utf8");
      let cur;
      try { cur = JSON.parse(raw); } catch { cur = null; }
      if (!cur || typeof cur !== "object" || Array.isArray(cur)) { console.log("  skipped unreadable " + target); process.exit(0); }
      // A key dropped from base is dropped here too, so removing a deny later takes effect.
      for (const k of ["model", "advisorModel", "availableModels", "deniedMcpServers"]) { if (k in b) cur[k] = b[k]; else delete cur[k]; }
      // A plugin that base turns off is turned off in each profile; plugins a profile enabled itself stay.
      for (const [p, on] of Object.entries(b.enabledPlugins || {})) {
        if (on === false && stillNeeded.has(p)) {
          if (cur.enabledPlugins && cur.enabledPlugins[p] === true) console.log("  " + p + " stays on in " + target + ": an installed copy of nadavai still lists it as a dependency (update that copy, then run update.sh again)");
          continue;
        }
        if (on === false && cur.enabledPlugins && cur.enabledPlugins[p] === true) cur.enabledPlugins[p] = false;
        // A plugin synced from the claude.ai account (<name>@synced) loads with no entry at all, so
        // base turning it off has to write the entry; a profile that set it to true itself is
        // covered by the line above.
        if (on === false && p.endsWith("@synced") && !(cur.enabledPlugins && p in cur.enabledPlugins)) {
          cur.enabledPlugins = { ...(cur.enabledPlugins || {}), [p]: false };
        }
      }
      // Effort per model: add the entries a profile lacks (a new model), keep the ones it has.
      for (const [m, v] of Object.entries(b.modelSettings || {})) {
        cur.modelSettings = cur.modelSettings || {};
        if (!(m in cur.modelSettings)) cur.modelSettings[m] = v;
      }
      // Policy env vars are set one by one, so the other env vars of the machine (tokens, paths) stay.
      // OMC_QUIET=2 turns off the generic notes OMC adds around every tool call ("File written. Test
      // the changes", "Use parallel execution"); notes about a failed command or edit still appear.
      for (const k of ["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "OMC_QUIET"]) {
        const v = (b.env || {})[k];
        if (v !== undefined) cur.env = { ...(cur.env || {}), [k]: v };
        else if (cur.env) delete cur.env[k];
      }
      const next = JSON.stringify(cur, null, 2) + "\n";
      if (next === raw) process.exit(0);
      const dir = backup + "/" + target.replace(/[^A-Za-z0-9._-]/g, "_");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dir + "/settings.json", raw);
      // Write beside the real file and rename over it, so a running session never reads half a file.
      const real = fs.realpathSync(target), tmp = real + ".nadavai-tmp";
      fs.writeFileSync(tmp, next);
      fs.renameSync(tmp, real);
      console.log("  applied policy keys to " + target);
    ' "$REPO/settings/settings.base.json" "$f" "$BACKUP"
  done
  log "policy keys checked in $n settings file(s)"
}

enable_plugin_health_timer() {
  # The daily run of bin/plugin-health --notify (systemd/user/plugin-health.timer), linked and
  # enabled on every machine with a systemd user session. It is light (one `claude mcp list`).
  if ! command -v systemctl >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
    log "no systemd user session here: plugin-health.timer not enabled"
    return
  fi
  local dir="$HOME/.config/systemd/user" unit
  mkdir -p "$dir"
  for unit in plugin-health.service plugin-health.timer; do
    ln -sfn "$REPO/systemd/user/$unit" "$dir/$unit"
  done
  if systemctl --user daemon-reload && systemctl --user enable --now plugin-health.timer >/dev/null 2>&1; then
    log "plugin-health.timer enabled (daily)"
  else
    warn "could not enable plugin-health.timer"
  fi
}

apply_machine_env() {
  # Env values that hold a path into this checkout, so they differ per machine and cannot live
  # in settings.base.json. PLAYWRIGHT_MCP_CONFIG keeps Chromium's shared memory in /dev/shm
  # instead of /tmp on disk (measured 2026-10-26: Chromium was 36-52% of ext4 journal blocks).
  local target="$CFG/settings.json"
  [ -f "$target" ] || merge_settings
  node -e '
    const fs = require("fs");
    const [target, backup, pw] = process.argv.slice(1);
    const raw = fs.readFileSync(target, "utf8");
    const cur = JSON.parse(raw);
    cur.env = { ...(cur.env || {}), PLAYWRIGHT_MCP_CONFIG: pw };
    const next = JSON.stringify(cur, null, 2) + "\n";
    if (next === raw) { console.log("  machine env already current"); process.exit(0); }
    fs.mkdirSync(backup, { recursive: true });
    // merge_settings may have saved the original earlier in this run (apply_model_policy keeps
    // its own per-file copies under $BACKUP/<path>/)
    if (!fs.existsSync(backup + "/settings.json")) fs.writeFileSync(backup + "/settings.json", raw);
    fs.writeFileSync(target, next);
    console.log("  set PLAYWRIGHT_MCP_CONFIG in " + target);
  ' "$target" "$BACKUP" "$REPO/settings/playwright-mcp.json"
}

link_git() {
  link_dir "$REPO/git/hooks" "$HOME/.git-hooks"
  git config --global core.hooksPath "$HOME/.git-hooks"
  link_file "$REPO/git/ignore" "$HOME/.config/git/ignore"
  log "core.hooksPath=$HOME/.git-hooks, global ignore linked"
}

link_global_claude_md() {
  # ~/.claude/CLAUDE.md loads into every session and subagent: each Orca profile's own CLAUDE.md
  # is one line that imports it, so the target is always ~/.claude, whichever profile runs this.
  # `omc setup` used to own the file and left a 6K block whose delegation, model and verification
  # text the rules override; the short file here replaces it. claudeMdEnabled=false makes OMC
  # treat the file as the user's: no rewrite on setup or update, no drift warning.
  link_file "$REPO/settings/CLAUDE.global.md" "$HOME/.claude/CLAUDE.md"
  # OMC reads the flag from the config dir it runs in, and every Orca profile is its own config dir.
  local d
  for d in "$HOME/.claude" "$HOME"/.config/orca/claude-profiles/*/home; do
    [ -d "$d" ] || continue
    node -e '
      const fs = require("fs"), p = process.argv[1];
      let d = {};
      if (fs.existsSync(p)) {
        try { d = JSON.parse(fs.readFileSync(p, "utf8")); }
        catch { console.error("  ! " + p + " is not valid JSON: left as is; set \"claudeMdEnabled\": false in it by hand"); process.exit(0); }
      }
      if (!d || typeof d !== "object" || Array.isArray(d)) { console.error("  ! " + p + " is not a JSON object: left as is"); process.exit(0); }
      if (d.claudeMdEnabled === false) process.exit(0);
      d.claudeMdEnabled = false;
      fs.writeFileSync(p + ".nadavai-tmp", JSON.stringify(d, null, 2) + "\n");
      fs.renameSync(p + ".nadavai-tmp", p);
    ' "$d/.omc-config.json" || warn "could not set claudeMdEnabled in $d/.omc-config.json"
  done
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

# The LSP tool and OMC lsp_* need a TypeScript language server on PATH for the
# "LSP before grep" rule (rules/model-routing.md). It runs from its own prefix
# with a TypeScript 6 next to it: the server prefers the project's own
# node_modules/typescript and falls back to that one in a worktree without
# node_modules. Not npm -g: the global typescript is 7 (no tsserver), and a
# global install vanishes when fnm switches the default Node.
TS_LSP_VERSION=5.3.0
TS_LSP_TYPESCRIPT=6.0.3
ensure_ts_lsp() {
  local prefix="$HOME/.local/share/nadavai/ts-lsp" have=""
  have="$(node -p "require('$prefix/node_modules/typescript-language-server/package.json').version + ' ' + require('$prefix/node_modules/typescript/package.json').version" 2>/dev/null || true)"
  if [ "$have" != "$TS_LSP_VERSION $TS_LSP_TYPESCRIPT" ]; then
    log "installing typescript-language-server@$TS_LSP_VERSION with typescript@$TS_LSP_TYPESCRIPT"
    mkdir -p "$prefix"
    npm install --prefix "$prefix" --no-fund --no-audit --no-save \
      "typescript-language-server@$TS_LSP_VERSION" "typescript@$TS_LSP_TYPESCRIPT" \
      || { warn "could not install typescript-language-server"; return 0; }
  fi
  mkdir -p "$HOME/.local/bin"
  ln -sfn "$prefix/node_modules/.bin/typescript-language-server" "$HOME/.local/bin/typescript-language-server"
  # bf256ed installed it with npm -g (no TypeScript fallback); that copy can shadow this one in PATH
  if [ -d "$(npm root -g 2>/dev/null)/typescript-language-server" ]; then
    npm rm -g typescript-language-server >/dev/null 2>&1 || warn "could not remove the global typescript-language-server"
  fi
}

# A running Claude Code session keeps the plugin version it started with (its CLAUDE_PLUGIN_ROOT),
# so a new agent-guard rule reaches it only after /reload-plugins. The hook reads the script on
# every call, and agent-guard is self-contained (it reads only $NADAVAI_HOME), so every cached
# version gets the current copy: open sessions are guarded at once. Each copy is replaced by a
# rename, so a hook running at that moment reads the old file or the new one, never half of one.
refresh_running_guards() {
  local src="${REPO:-${NADAVAI_HOME:-$HOME/nadavai}}/plugins/nadavai/scripts/agent-guard.sh" d n=0 tmp
  [ -f "$src" ] || return 0
  for d in "$HOME/.claude/plugins/cache/nadavai/nadavai"/*/scripts; do
    [ -f "$d/agent-guard.sh" ] && ! cmp -s "$src" "$d/agent-guard.sh" || continue
    tmp="$d/.agent-guard.sh.$$"
    cp "$src" "$tmp" && chmod +x "$tmp" && mv -f "$tmp" "$d/agent-guard.sh" && n=$((n + 1))
  done
  log "agent-guard refreshed in $n cached plugin versions (running sessions)"
}

AGENT_BROWSER_VERSION=0.41.1
ensure_research_tools() {
  # Scrapling is the plugin's stdio MCP (plugins/nadavai/mcp.json), so without the command the
  # server fails at session start with no message. SkillSpector and agnix back rules/nadavai.md.
  # All three are pinned uv tools; npm is avoided for agnix because npm 12 blocks its install script.
  command -v uv >/dev/null 2>&1 || { warn "uv missing: cannot install scrapling, skillspector, agnix (https://docs.astral.sh/uv/)"; return 0; }
  if ! command -v scrapling >/dev/null 2>&1; then
    log "installing scrapling[ai]==0.5.1 (uv tool)"
    uv tool install "scrapling[ai]==0.5.1" || { warn "could not install scrapling"; }
  fi
  if command -v scrapling >/dev/null 2>&1; then
    # Downloads Chromium once. Its last step (playwright install-deps) uses apt and fails on
    # Arch after Chromium is in; that failure is harmless, the MCP does not need it.
    scrapling install >/dev/null 2>&1 || log "scrapling install: apt step failed (expected on Arch; Chromium is in place)"
  fi
  command -v skillspector >/dev/null 2>&1 || uv tool install "git+https://github.com/NVIDIA/skillspector.git@e48d771" || warn "could not install skillspector"
  command -v agnix >/dev/null 2>&1 || uv tool install "agnix==0.61.0" || warn "could not install agnix"
  # bin/webget reads YouTube through yt-dlp; not pinned, YouTube breaks old versions within weeks.
  if command -v yt-dlp >/dev/null 2>&1; then
    uv tool upgrade yt-dlp >/dev/null 2>&1 || true
  else
    uv tool install yt-dlp || warn "could not install yt-dlp (webget's YouTube path)"
  fi
}

ensure_agent_browser() {
  # agent-browser drives a separate Chrome for agents; its "vault" credential plugin
  # (bin/agent-browser-vault) fills logins from ~/.claude/secrets without the password
  # reaching the agent. See rules/acting-on-behalf.md.
  if ! command -v agent-browser >/dev/null 2>&1; then
    log "installing agent-browser@$AGENT_BROWSER_VERSION (npm -g)"
    npm install -g "agent-browser@$AGENT_BROWSER_VERSION" || { warn "could not install agent-browser"; return 0; }
  fi
  local cfg="$HOME/.agent-browser/config.json" tmp
  mkdir -p "$HOME/.agent-browser"
  [ -s "$cfg" ] || echo '{}' > "$cfg"
  tmp="$(mktemp)"
  if jq --arg cmd "$HOME/.local/bin/agent-browser-vault" '
      .plugins = ([(.plugins // [])[] | select(.name != "vault")]
                  + [{name: "vault", command: $cmd, capabilities: ["credential.read"]}])' \
      "$cfg" > "$tmp"; then
    mv "$tmp" "$cfg"
  else
    rm -f "${tmp:?}"; warn "could not register the vault plugin in $cfg"
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

ensure_npm_script_approvals() {
  # npm 12 runs no install scripts unless a package is approved, and `npm install-scripts approve`
  # does not work for global installs. Claude Code downloads its native binary in its install
  # script, so its own auto-update left `claude` printing "claude native binary not installed"
  # (LENOVO, 2026-11-06, 2.1.319). Approve it in ~/.npmrc, and repair a copy that is already broken.
  local rc="$HOME/.npmrc" bin dir
  if ! grep -qxF 'allow-scripts[]=@anthropic-ai/claude-code' "$rc" 2>/dev/null; then
    printf '\n# npm 12: allow the install script that downloads Claude Code\x27s native binary\nallow-scripts[]=@anthropic-ai/claude-code\n' >>"$rc"
    log "approved @anthropic-ai/claude-code install script in $rc"
  fi
  local out
  bin=$(command -v claude 2>/dev/null) || return 0
  out=$(claude --version 2>&1 || true)
  if [[ $out == *'native binary not installed'* ]]; then
    dir=$(dirname "$(dirname "$(readlink -f "$bin")")")
    (cd "$dir" && node install.cjs >/dev/null 2>&1) || true
    out=$(claude --version 2>&1 || true)
    if [[ $out != *'native binary not installed'* ]]; then
      log "repaired claude native binary (${out%%$'\n'*})"
    else
      warn "claude native binary missing; run: node $dir/install.cjs"
    fi
  fi
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

link_home_pyright() {
  # A Python language server that a session starts in the home folder would otherwise load
  # every .py file under it: measured on the LENOVO on 2026-11-14, 2.4 GB in one minute per
  # session, against 143 MB with this file. Open files are still analysed, and a project
  # folder is not affected: pyright reads this file only when the home folder is its root.
  local src="$REPO/config/home-pyrightconfig.json" dst="$HOME/pyrightconfig.json"
  if [ ! -e "$dst" ]; then cp "$src" "$dst"; log "wrote $dst"
  elif cmp -s "$src" "$dst"; then log "$dst is current"
  else warn "$dst differs from config/home-pyrightconfig.json; left as it is"; fi
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
uv|command -v uv|https://docs.astral.sh/uv/ (update.sh installs scrapling, skillspector, agnix with it)
scrapling|command -v scrapling|free scraper MCP: ./update.sh installs it (uv tool scrapling[ai]==0.5.1, then scrapling install; its apt step fails on Arch, harmless)
skillspector|command -v skillspector|scan skills before adding them: ./update.sh installs it
agnix|command -v agnix|lint CLAUDE.md, SKILL.md, hooks: ./update.sh installs it
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

mirror_guard_to_grok() {
  # Grok reads user hooks from ~/.grok/hooks/*.json ([compat.claude] hooks = false keeps it off
  # ~/.claude/settings.json). Commands are the live scripts in this repo, so a copied plugin
  # cannot leave Grok on an old guard. Matchers use Claude names; Grok maps Bash, Read, Grep,
  # and Write onto its own tools, and ask_user_question / spawn_subagent are named outright.
  [ -d "$HOME/.grok" ] || { log "no ~/.grok; skipping Grok guard hook"; return; }
  command -v jq >/dev/null 2>&1 || { warn "jq missing; Grok guard hook not written"; return 0; }
  local out="$HOME/.grok/hooks/nadavai-guard.json" tmp s
  s="$REPO/plugins/nadavai/scripts"
  mkdir -p "$HOME/.grok/hooks"
  tmp=$(mktemp "$out.XXXXXX")
  # Written whole and renamed, so a Grok session that reloads hooks never reads half a file.
  if jq -n \
       --arg guard "$s/agent-guard.sh" \
       --arg session "$s/session-check.sh" \
       --arg project "$s/project-check.sh" \
       --arg memory "command -v node >/dev/null 2>&1 && node $s/memory-index-check.mjs || true" \
       --arg hebrew "command -v node >/dev/null 2>&1 && node $s/hebrew-guard.mjs || true" \
       --arg candor "command -v node >/dev/null 2>&1 && node $s/candor-guard.mjs || true" \
       --arg edit "$s/edit-reminder.sh" \
       '{hooks: {
          SessionStart: [{matcher: "new|load|startup|resume", hooks: [
            {type: "command", command: $session, timeout: 15},
            {type: "command", command: $project, timeout: 5},
            {type: "command", command: $memory, timeout: 5}
          ]}],
          PreToolUse: [
            {matcher: "Agent|Bash|Read|Grep|Task|spawn_subagent", hooks: [
              {type: "command", command: $guard, timeout: 45}
            ]},
            {matcher: "AskUserQuestion|ask_user_question|AskQuestion", hooks: [
              {type: "command", command: $hebrew, timeout: 10}
            ]}
          ],
          Stop: [{hooks: [
            {type: "command", command: $hebrew, timeout: 10},
            {type: "command", command: $candor, timeout: 10}
          ]}],
          PostToolUse: [{matcher: "Write|Edit|MultiEdit", hooks: [
            {type: "command", command: $edit, timeout: 10},
            {type: "command", command: $memory, timeout: 5}
          ]}]
        }}' >"$tmp" &&
     mv "$tmp" "$out"; then
    log "$out refreshed"
  else
    rm -f "$tmp"; warn "could not write $out"
  fi
}

mirror_to_antigravity() {
  # Configure Google Antigravity (~/.gemini/config) to load the nadavai plugin,
  # marketplace skills/subagents, and mirrored global rules with an Antigravity adapter.
  local gcfg="${GEMINI_CONFIG_DIR:-$HOME/.gemini/config}"
  [ -d "$HOME/.gemini" ] || { log "no ~/.gemini; skipping Antigravity mirror"; return; }
  mkdir -p "$gcfg"

  # 1. Global rules (with Antigravity tool/model adapter + mirrored nadavai/rules/*.md).
  local rules_file="$gcfg/AGENTS.md"
  local tmp; tmp="$(mktemp)"
  cat <<'HEADER' > "$tmp"
<!-- ANTIGRAVITY ADAPTER START - generated by ~/nadavai/update.sh. Do not edit by hand. -->

# Antigravity Orchestration & Tool Adapter

You are running in Google Antigravity with the `nadavai` environment. Apply the global rules below using Antigravity's native tools and model parameters:

- **Subagent model parameter (`invoke_subagent`)**: Antigravity's `Model` enum accepts ONLY `inherit`, `pro`, `flash`, or `flash_lite`. Never pass Claude/Codex model names (`opus`, `sonnet`, `haiku`, `fable`) to `invoke_subagent`. Map complex architecture, debugging, security, and review work (`opus` in the rules below) to `pro` (or `inherit`), routine work (`sonnet`) to `inherit`, and quick lookups (`haiku`) to `flash`. Fable is chosen only by Nadav, never by an agent.
- **Subagent types (`invoke_subagent`)**: Built-in types are `self` (full toolset in an isolated context), `research` (read-only exploration and web/docs lookup), and `image-generator`. Custom subagents (`ember`, `wren`, `vigil`, `rune`, `planner`, `executor`, `verifier`, `code-reviewer`, `debugger`, `architect`, `critic`, `security-reviewer`) are registered via `agents.json` or can be defined on demand with `define_subagent`.
- **Tool mapping from Claude Code names in rules/skills**:
  - `AskUserQuestion` -> `ask_question`
  - `Bash` with `run_in_background: true` -> `run_command` (commands exceeding `WaitMsBeforeAsync` run in the background automatically and wake you on completion; never `sleep` + poll in a loop)
  - `Read` / `Edit` / `MultiEdit` / `Write` -> `view_file` / `replace_file_content` / `multi_replace_file_content` / `write_to_file`
  - `Grep` / `Glob` -> `grep_search` / `find_by_name`
- **Project path-scoped rules (`.claude/rules/*.md`)**: When working in a project that has `.claude/rules/*.md` (listed at `SessionStart`), read the matching `.claude/rules/<topic>.md` file with `view_file` before editing files in its scope.
- **Large skills (>24 KB)**: Antigravity inlines the first 24,000 bytes of an activated `SKILL.md`. When activating a skill whose `SKILL.md` is truncated (such as `nadav-design`, `capacitor-plugins`, `israeli-accessibility-compliance`, or `emil-design-eng`), call `view_file` with `StartLine` on that `SKILL.md` to read the remaining lines.

<!-- ANTIGRAVITY ADAPTER END -->

HEADER
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
  } >> "$tmp"

  if cp "$tmp" "$rules_file" 2>/dev/null; then
    log "$rules_file refreshed"
    if [ -f "$HOME/AGENTS.md" ] && grep -q 'ANTIGRAVITY ADAPTER START' "$HOME/AGENTS.md" 2>/dev/null; then
      rm -f "$HOME/AGENTS.md"
    fi
  else
    warn "could not write $rules_file; falling back to $HOME/AGENTS.md"
    if [ -f "$HOME/AGENTS.md" ] && ! grep -q 'NADAVAI RULES START' "$HOME/AGENTS.md" 2>/dev/null; then
      backup_path "$HOME/AGENTS.md" "home-AGENTS.md"
    fi
    cp "$tmp" "$HOME/AGENTS.md" 2>/dev/null && log "$HOME/AGENTS.md refreshed"
  fi
  rm -f "$tmp"

  # 2. Install nadavai plugin into Antigravity (40 skills, 6 MCP servers, lifecycle hooks)
  #    and populate adapted subagents (intent + OMC) with Antigravity-valid YAML frontmatter.
  if command -v agy >/dev/null 2>&1; then
    rm -f "$gcfg/plugins.json" "$gcfg/agents.json" 2>/dev/null || true
    if agy plugin install "$REPO/plugins/nadavai" >/dev/null 2>&1; then
      rm -rf "$gcfg/plugins/nadavai/.omc" 2>/dev/null || true
      node -e '
        const fs = require("fs"), path = require("path"), os = require("os");
        const home = os.homedir();
        const outDir = process.argv[1];
        fs.mkdirSync(outDir, { recursive: true });
        const readOnly = new Set(["architect.md", "critic.md", "code-reviewer.md", "security-reviewer.md", "explore.md", "vigil.md"]);
        const readTools = ["view_file", "grep_search", "find_by_name", "list_dir", "read_url_content", "search_web", "send_message", "call_mcp_tool"];
        const writeTools = [...readTools, "write_to_file", "replace_file_content", "multi_replace_file_content", "run_command", "manage_task"];
        const sources = [
          { dir: `${home}/.claude/plugins/marketplaces/intent/agents`, files: ["ember.md", "wren.md", "vigil.md", "rune.md", "noor.md", "sage.md"] },
          { dir: `${home}/.claude/plugins/marketplaces/omc/agents`, files: ["planner.md", "executor.md", "verifier.md", "code-reviewer.md", "debugger.md", "architect.md", "critic.md", "security-reviewer.md", "explore.md", "designer.md", "writer.md", "qa-tester.md"] }
        ];
        for (const src of sources) {
          if (!fs.existsSync(src.dir)) continue;
          for (const f of src.files) {
            const p = path.join(src.dir, f);
            if (!fs.existsSync(p)) continue;
            let s = fs.readFileSync(p, "utf8");
            const tools = readOnly.has(f) ? readTools : writeTools;
            s = s.replace(/^---\n([\s\S]*?)\n---\n/, (_, fm) => {
              const keep = [];
              let hasModel = false;
              for (const line of fm.split("\n")) {
                if (/^(name|description):/.test(line)) keep.push(line);
                else if (/^model:/.test(line)) {
                  hasModel = true;
                  if (line.includes("opus")) keep.push("model: pro");
                  else if (line.includes("haiku")) keep.push("model: flash");
                  else keep.push("model: inherit");
                }
              }
              if (!hasModel) keep.push("model: inherit");
              keep.push("tools:");
              for (const t of tools) keep.push(`  - ${t}`);
              return "---\n" + keep.join("\n") + "\n---\n";
            });
            fs.writeFileSync(path.join(outDir, f), s);
          }
        }
      ' "$gcfg/plugins/nadavai/agents" 2>/dev/null || true
      log "agy plugin nadavai installed (with adapted subagents)"
    else
      warn "agy plugin install reported a problem"
    fi
  elif printf '{\n  "entries": [\n    { "path": "%s/plugins" }\n  ]\n}\n' "$REPO" > "$gcfg/plugins.json" 2>/dev/null; then
    log "$gcfg/plugins.json refreshed"
  fi

  # 3. skills.json -> curated marketplace skills + ~/.agents/skills using resolved absolute paths
  #    so the total stays comfortably inside Antigravity's 20,000-token customizationBudget (zero truncation).
  node -e '
    const fs = require("fs"), os = require("os");
    const home = os.homedir();
    const spec = [
      { path: `${home}/.agents/skills`, exclude: ["synced"] },
      { path: `${home}/.claude/plugins/marketplaces/impeccable/plugin/skills` },
      {
        path: `${home}/.claude/plugins/marketplaces/intent/skills`,
        include_only: [
          "strategize", "investigate", "journey", "organize", "wireframe",
          "articulate", "evaluate", "fortify", "include", "localize", "measure", "specify"
        ]
      },
      { path: `${home}/.claude/plugins/marketplaces/interfaces/skills` },
      {
        path: `${home}/.claude/plugins/marketplaces/posthog/skills`,
        include_only: [
          "instrument-product-analytics", "instrument-error-tracking",
          "building-a-dashboard", "signals-scout-web-vitals",
          "investigating-replay", "assessing-heatmaps", "querying-posthog-data"
        ]
      },
      { path: `${home}/.claude/plugins/marketplaces/i-have-adhd/skills` },
      { path: `${home}/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills` },
      {
        path: `${home}/.claude/plugins/marketplaces/omc/skills`,
        include_only: ["deep-interview", "ralplan", "ai-slop-cleaner", "skill"]
      }
    ];
    const entries = spec.filter((e) => fs.existsSync(e.path));
    fs.writeFileSync(process.argv[1], JSON.stringify({ entries }, null, 2) + "\n");
  ' "$gcfg/skills.json" 2>/dev/null && log "$gcfg/skills.json refreshed"

  # 4. Merge BRIGHTDATA_API_TOKEN from ~/.claude/settings.json into ~/.gemini/config/mcp_config.json when writable.
  node -e '
    const fs = require("fs");
    const [claudeSettings, mcpPath] = process.argv.slice(1);
    if (!fs.existsSync(claudeSettings)) process.exit(0);
    const token = JSON.parse(fs.readFileSync(claudeSettings, "utf8"))?.env?.BRIGHTDATA_API_TOKEN;
    if (!token) process.exit(0);
    let mcp = { mcpServers: {} };
    if (fs.existsSync(mcpPath)) {
      const raw = fs.readFileSync(mcpPath, "utf8").trim();
      if (raw) mcp = JSON.parse(raw);
    }
    mcp.mcpServers = mcp.mcpServers || {};
    mcp.mcpServers["nadavai-brightdata"] = {
      url: `https://mcp.brightdata.com/mcp?token=${token}&groups=social,research,advanced_scraping`
    };
    fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
  ' "$CFG/settings.json" "$gcfg/mcp_config.json" 2>/dev/null && log "$gcfg/mcp_config.json brightdata entry refreshed" || true
}
