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

apply_model_policy() {
  # Re-apply only the model keys of settings.base.json on update. A full merge would also
  # reset per-machine values such as the concurrency caps.
  local target="$CFG/settings.json"
  if [ ! -f "$target" ]; then merge_settings; return; fi
  node -e '
    const fs = require("fs");
    const [base, target, backup] = process.argv.slice(1);
    const b = JSON.parse(fs.readFileSync(base, "utf8"));
    const raw = fs.readFileSync(target, "utf8");
    const cur = JSON.parse(raw);
    for (const k of ["model", "availableModels"]) if (k in b) cur[k] = b[k];
    const next = JSON.stringify(cur, null, 2) + "\n";
    if (next === raw) { console.log("  model policy already current"); process.exit(0); }
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(backup + "/settings.json", raw);
    fs.writeFileSync(target, next);
    console.log("  applied model and availableModels from settings.base.json to " + target);
  ' "$REPO/settings/settings.base.json" "$target" "$BACKUP"
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
    // merge_settings or apply_model_policy may have saved the original earlier in this run
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

mirror_guard_to_grok() {
  # Grok reads user hooks from ~/.grok/hooks/*.json ([compat.claude] hooks = false keeps it off
  # ~/.claude/settings.json), and its installed nadavai plugin is a copy that does not follow this
  # repo, so agent-guard gets its own file pointing at the live script. "Bash" also matches
  # Grok's run_terminal_command.
  [ -d "$HOME/.grok" ] || { log "no ~/.grok; skipping Grok guard hook"; return; }
  mkdir -p "$HOME/.grok/hooks"
  printf '{\n  "hooks": {\n    "PreToolUse": [\n      {\n        "matcher": "Bash",\n        "hooks": [\n          { "type": "command", "command": "%s", "timeout": 45 }\n        ]\n      }\n    ]\n  }\n}\n' \
    "$REPO/plugins/nadavai/scripts/agent-guard.sh" > "$HOME/.grok/hooks/nadavai-guard.json"
  log "$HOME/.grok/hooks/nadavai-guard.json refreshed"
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

- **Subagent model parameter (`invoke_subagent`)**: Antigravity's `Model` enum accepts ONLY `inherit`, `pro`, `flash`, or `flash_lite`. Never pass Claude/Codex model names (`opus`, `sonnet`, `haiku`, `fable`) to `invoke_subagent`. Map complex architecture, debugging, security, and review work (`opus` in the rules below) to `pro` (or `inherit`), routine work (`sonnet`) to `inherit`, and quick lookups (`haiku`) to `flash`. Fable is never used.
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
      {
        path: `${home}/.claude/plugins/marketplaces/wondelai-skills`,
        include_only: [
          "ux-heuristics", "ios-hig-design", "jobs-to-be-done",
          "mom-test", "conversion-optimization"
        ]
      },
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
