#!/usr/bin/env bash
# PreToolUse hook (Agent, Bash): opt-in guards. Deny only, never updatedInput
# (it replaces the whole tool input). The same script serves Claude Code and Codex (the
# plugin's hooks/hooks.json; Codex sends tool_name "Bash" and reads the same deny), Antigravity
# (hooks.json, a toolCall payload) and Grok (~/.grok/hooks/nadavai-guard.json written by
# update.sh; toolName run_terminal_command, toolInput, and it honors permissionDecision).
#   Agent: subagent_type "fork" unless the description carries [fork]. A fork inherits
#          the parent's model and its full context (median ~290K tokens per request).
#   Bash:  a sleep of 120 s or more in the foreground. It blocks the agent; long local
#          commands go to run_in_background, CI waits to ci-wait.
#   Bash:  `gh pr merge` into main of a NadavAI CI repo (therapy-flow-v2, sportchat-web,
#          cash-next-app, snooker-smart, or any other Nadav011 repo whose main head carries a
#          nadavai-ci status, one more gh call) whose head's newest nadavai-ci round is not a full pass
#          at main tier (landing request) or that is behind main, unless the PR is documentation
#          only by the runner's rule or the command carries `# land-urgent: <reason>`. The merge
#          commit is a new sha, and main reruns the full suite on anything that did not land
#          through ci-wait --land (18 times on 2026-10-28). An unknown repo or a failed gh call
#          (10 s each) allows, except that a behind_by above 0 denies even when the statuses
#          read failed.
#   Bash:  `find` or `bfs` that walks / or a home directory (a path, or . when the working directory is
#          one of them) without -maxdepth of 4 or less, unless the command carries
#          `# full-scan: <reason>`. On 2026-10-31 one such search held the disk at 99% for 5 minutes,
#          and all 7 Orca stalls of a 10-minute sample fell inside it. Applies in the background too.
#          Quoted strings with spaces (ssh host 'find /', bash -c '...'), heredoc bodies and commands over
#          20000 characters are not read.
# Strict mode, off unless ${XDG_CONFIG_HOME:-~/.config}/nadavai/guard-strict exists (touch it to
# switch on, remove it to switch off; the next call reads it). Both rules apply in the
# background too (rules/ci-policy.md, rules 4 and 7):
#   - a while/until loop that reads a gh or CI status or a Claude tasks/*.output file, or that
#     sleeps under 2 s. Never a for loop or a `while read` loop; a short sleep is allowed in
#     a local readiness wait (curl localhost, a port check, pg_isready), and any command
#     that runs heavy.sh passes. The script of `bash -c '...'` is read; heredoc bodies and
#     other quoted strings (ssh host '...') are not.
#   - `docker run -d` / `podman run -d` of a postgres image without --entrypoint (also an image
#     left as a variable whose name has pg or postgres in it), `docker compose up -d` of a
#     compose file with one, or `supabase start` / `supabase db start` (a server per agent), unless
#     the command carries `# isolated-pg: <reason>` (cluster-wide SQL: roles, ALTER SYSTEM).
#     pg-pool get gives a fresh database on the shared server instead.
# Silent (exit 0, no output) for everything else.
set -u
input=$(cat)
strict=0
[ -e "${XDG_CONFIG_HOME:-$HOME/.config}/nadavai/guard-strict" ] && strict=1

is_agy=0
case "$input" in *'"toolCall"'*) is_agy=1 ;; esac

allow() {
  [ "$is_agy" = 1 ] && printf '%s\n' '{"decision":"ask"}'
  exit 0
}

deny() {
  if [ "$is_agy" = 1 ]; then
    jq -cn --arg r "$1" '{decision: "deny", reason: $r}'
  else
    jq -cn --arg r "$1" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  fi
  exit 0
}

# Fast path: most calls carry neither word, and this runs before every Bash/run_command call.
case "$input" in
  *'"fork"'*|*sleep*|*gh*merge*|*find*|*bfs*) ;;
  *while*|*until*|*docker*|*podman*|*supabase*) [ "$strict" = 1 ] || allow ;;
  *) allow ;;
esac
command -v jq >/dev/null 2>&1 || allow

check_sleep() {
  awk '
    function secs(w,  n, u) {
      u = substr(w, length(w)); n = w
      if (u ~ /[smhd]/) n = substr(w, 1, length(w) - 1); else u = "s"
      return n * (u == "m" ? 60 : u == "h" ? 3600 : u == "d" ? 86400 : 1)
    }
    hd != "" { t = $0; sub(/^\t+/, "", t); if (t == hd) hd = ""; next }
    {
      line = $0
      if (match(line, /<<-?[ \t]*["\x27]?[A-Za-z_][A-Za-z0-9_]*/)) {
        hd = substr(line, RSTART, RLENGTH); sub(/^<<-?[ \t]*["\x27]?/, "", hd)
      }
      gsub(/\x27[^\x27]*\x27/, "", line); gsub(/"([^"\\]|\\.)*"/, "", line)
      all = all " ; " line
    }
    END {
      gsub(/[;&|(){}]/, " ; ", all); n = split(all, w, /[ \t]+/)
      best = 0; cmdpos = 1
      for (i = 1; i <= n; i++) {
        if (w[i] == "") continue
        if (cmdpos && w[i] == "sleep") {
          tot = 0; txt = "sleep"
          for (j = i + 1; j <= n && w[j] ~ /^[0-9]*\.?[0-9]+[smhd]?$/; j++) { tot += secs(w[j]); txt = txt " " w[j] }
          if (tot > best) { best = tot; besttxt = txt }
          i = j - 1; cmdpos = 0; continue
        }
        cmdpos = (w[i] == ";" || w[i] == "do" || w[i] == "then" || w[i] == "else")
      }
      if (best >= 120) printf "%d\t%s\n", best, besttxt
    }'
}

# Strict mode: prints "<rule>\t<detail>" for the first offending polling loop (rule gh, task
# or short) or postgres server (rule pg), nothing otherwise. Quoted strings are set aside as
# placeholders, so a keyword inside a string is not read as one, while a loop body's quoted
# paths still count when it is classified. The script of `bash -c '...'` / `sh -c "..."` is read
# the same way. A heredoc body is read for the docker rule only, and only when it runs: fed to a
# shell (bash <<EOF), or written to a file the command then executes (bash f, ./f, source f).
# Loops in heredoc bodies are never read. gh counts as polling only when it reads a status
# (run view/watch, pr checks, commits/<sha>/status(es), check-runs). `docker compose up -d`
# counts when the compose file (-f, or the default names in the cwd) has a postgres image.
# With merge 1 it reports every executed `gh pr merge` instead, one line each (rule merge), its
# detail being the -R value, the PR argument and the last `cd` directory before it, separated by
# \037. A PR that comes from a backtick or from xargs reads as "`" or "$xargs".
# check_strict <loops 0|1> <pg 0|1> <cwd> [merge 0|1]
check_strict() {
  awk -v loops="${1:-1}" -v pg="${2:-1}" -v cwd="${3:-$PWD}" -v merge="${4:-0}" '
    function resc(s) { gsub(/[][\\.^$*+?(){}|\/]/, "\\\\&", s); return s }
    # postgrest (PostgREST) is not a database server.
    # A metrics exporter (postgres-exporter) or supabase/postgres-meta (an API) is not one either.
    function pgimage(s) { return s !~ /exporter|postgres-meta/ && s ~ /postgres([^t]|$)|postgis|pgvector|timescale/ }
    # skipwrap <i> <m>: the index of the command a wrapper runs: timeout [opts] N, nohup, time, command,
    # env [opts] [VAR=..], sudo [opts], nice [-n N], stdbuf [opts], npx/pnpx/bunx [opts],
    # pnpm|yarn|npm|bun [opts] [dlx|exec|x] [opts], xargs [opts], and VAR=.. assignments.
    function skipwrap(j, m,   a, vf, ch) {
      for (ch = 1; ch && j <= m; ) {
        ch = 0; a = w[j]
        if (a ~ /^[A-Za-z_][A-Za-z0-9_]*=/ || a == "nohup" || a == "command" || a == "--") { j++; ch = 1; continue }
        if (a == "timeout") {
          for (j++; w[j] ~ /^-/; j++) if (w[j] ~ /^(-s|-k|--signal|--kill-after)$/) j++
          j++; ch = 1; continue
        }
        vf = ""
        if (a == "time") vf = " "
        else if (a == "env") vf = " -u -C -S --unset --chdir --split-string "
        else if (a == "sudo") vf = " -u -g -h -p -C -U -r -t -D --user --group --host --prompt --chdir "
        else if (a == "nice") vf = " -n --adjustment "
        else if (a == "stdbuf") vf = " -i -o -e "
        else if (a == "xargs") vf = " -a -d -E -I -L -n -P -s --arg-file --delimiter --eof --max-lines --max-args --max-procs --max-chars "
        else if (a == "npx" || a == "pnpx" || a == "bunx") vf = " -p --package -c --call "
        else if (a == "pnpm" || a == "yarn" || a == "npm" || a == "bun") vf = " --filter -F -C --dir --prefix --cwd --workspace "
        if (vf == "") break
        for (j++; j <= m; j++) {
          if (w[j] ~ /^-/) { if (index(vf, " " w[j] " ")) j++; continue }
          if (a == "env" && w[j] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) continue
          if (vf ~ /--filter/ && (w[j] == "dlx" || w[j] == "exec" || w[j] == "x")) { a = "npx"; vf = " -p --package -c --call "; continue }
          break
        }
        ch = 1
      }
      return j
    }
    # compose_pg <file>: the first postgres image in a compose file, or ""
    function compose_pg(f,   l, r) {
      if (f !~ /^\//) f = cwd "/" f
      r = ""
      while ((getline l < f) > 0) if (r == "" && l ~ /^[ \t]*image:/ && pgimage(l)) { r = l; sub(/^[ \t]*image:[ \t]*/, "", r) }
      close(f)
      return r
    }
    function expand(s,  k) {
      while (match(s, /__Q[0-9]+__/)) { k = substr(s, RSTART + 3, RLENGTH - 5) + 0; s = substr(s, 1, RSTART - 1) q[k] substr(s, RSTART + RLENGTH) }
      return s
    }
    function text(a, b,  k, s) { s = ""; for (k = a; k <= b; k++) s = s " " w[k]; return expand(s) }
    function isnum(x) { return x ~ /^[0-9]*\.?[0-9]+s?$/ }
    function found(rule, detail) { printf "%s\t%s\n", rule, detail; done_ = 1 }
    # analyze <source> <mode: all|pg>: queues the scripts of nested `sh -c` calls.
    function analyze(src, mode,   n, raw, i, m, d, e, c, k, depth, body, minsl, v, hasgh, a, det, ep, img, nxt, vn, inner, pre, rp, pr, cdd, off, lastj) {
      while (match(src, /\x27[^\x27]*\x27|"([^"\\]|\\.)*"/)) {
        q[++nq] = substr(src, RSTART, RLENGTH); pre = substr(src, 1, RSTART - 1)
        if (pre ~ /(^|[^A-Za-z0-9_.\/-])(ba|z|da)?sh[ \t]+(-[A-Za-z]+[ \t]+)*-[A-Za-z]*c[ \t]+$/) {
          inner = substr(q[nq], 2, length(q[nq]) - 2)
          if (q[nq] ~ /^"/) { gsub(/\\"/, "\"", inner); gsub(/\\\$/, "$", inner); gsub(/\\`/, "`", inner); gsub(/\\\\/, "\\", inner) }
          queue[++nqueue] = inner; qmode[nqueue] = mode
        }
        src = pre "__Q" nq "__" substr(src, RSTART + RLENGTH)
      }
      # ${NAME} and ${NAME:-x} become $NAME, so the braces do not split the word.
      while (match(src, /\$\{[A-Za-z_][A-Za-z0-9_]*[^}]*\}/)) {
        v = substr(src, RSTART + 2, RLENGTH - 3); sub(/[^A-Za-z0-9_].*$/, "", v)
        src = substr(src, 1, RSTART - 1) "$" v substr(src, RSTART + RLENGTH)
      }
      # A backtick also leaves itself as a word, so that `gh pr merge `...`` shows where its PR comes from.
      # So does the {} of xargs and find (as __BRACES__), so that it is not read as a group.
      gsub(/\n/, " ; ", src); gsub(/`/, " ; ` ; ", src); gsub(/\{\}/, "__BRACES__", src); gsub(/[;&|(){}]/, " ; ", src)
      n = split(src, raw, /[ \t]+/); m = 0
      delete w; delete cp
      for (i = 1; i <= n; i++) if (raw[i] != "") w[++m] = raw[i]
      cp[1] = 1
      for (i = 1; i <= m; i++)
        cp[i + 1] = (w[i] ~ /^(;|do|then|else|!|while|until|if|elif)$/) || (cp[i] && w[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/)
      # gh pr merge behind any wrapper; flags that take a value and redirects are skipped, the first
      # other word is the PR. The repo is -R/--repo (also between pr and merge), else GH_REPO= before gh.
      for (i = 1; merge && i <= m; i++) {
        if (cp[i] && w[i] == "cd") { cdd = (w[i + 1] == ";" || i == m) ? "~" : expand(w[i + 1]); gsub(/["\x27]/, "", cdd) }
        # A VAR= prefix is at command position too; the gh it leads to is read once.
        if (!cp[i] || w[j = skipwrap(i, m)] !~ /(^|\/)gh$/ || w[j + 1] != "pr" || j <= lastj) continue
        lastj = j
        rp = ""; pr = ""; off = 0
        for (k = i; k < j; k++) {
          if (w[k] ~ /^GH_REPO=/) { rp = expand(substr(w[k], 9)); gsub(/["\x27]/, "", rp) }
          if (w[k] == "xargs") pr = "$xargs"
        }
        for (k = j + 2; k <= m && w[k] != ";" && w[k] != "merge"; k++) {
          a = expand(w[k]); gsub(/["\x27]/, "", a)
          if (a == "-R" || a == "--repo") { rp = expand(w[++k]); gsub(/["\x27]/, "", rp) }
          else if (a ~ /^--repo=/) rp = substr(a, 8)
          else if (a ~ /^-R./) rp = substr(a, 3)
          else break
        }
        if (w[k] != "merge") continue
        for (k++; k <= m && w[k] != ";"; k++) {
          a = expand(w[k]); gsub(/["\x27]/, "", a); if (a == "__BRACES__") a = "{}"
          # A redirect (>out, 2>/dev/null; 2>&1 arrives as `2>` before a `;`); a bare one takes the next word.
          if (w[k] ~ /^[0-9]*[<>]/) { if (w[k] ~ /^[0-9]*[<>]+$/ && w[k + 1] != ";") k++; continue }
          if (a == "-R" || a == "--repo") { rp = expand(w[++k]); gsub(/["\x27]/, "", rp); continue }
          if (a ~ /^--repo=/) { rp = substr(a, 8); continue }
          if (a ~ /^-R./) { rp = substr(a, 3); continue }
          if (a == "--disable-auto" || a == "-h" || a == "--help") off = 1
          if (a ~ /^(-[AbFt]|--(author-email|body|body-file|subject|match-head-commit))$/) { k++; continue }
          if (a !~ /^-/ && pr == "") pr = a
        }
        if (pr == "" && w[k] == ";" && w[k + 1] == "`") pr = "`"
        # One line per merge, and no done_: every merge in the command is checked.
        if (!off) printf "merge\t%s\037%s\037%s\n", rp, pr, cdd
      }
      for (i = 1; loops && mode == "all" && i <= m; i++) {
        if (!cp[i] || (w[i] != "while" && w[i] != "until")) continue
        for (d = i + 1; d <= m && !(cp[d] && w[d] == "do"); d++) ;
        if (d > m) continue
        depth = 1
        for (e = d + 1; e <= m; e++) {
          if (cp[e] && w[e] == "do") depth++
          if (cp[e] && w[e] == "done" && --depth == 0) break
        }
        if (e > m) e = m
        for (c = i + 1; c < d && w[c] ~ /^[A-Za-z_][A-Za-z0-9_]*=/; c++) ;
        if (w[i] == "while" && w[c] == "read") continue
        body = text(i, e); minsl = ""
        for (k = i + 1; k < e; k++)
          if (cp[k] && w[k] == "sleep" && isnum(w[k + 1])) { v = w[k + 1]; sub(/s$/, "", v); if (minsl == "" || v + 0 < minsl + 0) minsl = v }
        if (minsl == "") continue
        if (body ~ /tasks\/[^ ;]*\.output/) { found("task", w[i]); return }
        if (body ~ /(^|[^A-Za-z0-9_.-])gh[ \t]+(run[ \t]+(view|watch)|pr[ \t]+checks)|(^|[^A-Za-z0-9_.-])gh[ \t]+api[ \t][^;]*(\/status|check-runs)|api\.github\.com[^ ;]*(\/status|check-runs)|ci-report|commits\/[^ ;]*\/status/) { found("gh", w[i]); return }
        if (minsl + 0 < 2 && body !~ /pg_isready|\/dev\/tcp\/|nc +-[a-z]*z|ss +-[a-z]*l|lsof[^;]* -[a-zA-Z]*i|fuser|docker +(inspect|logs|exec)|(curl|wget)[^;]*(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/) {
          found("short", "sleep " minsl); return
        }
      }
      if (!pg) return
      # Plain NAME=value assignments, so that docker run ... $IMG can be resolved.
      for (i = 1; i <= m; i++)
        if (cp[i] && match(w[i], /^[A-Za-z_][A-Za-z0-9_]*=/)) { v = expand(substr(w[i], RLENGTH + 1)); gsub(/["\x27]/, "", v); asg[substr(w[i], 1, RLENGTH - 1)] = v }
      for (i = 1; i < m; i++) {
        # supabase start / supabase db start, behind any wrapper (timeout, env, npx -y, pnpm dlx, ...);
        # not with -h/--help
        if (cp[i] && w[j = skipwrap(i, m)] ~ /^supabase(@[^ ]*)?$/) {
          sub_ = ""; hit = ""; help = 0; stop = 0
          for (k = j + 1; k <= m && w[k] != ";"; k++) {
            if (w[k] == "-h" || w[k] == "--help") help = 1
            if (stop || hit != "") continue
            if (w[k] ~ /^(--workdir|--profile|--network-id|--output|-o)$/) { k++; continue }
            if (w[k] ~ /^-/) continue
            if (sub_ == "" && w[k] == "start") hit = "supabase start"
            else if (sub_ == "" && w[k] == "db") sub_ = "db"
            else if (sub_ == "db" && w[k] == "start") hit = "supabase db start"
            else stop = 1
          }
          if (hit != "" && !help) { found("supabase", hit); return }
        }
        # docker compose up -d / docker-compose up -d with a postgres image in the compose file
        if ((w[i] == "docker" && w[i + 1] == "compose") || w[i] == "docker-compose") {
          nf = 0; up = 0; det = 0
          for (k = i + (w[i] == "docker" ? 2 : 1); k <= m && w[k] != ";"; k++) {
            a = expand(w[k]); gsub(/["\x27]/, "", a)
            if (a == "-f" || a == "--file") { cf[++nf] = expand(w[k + 1]); gsub(/["\x27]/, "", cf[nf]); k++; continue }
            if (a ~ /^--file=/) { cf[++nf] = substr(a, 8); continue }
            if (a == "up") up = 1
            if (up && (a == "-d" || a == "--detach" || a ~ /^-[A-Za-z]*d[A-Za-z]*$/)) det = 1
          }
          if (!up || !det) continue
          if (nf == 0) { cf[1] = "compose.yaml"; cf[2] = "compose.yml"; cf[3] = "docker-compose.yml"; cf[4] = "docker-compose.yaml"; nf = 4 }
          for (k = 1; k <= nf; k++) { img = compose_pg(cf[k]); if (img != "") { found("pg", img " (compose)"); return } }
          continue
        }
        if (w[i] != "docker" && w[i] != "podman") continue
        k = i + 1; if (w[k] == "container") k++
        if (w[k] != "run") continue
        det = 0; ep = 0; img = ""; nxt = ""
        for (k++; k <= m && w[k] != ";"; k++) {
          a = w[k]
          if (a == "--entrypoint" || a ~ /^--entrypoint=/) ep = 1
          if (a == "--detach" || a ~ /^--detach=(true|1)$/) { det = 1; continue }
          # A cluster of short flags (-d, -itd, -dp 5432:5432): d detaches; a last letter outside
          # d, i, t, P, q takes the next word as its value.
          if (a ~ /^-[A-Za-z]+$/) {
            if (a ~ /d/) det = 1
            if (substr(a, length(a)) !~ /[ditPq]/) k++
            continue
          }
          if (a ~ /^--[A-Za-z]/) {
            if (a ~ /=/ || a ~ /^--(rm|init|privileged|read-only|interactive|tty|quiet|publish-all|sig-proxy|no-healthcheck|oom-kill-disable)$/) continue
            k++; continue
          }
          img = expand(a); if (k < m) nxt = expand(w[k + 1]); break
        }
        if (!det || ep) continue
        gsub(/["\x27]/, "", img)
        if (img ~ /^\$/) { vn = img; gsub(/[${}]/, "", vn); if (vn in asg) img = asg[vn] }
        # An image left as a variable counts when its name says postgres or pg, or when the
        # command after it is the postgres server.
        if ((img !~ /^\$/ && pgimage(img)) || (img ~ /^\$/ && (nxt == "postgres" || tolower(vn) ~ /pg|postgres/))) { found("pg", img); return }
      }
    }
    hd != "" {
      t = $0; sub(/^\t+/, "", t)
      if (t == hd) { hd = ""; nh++; hbodies[nh] = hbody; hrun[nh] = hexec; hfiles[nh] = hfile; hbody = "" } else hbody = hbody $0 "\n"
      next
    }
    {
      line = $0
      # A heredoc start: not a here-string (<<<) and not a shift inside (( )).
      rest = line; off = 0
      while (match(rest, /<<-?[ \t]*["\x27]?[A-Za-z_][A-Za-z0-9_]*/)) {
        pre = substr(line, 1, off + RSTART - 1); opn = gsub(/\(\(/, "", pre); pre = substr(line, 1, off + RSTART - 1); cls = gsub(/\)\)/, "", pre)
        if (substr(line, off + RSTART - 1, 1) != "<" && opn <= cls) {
          hd = substr(rest, RSTART, RLENGTH); sub(/^<<-?[ \t]*["\x27]?/, "", hd)
          pre = substr(line, 1, off + RSTART - 1)
          hexec = (pre ~ /(^|[^A-Za-z0-9_.\/-])(ba|z|da)?sh([ \t]+-[A-Za-z]+)*[ \t]*$/)
          # The file it is written to: the argument of tee, else the first redirect other than /dev/null.
          hfile = ""; r = line
          if (match(line, /tee[ \t]+(-a[ \t]+)?[^ \t;&|<>-][^ \t;&|<>]*/)) { hfile = substr(line, RSTART, RLENGTH); sub(/^tee[ \t]+(-a[ \t]+)?/, "", hfile) }
          while (hfile == "" && match(r, />>?[ \t]*[^ \t;&|<>]+/)) {
            t = substr(r, RSTART, RLENGTH); sub(/^>>?[ \t]*/, "", t); r = substr(r, RSTART + RLENGTH)
            if (t != "/dev/null") hfile = t
          }
          gsub(/["\x27]/, "", hfile)
          break
        }
        off += RSTART + 1; rest = substr(line, off + 1)
      }
      # A comment, when the quotes before it are balanced: an apostrophe in it would pair with the next quote.
      if (match(line, /(^|[ \t;])#/)) {
        pre = substr(line, 1, RSTART); sq = gsub(/\x27/, "\x27", pre); dq = gsub(/"/, "\"", pre)
        if (sq % 2 == 0 && dq % 2 == 0) line = substr(line, 1, RSTART)
      }
      # A continued line joins the next one.
      if (sub(/\\$/, "", line)) all = all line " "; else all = all line "\n"
    }
    END {
      if (hd != "") { nh++; hbodies[nh] = hbody; hrun[nh] = hexec; hfiles[nh] = hfile }
      # A heredoc written to a file counts only when that file is run later in the command.
      plain = all; gsub(/["\x27]/, "", plain)
      for (h = 1; h <= nh; h++) {
        f = hfiles[h]; b = f; sub(/^.*\//, "", b)
        if (!hrun[h] && f != "" && (plain ~ ("(^|[;&|(\n][ \t]*|[ \t])((ba|z|da)?sh|source|\\.)[ \t]+(-[A-Za-z]+[ \t]+)*" resc(f) "([ \t;&|)\n]|$)") ||
            plain ~ ("(^|[;&|(\n])[ \t]*" resc(f) "([ \t;&|)\n]|$)") || plain ~ ("(^|[;&|(\n])[ \t]*\\./" resc(b) "([ \t;&|)\n]|$)"))) hrun[h] = 1
        if (hrun[h]) { queue[++nqueue] = hbodies[h]; qmode[nqueue] = "pg" }
      }
      queue[++nqueue] = all; qmode[nqueue] = "all"
      for (qi = nqueue; qi >= 1 && !done_; qi--) {
        if (qi in seen) continue
        seen[qi] = 1; before = nqueue
        analyze(queue[qi], qmode[qi])
        if (nqueue > before) qi = nqueue + 1
      }
    }
  ' | if [ "${4:-0}" = 1 ]; then cat; else head -1; fi
}

# check_disk_search <wide 0|1>: prints the first find/bfs at command position that walks / or a home
# directory, nothing otherwise. wide 1: the working directory is one of them, so . and no path count too,
# until a cd or pushd says otherwise. Heredoc bodies, comments and quoted strings with a space or shell
# operator are set aside; a shorter quoted word keeps its content (find "$HOME").
check_disk_search() {
  awk -v wide="${1:-0}" '
    function whole(p) {
      return p ~ /^(\/|\/\.|\/\*|\/root\/?|\/home(\/\*?)?|\/home\/[^\/]+(\/(\.|\*)?)?|~(\/(\.|\*)?)?|\$HOME(\/(\.|\*)?)?)$/
    }
    function here(p) { return p ~ /^(\.\/?|\$PWD\/?)$/ }
    hd != "" { t = $0; sub(/^\t+/, "", t); if (t == hd) hd = ""; next }
    {
      line = $0
      gsub(/<<</, " ", line)
      if (match(line, /<<-?[ \t]*[\\"\x27]?[A-Za-z_][A-Za-z0-9_]*/)) {
        hd = substr(line, RSTART, RLENGTH); sub(/^<<-?[ \t]*[\\"\x27]?/, "", hd)
      }
      all = all line "\n"
    }
    END {
      gsub(/\$\{HOME\}/, "$HOME", all); gsub(/\$\{PWD\}/, "$PWD", all)
      # Leftmost first, so a # inside quotes stays quoted and an apostrophe in a comment opens nothing.
      out = ""
      while (match(all, /\x27[^\x27]*\x27|"([^"\\]|\\.)*"|(^|[ \t\n])#[^\n]*/)) {
        m = substr(all, RSTART, RLENGTH); c = substr(m, 1, 1)
        if (c == "\x27" || c == "\"") {
          q = substr(m, 2, length(m) - 2)
          if (q == "" || q ~ /[ \t\n;&|(){}`]/) q = "_"
        } else q = " "
        out = out substr(all, 1, RSTART - 1) q
        all = substr(all, RSTART + RLENGTH)
      }
      all = out all
      gsub(/\\\n/, " ", all); gsub(/\n/, " ; ", all)
      gsub(/\\[();]/, " ", all); gsub(/\{\}/, "__BRACES__", all)
      gsub(/[0-9]*[<>]&[0-9-]*/, " ", all); gsub(/&>>?/, " > ", all)
      gsub(/[A-Za-z_][A-Za-z0-9_-]*\(\)/, "_fn ", all)
      gsub(/\)/, " ) ", all); gsub(/[;&|({}`]/, " ; ", all)
      n = split(all, w, /[ \t]+/)
      cmdpos = 1
      for (i = 1; i <= n; i++) {
        if (w[i] == "") continue
        if (w[i] == ";") { cmdpos = 1; continue }
        if (w[i] == ")") { cmdpos = 0; continue }
        if (!cmdpos) continue
        if (w[i] ~ /^(do|then|else|!|if|elif|while|until)$/ || w[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) continue
        if (w[i] == "command" && w[i + 1] ~ /^-[vV]$/) { cmdpos = 0; continue }
        if (w[i] ~ /^(sudo|nice|ionice|timeout|nohup|command|exec|env|stdbuf|time|heavy-slot|xargs)$/) {
          while (w[i + 1] ~ /^-/ || w[i + 1] ~ /^[0-9.]+[smhd]?$/ || w[i + 1] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
            i++
            if (w[i - 1] == "sudo" && w[i] ~ /^-[ug]$/) i++
          }
          continue
        }
        if (w[i] == "cd" || w[i] == "pushd") {
          wide = (i == n || w[i + 1] == ";" || w[i + 1] == ")" || whole(w[i + 1]))
          cmdpos = 0; continue
        }
        cw = w[i]; sub(/^\\/, "", cw)
        if (cw ~ /(^|\/)(find|bfs)$/) {
          start = 1; npaths = 0; bad = 0; depth = -1; info = 0; txt = cw
          for (j = i + 1; j <= n && w[j] != ";" && w[j] != ")"; j++) {
            if (w[j] == "") continue
            txt = txt " " w[j]
            if (w[j] ~ /^--?(version|help)$/) info = 1
            if (start) {
              if (w[j] ~ /^-(H|L|P|O[0-9]*)$/) continue
              if (w[j] == "-D" || w[j] == "-S") { j++; continue }
              if (w[j] ~ /^[-!]/) start = 0
              else { npaths++; if (whole(w[j]) || (wide && here(w[j]))) bad = 1 }
            }
            if (w[j] == "-maxdepth" && w[j + 1] ~ /^[0-9]+$/) depth = w[j + 1] + 0
          }
          if (npaths == 0 && wide) bad = 1
          if (bad && !info && (depth < 0 || depth > 4)) { print substr(txt, 1, 80); exit }
          i = j - 1; cmdpos = 0; continue
        }
        cmdpos = 0
      }
    }'
}

disk_search_guard() { # disk_search_guard <command> <cwd>: denies a walk of the whole disk or home, or returns
  local found wide=0
  case "$1" in *find*|*bfs*) ;; *) return 0 ;; esac
  case "$1" in *'# full-scan:'*) return 0 ;; esac
  # A command this long is a script being written, and the quote scan is quadratic in its length.
  [ "${#1}" -le 20000 ] || return 0
  case "${2:-$PWD}" in /|"$HOME"|"$HOME"/|/home|/home/) wide=1 ;; esac
  found=$(printf '%s\n' "$1" | check_disk_search "$wide")
  [ -n "$found" ] || return 0
  deny "'$found' walks the whole disk or home (16 million files; on 2026-10-31 one such search held the disk at 99% for 5 minutes and froze Orca). To find a file by name use plocate <name> (rebuilt nightly, skips node_modules and .git). Otherwise search under the project directory, or add -maxdepth of 4 or less. If a full walk is really needed, add '# full-scan: <reason>' to the command."
}

strict_guard() { # strict_guard <command>: denies, or returns
  local found loops=1 pg=1
  [ "$strict" = 1 ] || return 0
  case "$1" in *heavy.sh*) loops=0 ;; esac
  case "$1" in *'# isolated-pg:'*) pg=0 ;; esac
  found=$(printf '%s\n' "$1" | check_strict "$loops" "$pg" "${2:-$PWD}")
  case "${found%%$'\t'*}" in
    gh) deny "This ${found#*$'\t'} loop polls GitHub or CI. Wait with ci-wait <repo> <sha|branch> in run_in_background (one poller per sha) and continue when the completion notice arrives." ;;
    task) deny "This ${found#*$'\t'} loop polls a background task's output file. The completion notice arrives by itself; to react to lines as they appear, use Monitor." ;;
    short) deny "This loop's ${found#*$'\t'} polls faster than every 2 s. Wait by blocking (docker wait, pg_isready -t, flock, inotifywait), sleep 2-5 s between checks, or run it with run_in_background / Monitor." ;;
    supabase) deny "${found#*$'\t'} starts a whole Supabase stack per agent (on 2026-10-19 five of them, 45 containers, held this machine at load 28-41). For SQL tests use pg-pool get <repo>: a fresh database on the shared server (pg-pool drop when done). If the stack itself is the subject, add '# isolated-pg: <reason>' to the command." ;;
    pg) deny "Starting ${found#*$'\t'} detached is a Postgres server per agent. Use pg-pool get <repo> for a fresh database on the shared server (pg-pool drop when done). If the SQL needs cluster-wide objects (roles, ALTER SYSTEM), add '# isolated-pg: <reason>' to the command." ;;
  esac
}

merge_guard() { # merge_guard <command> <cwd>: denies on the first failing merge, or returns
  local found lines line rp pr dir o n pv head ref base kind passed behind
  case "$1" in *gh*pr*merge*) ;; *) return 0 ;; esac
  case "$1" in *'# land-urgent:'*) return 0 ;; esac
  found=$(printf '%s\n' "$1" | check_strict 0 0 "${2:-$PWD}" 1)
  mapfile -t lines <<<"$found"
  for line in "${lines[@]}"; do
    [ "${line%%$'\t'*}" = merge ] || continue
    IFS=$'\037' read -r rp pr dir <<<"${line#*$'\t'}"
    behind=""
    # shellcheck disable=SC2088  # a literal ~ from the command's cd
    case "$dir" in
      '') dir=${2:-$PWD} ;;
      '~'|'~/'*) dir=$HOME${dir#\~} ;;
      /*) ;;
      *) dir=${2:-$PWD}/$dir ;;
    esac
    case "$pr" in *github.com/*/pull/*) rp=${pr#*github.com/}; rp=${rp%%/pull/*}; pr=${pr##*/pull/}; pr=${pr%%[/?#]*} ;; esac
    [ -n "$rp" ] || rp=$(git -C "$dir" remote get-url origin 2>/dev/null)
    rp=${rp%/}; rp=${rp%.git}
    case "$rp" in */*) ;; *) continue ;; esac
    n=${rp##*/}; o=${rp%/*}; o=${o##*[/:]}
    [ "${o,,}" = nadav011 ] || continue
    # Any other repo is on NadavAI CI when main's head carries a nadavai-ci status (repos added later too).
    case "${n,,}" in
      therapy-flow-v2|sportchat-web|cash-next-app|snooker-smart) ;;
      *) timeout 10 gh api "repos/$o/$n/commits/main/statuses?per_page=30" 2>/dev/null \
           | jq -e 'type == "array" and any(.[]; .context == "nadavai-ci")' >/dev/null 2>&1 || continue ;;
    esac
    # A PR from a variable, a command substitution, a loop or xargs cannot be looked up before it runs.
    if [ -n "$pr" ] && ! [[ $pr =~ ^[A-Za-z0-9._/-]+$ ]]; then
      deny "gh pr merge $pr on $n names its PR through the shell, so the guard cannot check its landing pass before it runs. Merge one PR per command with its literal number (gh pr merge 12 ...). For an urgent fix, add '# land-urgent: <reason>' to the command."
    fi
    [ -n "$pr" ] || pr=$(git -C "$dir" branch --show-current 2>/dev/null)
    [ -n "$pr" ] || continue
    # Documentation only as the runner's docs_since_green reads it (every file *.md, none under a code
    # directory, supabase/*.md excepted): it answers that without a full run.
    pv=$(timeout 10 gh pr view "$pr" -R "$o/$n" --json headRefOid,headRefName,baseRefName,changedFiles,files 2>/dev/null) || continue
    IFS=$'\t' read -r head ref base kind < <(jq -r '[.headRefOid, .headRefName, .baseRefName,
      (if .changedFiles > 0 and .changedFiles == (.files | length)
          and ([.files[].path | select((test("\\.md$") and (test("^(src|app|pages|public|content|messages|supabase|e2e|apps|mobile)/") | not)
            or test("^supabase/.*\\.md$")) | not)] | length) == 0
       then "docs" else "code" end)] | @tsv' <<<"$pv" 2>/dev/null)
    [ -n "$head" ] && [ "$base" = main ] && [ "$kind" = code ] || continue
    # Only the newest round counts (newest by id, as the runner sorts them): the newest nadavai-ci status
    # is a full pass (ci-wait's FULL_PASS_RE), and a main-tier pending sits between it and the previous
    # final status.
    passed=$(timeout 10 gh api "repos/$o/$n/commits/$head/statuses?per_page=100" 2>/dev/null | jq -r 'if type == "array" then
      [sort_by(.id) | reverse | .[] | select(.context == "nadavai-ci")] as $s | ($s | map(.state != "pending") | index(true)) as $f
      | if $f != 0 then false else ($s[1:] | map(.state != "pending") | index(true) // length) as $g
        | $s[0].state == "success" and (($s[0].description // "") | test("^passed on (NadavAI|MSI) in [0-9]+m( \\[msi:[0-9a-f]{8}\\])?$"))
          and any($s[1:][:$g][]; (.description // "") | contains("at main tier (landing request)")) end
      else empty end' 2>/dev/null)
    [ "$passed" = false ] || behind=$(timeout 10 gh api "repos/$o/$n/compare/main...$head" 2>/dev/null | jq -r '.behind_by // empty' 2>/dev/null)
    if [ "$passed" = false ] || [[ $behind =~ ^[1-9][0-9]*$ ]]; then
      deny "Merging PR $pr would make main run the full suite again: its head ${head:0:7} $([ "$passed" = false ] && echo "has no main-tier landing pass" || echo "is $behind commits behind main"). Rebase $ref on main, push it, run ci-wait $n $ref --land in run_in_background, and merge after it is green (main then answers by tree). If ci-wait --land answered \"documentation only since\", the landing did not run at main tier: push a code commit. If it answered \"same tree as X\" and X passed at main tier, add '# land-urgent: same tree passed at main tier' to the command. For an urgent fix, add '# land-urgent: <reason>' to the command."
    fi
  done
}

if [ "$is_agy" = 1 ]; then
  tool=$(jq -r '.toolCall.name // empty' <<<"$input" 2>/dev/null)
  case "$tool" in
    invoke_subagent)
      has_untagged_fork=$(jq -r '
        [.toolCall.args.Subagents[]? | select(.TypeName == "fork" and ((.Role // "") + " " + (.Prompt // "") | contains("[fork]") | not))] | length
      ' <<<"$input" 2>/dev/null)
      [ "${has_untagged_fork:-0}" -gt 0 ] && deny 'A fork inherits your model and your whole context. Use a named subagent with only the context it needs. If a fork is really what you want, put [fork] in the Role or Prompt.'
      ;;
    run_command)
      cmd=$(jq -r '.toolCall.args.CommandLine // empty' <<<"$input")
      disk_search_guard "$cmd" "$(jq -r '.toolCall.args.Cwd // empty' <<<"$input")"
      strict_guard "$cmd"
      merge_guard "$cmd" "$(jq -r '.toolCall.args.Cwd // empty' <<<"$input")"
      [ "$(jq -r '.toolCall.args.IsDaemon // false' <<<"$input")" = true ] && allow
      found=$(printf '%s\n' "$cmd" | check_sleep)
      if [ -n "$found" ]; then
        deny "${found#*$'\t'} blocks you for ${found%%$'\t'*} s. Run the long command in the background and continue when the completion notice arrives; for NadavAI CI use ci-wait <repo> <sha|branch>."
      fi
      ;;
  esac
  allow
fi

tool=$(jq -r '.tool_name // .toolName // empty' <<<"$input" 2>/dev/null)
case "$tool" in
  Agent)
    [ "$(jq -r '.tool_input.subagent_type // empty' <<<"$input")" = fork ] || allow
    [[ $(jq -r '.tool_input.description // empty' <<<"$input") == *"[fork]"* ]] && allow
    deny 'A fork inherits your model and your whole context (median ~290K tokens per request). Use a named subagent_type with only the context it needs. If a fork is really what you want, put [fork] in the description.'
    ;;
  Bash|run_terminal_command)
    cmd=$(jq -r '.tool_input.command // .toolInput.command // empty' <<<"$input" 2>/dev/null)
    cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
    disk_search_guard "$cmd" "$cwd"
    strict_guard "$cmd" "$cwd"
    merge_guard "$cmd" "$cwd"
    if [ "$tool" = run_terminal_command ]; then
      # Grok moves a command to the background after block_until_ms (0: at once; 30000 when
      # omitted), so a sleep blocks for the shorter of the two.
      block=$(jq -r '.toolInput.block_until_ms // 30000' <<<"$input" 2>/dev/null)
      [[ $block =~ ^[0-9]+$ ]] || block=30000
      [ "$block" -ge 120000 ] || allow
      bg='block_until_ms: 0'
    else
      [ "$(jq -r '.tool_input.run_in_background // false' <<<"$input")" = true ] && allow
      bg='run_in_background: true'
    fi
    found=$(printf '%s\n' "$cmd" | check_sleep)
    if [ -n "$found" ]; then
      secs=${found%%$'\t'*}
      [ "$tool" = run_terminal_command ] && [ $((block / 1000)) -lt "$secs" ] && secs=$((block / 1000))
      deny "${found#*$'\t'} blocks you for $secs s. Run the long command with $bg and continue when the completion notice arrives; for NadavAI CI use ci-wait <repo> <sha|branch> in the background."
    fi
    ;;
esac
allow
