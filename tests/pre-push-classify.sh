#!/usr/bin/env bash
# Replays a week of real main pushes through the pre-push hook as it was (OLD_REV) and as it is
# (the working copy), and checks the new paths against stub CI answers. Fake gh, npm, pnpm, bun,
# npx and trivy record what the hook asked of them, so nothing builds, tests or reaches GitHub;
# each run gets its own HOME, which also keeps the Cloudflare autodeploy (layer 3) inert.
#
#   tests/pre-push-classify.sh            the replay table, then the stub cases
#   REPLAY_REPOS="dir..."  OLD_REV=<rev>  NEW_HOOK=<path>  DAYS=7
#
# Asserted: with no accepted CI pass a push runs exactly what it ran before (typecheck, and full
# or related tests) unless it is documentation only, which runs nothing; no push that ran the
# full suite runs less, unless the old hook ran it only for markdown that misses forceRerunTriggers
# (md_left_out); only a full-scope nadavai-ci pass (directly, or one level through "same
# tree as" / "documentation only since") skips the checks; forceRerunTriggers are read only when
# the reading is certain.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
NEW_HOOK=${NEW_HOOK:-$here/git/hooks/pre-push}
OLD_REV=${OLD_REV:-3231dc1}   # the hook's last revision before the CI-pass and docs-only paths
DAYS=${DAYS:-7}
REPLAY_REPOS=${REPLAY_REPOS:-"$HOME/Desktop/SportChat/sportchat-web $HOME/Desktop/therapy-flow-v2 $HOME/Desktop/cash-next-app $HOME/Desktop/snooker-smart"}
# The hook reads lib/woodpecker-repos.txt under NADAVAI_HOME: the list of the tree under test, not of
# whatever checkout the shell points at. The landing sections below point it at their own fixtures.
export NADAVAI_HOME=$here

t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
git -C "$here" show "$OLD_REV:git/hooks/pre-push" >"$t/old-pre-push" || exit 1
mkdir -p "$t/bin" "$t/home/.local/bin"
# shellcheck disable=SC2016  # expanded by the fakes, not here
for pm in npm pnpm bun; do printf '#!/bin/sh\necho "typecheck $*" >>"$REC"\n' >"$t/bin/$pm"; done
# shellcheck disable=SC2016
printf '#!/bin/sh\necho "$*" >>"$REC"\n' >"$t/bin/npx"
printf '#!/bin/sh\nexit 0\n' >"$t/bin/trivy"; cp "$t/bin/trivy" "$t/home/.local/bin/trivy"
# GH_MODE picks nadavai-ci's answer for the pushed sha ($HEADSHA) and for any other sha.
cat >"$t/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$REC"
q=""; prev=""
for a in "$@"; do [ "$prev" = -q ] && q=$a; prev=$a; done
all="$*"; ref=${all#*commits/}; ref=${ref%%/*}
full="passed on NadavAI in 7m" partial="passed on NadavAI in 5m; outside this branch scope, not run: E2E"
tree="same tree as bbbbbbb, which passed; not rebuilt"
mine=0; [[ $HEADSHA == "$ref"* ]] && mine=1
case $GH_MODE:$mine in
  unavailable:*) echo "error connecting to api.github.com" >&2; exit 1 ;;
  pass:*) s=success d=$full ;;
  msi:*) s=success d="passed on MSI in 6m [msi:0123abcd]" ;;
  partial:*) s=success d=$partial ;;
  msi-partial:*) s=success d="passed on MSI in 6m; outside this branch scope, not run: E2E [msi:0123abcd]" ;;
  changed-tag:*) s=success d="passed on NadavAI in 5m [changed@abc1234]" ;;
  other-tag:*) s=success d="passed on NadavAI in 5m [slot:omarchy]" ;;
  same-tree-full:1|same-tree-partial:1|nested:1) s=success d=$tree ;;
  same-tree-full:0) s=success d=$full ;;
  same-tree-partial:0) s=success d=$partial ;;
  nested:0) s=success d="same tree as ccccccc, which passed; not rebuilt" ;;
  docs-since-full:1) s=success d="documentation only since bbbbbbb, which passed; not rebuilt" ;;
  docs-since-full:0) s=success d=$full ;;
  parent-pass:1) body='{"statuses":[]}'; if [ -n "$q" ]; then jq -r "$q" <<<"$body"; else echo "$body"; fi; exit 0 ;;
  parent-pass:0) s=success d=$full ;;
  fail:*) s=failure d="failed on NadavAI in 4m: test" ;;
  pending:*) s=pending d="running on NadavAI" ;;
  garbage:*) echo "<html>rate limited</html>"; exit 0 ;;
esac
body=$(jq -cn --arg s "$s" --arg d "$d" '{statuses: [{context: "nadavai-ci", state: $s, description: $d}]}')
if [ -n "$q" ]; then jq -r "$q" <<<"$body"; else echo "$body"; fi
GH
chmod +x "$t/bin/"* "$t/home/.local/bin/trivy"

fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1: $2"; fail=1; }

# Runs one hook on one push, then reads what it did: TC (typecheck yes|no), TESTS (full|related|
# none), REL (the files handed to vitest related), DEC (the new hook's logged decision), GHN (status reads).
run() { # hook dir base head url
  : >"$t/rec"; rm -f "$t/home/.cache/nadavai/pre-push.log"
  (cd "$2" && printf 'refs/heads/main %s refs/heads/main %s\n' "$4" "$3" |
    HOME=$t/home PATH=$t/bin:$PATH REC=$t/rec HEADSHA=$4 GH_MODE=${GH_MODE:-unavailable} \
      bash "$1" origin "$5" >"$t/out" 2>&1)
  TC=no; grep -q '^typecheck' "$t/rec" && TC=yes
  TESTS=none
  grep -q '^vitest run' "$t/rec" && TESTS=full
  grep -q '^vitest related' "$t/rec" && TESTS=related
  REL=$(sed -n 's/^vitest related --run --passWithNoTests //p' "$t/rec" | head -1)
  DEC=$(cut -f5 "$t/home/.cache/nadavai/pre-push.log" 2>/dev/null)
  # The landing check's "is this repo on NadavAI CI" read (main's statuses) is not a CI-pass read.
  GHN=$(grep '^gh ' "$t/rec" | grep -vc 'commits/main/statuses')
}

# OLD_REV ran the full suite whenever a file vitest ignores changed in a repo that sets
# forceRerunTriggers; the new hook reads the trigger list and leaves out what misses it. A replay row
# where the new hook runs less is right only for that reason: the old hook named a markdown file as
# its reason, and every file the new hook left out of vitest related is markdown.
md_left_out() { # dir old new old-reason related-files
  local f
  [ "${2//0/}" != "" ] && [[ $4 =~ ^full\ test\ suite:\ [^\ ]+\.md\ changed\ and\ .*\ sets\ forceRerunTriggers ]] || return 1
  while IFS= read -r f; do
    case " $5 " in *" $f "*) continue ;; esac
    case "$f" in *.md) ;; *) return 1 ;; esac
  done < <(git -C "$1" -c core.quotePath=false diff --name-only --no-renames "$2" "$3")
}

echo "=== replay: origin/main moves of the last $DAYS days, old hook ($OLD_REV) vs new ==="
printf '%-15s %-15s %-16s %-16s %-30s %s\n' repo push old new new-decision "with a CI pass"
since=$(date -d "$DAYS days ago" +%s)
pushes=0 docs=0 skipped=0
for dir in $REPLAY_REPOS; do
  [ -d "$dir" ] || { echo "skip $dir: not here"; continue; }
  [ -f "$dir/.cf-deploy" ] && { echo "skip $dir: it auto-deploys"; continue; }
  url=$(git -C "$dir" remote get-url origin)
  mapfile -t log < <(git -C "$dir" reflog show origin/main --format='%H %gd' --date=unix)
  for ((i = 0; i < ${#log[@]}; i++)); do
    new=${log[i]%% *}; when=${log[i]##*@\{}; when=${when%\}}
    [ "$when" -ge "$since" ] || break
    old=0000000000000000000000000000000000000000
    [ $((i + 1)) -lt ${#log[@]} ] && old=${log[i+1]%% *}
    pushes=$((pushes + 1))
    # These URLs name Woodpecker repos, so the new hook runs its landing check; this gh answers an
    # object, never a status list, and the hook takes that as "GitHub unreadable" and lets the push
    # through. The replay rides on that branch: it compares Layer 2, not the landing.
    run "$t/old-pre-push" "$dir" "$old" "$new" "$url"; otc=$TC otests=$TESTS
    oreason=$(grep -o 'full test suite: .*' "$t/out" | head -1)
    GH_MODE=unavailable run "$NEW_HOOK" "$dir" "$old" "$new" "$url"; ntc=$TC ntests=$TESTS ndec=$DEC nrel=$REL
    nwpdocs=0; grep -q 'pre-push \[landing\]: documentation only since main' "$t/out" && nwpdocs=1
    GH_MODE=pass run "$NEW_HOOK" "$dir" "$old" "$new" "$url"; pdec=$DEC
    printf '%-15s %-15s %-16s %-16s %-30s %s\n' "${dir##*/}" "${old:0:6}..${new:0:6}" "tc=$otc/$otests" \
      "tc=$ntc/$ntests" "${ndec:0:30}" "$pdec"
    [ "$pdec" = ci-pass-skip ] && skipped=$((skipped + 1))
    if [ "$ndec" = docs-only ]; then
      docs=$((docs + 1))
      [ "$ntc$ntests" = nonone ] || bad "${dir##*/} ${new:0:7}" "documentation only, yet ran tc=$ntc tests=$ntests"
      if [ "$otests" = full ]; then
        if md_left_out "$dir" "$old" "$new" "$oreason" ""; then
          ok "${dir##*/} ${new:0:7}: documentation only now; the old hook ran the full suite only for markdown that misses forceRerunTriggers"
        else bad "${dir##*/} ${new:0:7}" "documentation only now, the full suite before ($oreason)"; fi
      fi
    elif [ "$ndec" = ci-pass-skip ] && [ "$nwpdocs" = 1 ]; then
      # With GitHub unreadable the only skip left is the Woodpecker landing's "documentation only since
      # main" (WP_LANDED): main is a tested tree (ci-policy rule 7) and only markdown changed on top.
      if [ "${old//0/}" != "" ] && ! git -C "$dir" -c core.quotePath=false diff --name-only --no-renames "$old" "$new" | grep -qv '\.md$'; then
        ok "${dir##*/} ${new:0:7}: no local checks now; documentation only since main, a Woodpecker-landed tree"
      else bad "${dir##*/} ${new:0:7}" "skipped as documentation only since main, yet a file is not markdown"; fi
    elif [ "$otc/$otests" != "$ntc/$ntests" ]; then
      if [ "$otc/$otests/$ntc/$ntests" = yes/full/yes/related ] && md_left_out "$dir" "$old" "$new" "$oreason" "$nrel"; then
        ok "${dir##*/} ${new:0:7}: related now; the old hook ran the full suite only for markdown that misses forceRerunTriggers"
      else bad "${dir##*/} ${new:0:7}" "ran tc=$ntc tests=$ntests, before tc=$otc tests=$otests"; fi
    fi
  done
done
echo "$pushes pushes: $docs documentation only, $skipped would skip on a full CI pass"
# The count moves with the window, so nothing asserts it beyond "at least one".
[ "$pushes" -gt 0 ] || bad replay "no push to replay"

# A throwaway repo on vitest with a typecheck script, a github remote URL, and one code commit.
synth() { # dir
  mkdir -p "$1/src"
  git -C "$1" init -q .
  git -C "$1" config core.hooksPath /dev/null
  git -C "$1" config user.email t@t.t; git -C "$1" config user.name t
  printf '{"scripts":{"typecheck":"tsc"},"devDependencies":{"vitest":"4.0.0"}}' >"$1/package.json"
  echo 'export const a = 1' >"$1/src/a.ts"
  git -C "$1" add -A; git -C "$1" commit -qm one
}
commit() { # dir path content
  mkdir -p "$(dirname "$1/$2")"; printf '%s\n' "$3" >"$1/$2"
  git -C "$1" add -A; git -C "$1" commit -qm "change $2"
}
URL=git@github.com:Nadav011/synth.git

echo "=== nadavai-ci answers (stub gh) on a code push ==="
d=$t/ci; synth "$d"; base=$(git -C "$d" rev-parse HEAD)
commit "$d" src/a.ts 'export const a = 2'; head=$(git -C "$d" rev-parse HEAD)
expect() { # mode decision tc tests max-gh-reads
  GH_MODE=$1 run "$NEW_HOOK" "$d" "$base" "$head" "$URL"
  if [ "$DEC" = "$2" ] && [ "$TC/$TESTS" = "$3/$4" ] && [ "$GHN" -le "$5" ]; then
    ok "$1: $2, tc=$TC tests=$TESTS, $GHN status read(s)"
  else
    bad "$1" "expected $2 tc=$3 tests=$4 (<= $5 reads), got $DEC tc=$TC tests=$TESTS ($GHN reads): $(tail -2 "$t/out")"
  fi
}
expect unavailable       related      yes related 1
expect garbage           related      yes related 1
expect pass              ci-pass-skip no  none    1
expect msi               ci-pass-skip no  none    1
expect partial           related      yes related 1
expect msi-partial       related      yes related 1
expect changed-tag       related      yes related 1
expect other-tag         related      yes related 1
expect same-tree-full    ci-pass-skip no  none    2
expect same-tree-partial related      yes related 2
expect docs-since-full   ci-pass-skip no  none    2
expect nested            related      yes related 2
expect fail              related      yes related 1
expect pending           related      yes related 1
# A record commit R (STATUS.md) on top of a head H that passed in full, pushed straight to main:
# R has no status of its own; its first parent H does (v4 coordinator, 2026-10-27).
hsha=$head
commit "$d" STATUS.md 'batch 11b recorded'; rsha=$(git -C "$d" rev-parse HEAD)
GH_MODE=parent-pass run "$NEW_HOOK" "$d" "$base" "$rsha" "$URL"
if [ "$DEC" = ci-pass-skip ] && [ "$TC/$TESTS" = no/none ] && [ "$GHN" -le 2 ] && grep -q "documentation only since ${hsha:0:7}" "$t/out"; then
  ok "a docs commit on a fully passed head skips the checks ($GHN reads)"
else bad "docs commit on a passed head" "got $DEC tc=$TC tests=$TESTS ($GHN reads): $(tail -2 "$t/out")"; fi
commit "$d" src/b.ts 'export const b = 1'; csha=$(git -C "$d" rev-parse HEAD)
GH_MODE=parent-pass run "$NEW_HOOK" "$d" "$base" "$csha" "$URL"
if [ "$DEC" != ci-pass-skip ] && [ "$TC" = yes ]; then ok "a code commit on top of it still runs the checks"
else bad "code commit on a passed head" "got $DEC tc=$TC"; fi
git -C "$d" reset -q --hard "$hsha"
GH_MODE=pass run "$NEW_HOOK" "$d" "$base" "$head" ""
if [ "$GHN" = 0 ] && [ "$TC" = yes ]; then ok "no GitHub remote: no read, checks as before"
else bad "no GitHub remote" "$GHN reads, tc=$TC"; fi
GH_MODE=pass run "$NEW_HOOK" "$d" "$base" "$head" "$URL"
line=$(cat "$t/home/.cache/nadavai/pre-push.log")
IFS=$'\t' read -r -a f <<<"$line"
if [ ${#f[@]} = 12 ] && [ "${f[1]}" = Nadav011/synth ] && [ "${f[2]}" = main ] && [ "${f[3]}" = "${head:0:7}" ] &&
   [[ ${f[0]} == 20* ]] && [[ ${f[5]} == typecheck=- ]] && [[ ${f[7]} =~ ^trivy=[0-9]+$ ]] &&
   [[ ${f[8]} =~ ^total=[0-9]+\.[0-9]$ ]] && [[ ${f[9]} =~ ^gh=[0-9]+\.[0-9]$ ]] && [[ ${f[10]} =~ ^scan=(ok|block|fail|skip|missing|-)$ ]] &&
   [[ ${f[11]} =~ ^landing=(-|ok|refused|unreadable|skipped|urgent:.*)$ ]]; then
  ok "the log line: $line"
else
  bad "log line" "$line"
fi
printf 'refs/heads/feat %s refs/heads/feat %s\n' "$head" "$base" |
  (cd "$d" && HOME=$t/home PATH=$t/bin:$PATH REC=$t/rec GH_MODE=pass HEADSHA=$head bash "$NEW_HOOK" origin "$URL" >/dev/null 2>&1)
if [ "$(cut -f5 "$t/home/.cache/nadavai/pre-push.log" | tail -1)" = branch ]; then ok "a branch push logs as branch"
else bad "branch push log" "$(tail -1 "$t/home/.cache/nadavai/pre-push.log")"; fi

echo "=== documentation only, and forceRerunTriggers ==="
docs_case() { # name config-content changed-file expected-decision [gh-mode]
  local d=$t/docs-$((++nd))
  synth "$d"
  [ -n "$2" ] && { printf '%s\n' "$2" >"$d/vitest.config.ts"; git -C "$d" add -A; git -C "$d" commit -qm config; }
  local base; base=$(git -C "$d" rev-parse HEAD)
  commit "$d" "$3" docs
  GH_MODE=${5:-unavailable} run "$NEW_HOOK" "$d" "$base" "$(git -C "$d" rev-parse HEAD)" "$URL"
  if [ "${DEC%%:*}" = "$4" ]; then
    case $4 in
      docs-only) if [ "$TC/$TESTS/$GHN" = no/none/0 ]; then ok "$1"; else bad "$1" "docs-only, yet tc=$TC tests=$TESTS gh=$GHN"; fi ;;
      full) if [ "$TESTS" = full ]; then ok "$1"; else bad "$1" "full decided, tests=$TESTS"; fi ;;
      related) if [ "$TC" = yes ]; then ok "$1"; else bad "$1" "no typecheck"; fi ;;
    esac
  else
    bad "$1" "expected $4, got $DEC"
  fi
}
nd=0
# GitHub unreachable unless named: these read the classification, which a CI pass would hide.
docs_case "README only with a CI pass there: documentation only, no CI read" "" README.md docs-only pass
docs_case ".github only: documentation only"                       "" .github/workflows/ci.yml docs-only
docs_case "a script under .github/: not documentation, typecheck runs" "" .github/scripts/check.ts related
for spec in \
  "triggers match the doc: full|export default { test: { forceRerunTriggers: ['**/*.md'] } }|README.md|full" \
  "defaults spread plus fixtures miss README: documentation only|export default { test: { forceRerunTriggers: [...configDefaults.forceRerunTriggers, '**/fixtures/**'] } }|README.md|docs-only" \
  "a docs/ glob misses the root README: documentation only|export default { test: { forceRerunTriggers: [\"**/docs/**\"] } }|README.md|docs-only" \
  "a docs/ glob matches docs/a.md: full|export default { test: { forceRerunTriggers: [\"**/docs/**\"] } }|docs/a.md|full" \
  "a brace glob matches: full|export default { test: { forceRerunTriggers: ['**/{README,CHANGELOG}.md'] } }|README.md|full" \
  "triggers from a variable: full|const t = ['x']; export default { test: { forceRerunTriggers: t } }|README.md|full" \
  "a comment in the list: full|export default { test: { forceRerunTriggers: [ // none\n] } }|README.md|full" \
  "a negated glob: full|export default { test: { forceRerunTriggers: ['!**/*.md'] } }|README.md|full"; do
  IFS='|' read -r name cfg file want <<<"$spec"
  docs_case "$name" "$(printf '%b' "$cfg")" "$file" "$want"
done

echo "=== landing: a push to main of a repo on NadavAI CI (not on Woodpecker) needs a main-tier landing pass ==="
# The nadavai-ci path of the hook, for a repo that lib/woodpecker-repos.txt does not list (an empty
# list here: sportchat-web and therapy-flow-v2 stay on it through the hook's own nadavai-ci names).
# The Woodpecker path is the next section. This gh answers commits/<sha>/statuses with a list, by sha: $LAND_MAIN a main-tier landing round
# (a "running on NadavAI at main tier (landing request)" pending, then the pass), $LAND_FULL a full
# pass with no landing pending (main's own run), $LAND_BRANCH a branch-tier pass, $LAND_TREE
# "<sha>:<x>" pairs answered "same tree as <x>", $LAND_LIVE a live nadavai-deploy; nothing else.
# LAND_GH=down fails every read, LAND_DOWN_AFTER=n every read after the n-th. Other reads
# (ci_full_pass) answer nothing, so the typecheck runs, as with no CI pass.
mkdir -p "$t/lbin"; cp "$t/bin/npm" "$t/bin/npx" "$t/bin/trivy" "$t/lbin/"
cat >"$t/lbin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$REC"
[ "${LAND_GH:-}" = down ] && { echo "error connecting to api.github.com" >&2; exit 1; }
if [ -n "${LAND_DOWN_AFTER:-}" ]; then
  n=$(grep -c '/statuses' "$REC"); [ "$n" -gt "$LAND_DOWN_AFTER" ] && { echo "error connecting" >&2; exit 1; }
fi
all="$*"; case $all in *"/statuses"*) ;; *) exit 0 ;; esac
ref=${all#*commits/}; ref=${ref%%/*}
st() { printf '{"id":%s,"context":"%s","state":"%s","description":"%s"}' "$@"; }
out=()
case " ${LAND_LIVE:-} " in *" $ref "*) out+=("$(st 9 nadavai-deploy success 'live, health check passed (3m)')") ;; esac
case " ${LAND_MAIN:-} " in *" $ref "*) out+=("$(st 1 nadavai-ci pending 'running on NadavAI at main tier (landing request)')" "$(st 2 nadavai-ci success 'passed on NadavAI in 9m')") ;; esac
case " ${LAND_FULL:-} " in *" $ref "*) out+=("$(st 1 nadavai-ci pending 'running on NadavAI')" "$(st 2 nadavai-ci success 'passed on NadavAI in 9m')") ;; esac
case " ${LAND_BRANCH:-} " in *" $ref "*) out+=("$(st 1 nadavai-ci pending 'running on NadavAI')" "$(st 2 nadavai-ci success 'passed on NadavAI in 9m')") ;; esac
for pr in ${LAND_TREE:-}; do [ "${pr%%:*}" = "$ref" ] && out+=("$(st 2 nadavai-ci success "same tree as ${pr#*:}, which passed; not rebuilt")"); done
(IFS=,; echo "[${out[*]}]")
GH
chmod +x "$t/lbin/gh"
LURL=git@github.com:Nadav011/sportchat-web.git
mkdir -p "$t/nowp/lib"; echo '# no repo on Woodpecker' >"$t/nowp/lib/woodpecker-repos.txt"
# LBIN: the stub gh's folder, LNH: NADAVAI_HOME (its woodpecker-repos.txt), LREFUSED: the refusal text.
LBIN=$t/lbin LNH=$t/nowp LREFUSED='no main-tier landing pass'
land() { # name want(ok|refused) base head [env...]; LREFS: extra ref lines pushed after main
  local name=$1 want=$2 base=$3 head=$4 rc; shift 4
  : >"$t/rec"; rm -f "$t/home/.cache/nadavai/pre-push.log"
  (cd "$ld" && { printf 'refs/heads/main %s refs/heads/main %s\n' "$head" "$base"; [ -n "${LREFS:-}" ] && printf '%s\n' "$LREFS"; } |
    env HOME="$t/home" PATH="$LBIN:$PATH" REC="$t/rec" NADAVAI_HOME="$LNH" "$@" bash "$NEW_HOOK" origin "$LURL" >"$t/out" 2>&1); rc=$?
  if { [ "$want" = ok ] && [ "$rc" = 0 ]; } || { [ "$want" = refused ] && [ "$rc" = 1 ] && grep -q "pre-push \[landing\]: .* $LREFUSED" "$t/out"; }; then
    ok "landing: $name"
  else bad "landing: $name" "exit $rc: $(grep 'landing' "$t/out" | head -2)"; fi
}
ld=$t/land; synth "$ld"; m0=$(git -C "$ld" rev-parse HEAD)
commit "$ld" src/a.ts 'export const a = 3'; c1=$(git -C "$ld" rev-parse HEAD)
land "a code head with no CI answer is refused" refused "$m0" "$c1"
grep -q 'landing=refused' "$t/home/.cache/nadavai/pre-push.log" && ok "landing: ... and the log says landing=refused" || bad "landing: log" "$(cat "$t/home/.cache/nadavai/pre-push.log")"
land "a code head that passed only at branch tier is refused" refused "$m0" "$c1" LAND_BRANCH="$c1"
land "a code head that passed a main-tier landing goes" ok "$m0" "$c1" LAND_MAIN="$c1"
grep -q "passed at main tier" "$t/out" && ok "landing: ... and says why" || bad "landing: why" "$(grep landing "$t/out")"
LREFS="refs/tags/v1 $c1 refs/tags/v1 0000000000000000000000000000000000000000" \
  land "main pushed with a tag after it is still checked" refused "$m0" "$c1"
commit "$ld" STATUS.md 'record'; d1=$(git -C "$ld" rev-parse HEAD)
land "a record commit on a main-tier landing head goes (sportchat-web deploys by hand)" ok "$m0" "$d1" LAND_MAIN="$c1"
land "a record commit on a branch-tier pass is refused" refused "$m0" "$d1" LAND_BRANCH="$c1"
LURL=git@github.com:Nadav011/therapy-flow-v2.git
land "an auto-deploy repo: a record commit on a landing head that is not live is refused" refused "$m0" "$d1" LAND_MAIN="$c1"
land "an auto-deploy repo: ... once it is live it goes" ok "$m0" "$d1" LAND_MAIN="$c1" LAND_LIVE="$c1"
LURL=git@github.com:Nadav011/sportchat-web.git
commit "$ld" src/b.ts 'export const b = 1'; c2=$(git -C "$ld" rev-parse HEAD)
land "a code commit on a main-tier landing head is refused" refused "$m0" "$c2" LAND_MAIN="$c1"
mt=$(git -C "$ld" commit-tree "$c1^{tree}" -p "$m0" -p "$c1" -m "merge $c1")
land "a merge with the tree of its main-tier parent goes" ok "$m0" "$mt" LAND_MAIN="$c1"
am=$(git -C "$ld" commit-tree "$c1^{tree}" -p "$m0" -m "reworded $c1")
land "a reworded landing head whose landing answered same tree as a main-tier pass goes" ok "$m0" "$am" LAND_TREE="$am:${c1:0:7}" LAND_MAIN="$c1"
rv=$(git -C "$ld" commit-tree "$m0^{tree}" -p "$c2" -m "revert to m0")
land "a revert to the tree of a commit main passed goes" ok "$c2" "$rv" LAND_FULL="$m0"
land "NADAVAI_LAND_URGENT lets a fix through" ok "$m0" "$c2" NADAVAI_LAND_URGENT="prod down"
grep -q 'landing=urgent:prod down' "$t/home/.cache/nadavai/pre-push.log" && ok "landing: ... and the log keeps the reason" || bad "landing: urgent log" "$(cat "$t/home/.cache/nadavai/pre-push.log")"
land "GitHub unreadable lets the push through" ok "$m0" "$c2" LAND_GH=down
commit "$ld" docs/notes.md 'notes'; d2=$(git -C "$ld" rev-parse HEAD)
land "documentation only on top of a main head main passed goes" ok "$c2" "$d2" LAND_FULL="$c2"
land "documentation only on top of a main head with no answer is refused" refused "$c2" "$d2"
land "GitHub unreadable midway (the base's read) lets the push through" ok "$c2" "$d2" LAND_DOWN_AFTER=1
commit "$ld" 'docs/סיכום.md' 'hebrew'; d3=$(git -C "$ld" rev-parse HEAD)
land "a Hebrew documentation path is documentation" ok "$c2" "$d3" LAND_FULL="$c2"
# forceRerunTriggers from a function call (sportchat-web's forceRerunTriggersAt): classify_push cannot
# read it, yet a documentation push on top of a main-tier landing runs no local checks.
commit "$ld" vitest.config.ts 'export default { test: { forceRerunTriggers: forceRerunTriggersAt(process.cwd()) } }'; c4=$(git -C "$ld" rev-parse HEAD)
commit "$ld" STATUS.md 'train record'; d4=$(git -C "$ld" rev-parse HEAD)
land "a docs push on a landing with unreadable forceRerunTriggers goes" ok "$c4" "$d4" LAND_MAIN="$c4"
if ! grep -q '^typecheck' "$t/rec" && ! grep -qE '^vitest (run|related)' "$t/rec"; then ok "landing: ... and runs no local typecheck or tests"
else bad "landing: docs local checks" "$(grep -E '^typecheck|^vitest' "$t/rec" | head -2)"; fi

echo "=== landing on Woodpecker: main takes a tree whose landing has every ci/woodpecker/pr/* status green ==="
# rules/ci-policy.md rule 6: a direct push to main needs a commit with the same tree and a green
# landing, or documentation only since main. The hook looks for the tree in the pushed commit, a
# merge's second parent and five first parents. A repo is on Woodpecker when $LNH/lib/woodpecker-repos.txt lists it (any case, a
# trailing comment ignored) and its owner is Nadav011. This gh answers commits/<sha>/statuses from WP:
# entries "<sha>:<context>=<state>,..." oldest first (ids rise in that order; the list comes back
# newest first, as GitHub sends it). pr/<x> is ci/woodpecker/pr/<x>, push/<x> ci/woodpecker/push/<x>,
# sec nadavai-security; any other name is the context itself. WP_GH=down fails every read.
mkdir -p "$t/wbin" "$t/wp/lib"; cp "$t/bin/npm" "$t/bin/npx" "$t/bin/trivy" "$t/wbin/"
printf '# fixture\nSportChat-Web   # cut over\ntherapy-flow-v2\n' >"$t/wp/lib/woodpecker-repos.txt"
cat >"$t/wbin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$REC"
[ "${WP_GH:-}" = down ] && { echo "error connecting to api.github.com" >&2; exit 1; }
all="$*"; case $all in *"/statuses"*) ;; *) exit 0 ;; esac
ref=${all#*commits/}; ref=${ref%%/*}
out=() id=0
for e in ${WP:-}; do
  [[ ${e%%:*} == "$ref"* ]] || continue
  IFS=, read -r -a sts <<<"${e#*:}"
  for s in "${sts[@]}"; do
    c=${s%=*} id=$((id + 1))
    case $c in sec) c=nadavai-security ;; pr/*|push/*) c=ci/woodpecker/$c ;; esac
    out=("$(printf '{"id":%s,"context":"%s","state":"%s","description":"x","created_at":"2026-11-10T10:00:00Z"}' "$id" "$c" "${s##*=}")" "${out[@]}")
  done
done
(IFS=,; echo "[${out[*]}]")
GH
chmod +x "$t/wbin/gh"
LBIN=$t/wbin LNH=$t/wp LREFUSED='no green Woodpecker landing' LURL=git@github.com:Nadav011/sportchat-web.git
ld=$t/wland; synth "$ld"; m0=$(git -C "$ld" rev-parse HEAD)
commit "$ld" src/a.ts 'export const a = 3'; c1=$(git -C "$ld" rev-parse HEAD)
G="pr/landing=success,sec=success"
# After a push the landing let through: Layer 1 (trivy) still ran and logged its verdict, the push
# reached the end of the hook, the logged decision is <decision>, and the local typecheck and tests
# ran (yes) or not (no). Catches a hook that stops early after the landing check.
wafter() { # name decision locals(yes|no)
  local log scan locals=no
  log=$(cat "$t/home/.cache/nadavai/pre-push.log" 2>/dev/null); scan=${log##*$'\tscan='}; scan=${scan%%$'\t'*}
  grep -qE '^typecheck|^vitest (run|related)' "$t/rec" && locals=yes
  if grep -q 'pre-push \[security\]' "$t/out" && grep -q 'Pushing to main' "$t/out" && [[ $scan =~ ^(ok|block|fail|skip)$ ]] &&
     [ "$(cut -f5 <<<"$log")" = "$2" ] && [ "$locals" = "$3" ]; then
    ok "landing: ... $1: trivy ran (scan=$scan), decision $2, local checks $3"
  else bad "landing: after $1" "scan=$scan decision=$(cut -f5 <<<"$log") local checks=$locals: $(grep -E 'security|skipped|Pushing' "$t/out" | head -3)"; fi
}
land "a code head with no status is refused" refused "$m0" "$c1"
wlog=$(cat "$t/home/.cache/nadavai/pre-push.log" 2>/dev/null)
[[ $wlog == *$'\tlanding-refused\t'*$'\tlanding=refused' ]] && ok "landing: ... and the log says landing-refused, landing=refused" || bad "landing: wp log" "$wlog"
land "a code head whose landing is green goes" ok "$m0" "$c1" WP="$c1:$G"
grep -q "the tree of ${c1:0:7} passed its Woodpecker landing" "$t/out" && ok "landing: ... and says why" || bad "landing: wp why" "$(grep landing "$t/out")"
grep -q $'\tlanding=ok$' "$t/home/.cache/nadavai/pre-push.log" && ok "landing: ... and the log says landing=ok" || bad "landing: wp ok log" "$(cat "$t/home/.cache/nadavai/pre-push.log")"
wafter "a green landing" ci-pass-skip no
land "a pending landing is refused" refused "$m0" "$c1" WP="$c1:pr/landing=pending,sec=success"
land "a red landing is refused" refused "$m0" "$c1" WP="$c1:pr/landing=failure,sec=success"
land "two workflows, one red, is refused" refused "$m0" "$c1" WP="$c1:pr/web=success,pr/backend=failure,sec=success"
land "two workflows, both green, goes" ok "$m0" "$c1" WP="$c1:pr/web=success,pr/backend=success,sec=success"
land "the newest status of a workflow counts: red, then green, goes" ok "$m0" "$c1" WP="$c1:pr/landing=failure,pr/landing=success,sec=success"
land "the newest status of a workflow counts: green, then red, is refused" refused "$m0" "$c1" WP="$c1:pr/landing=success,pr/landing=failure,sec=success"
land "only a push-event run and a nadavai-ci pass are no landing: refused" refused "$m0" "$c1" WP="$c1:push/landing=success,nadavai-ci=success,sec=success"
# nadavai-security on the landed commit: failure or error refuses; missing or pending goes with a
# warning and landing=ok-nosec (the scanner has been down for days at a time).
LREFUSED='security scan (nadavai-security) of [0-9a-f]* is failure' \
  land "a green landing with a red security scan is refused" refused "$m0" "$c1" WP="$c1:pr/landing=success,sec=failure"
LREFUSED='security scan (nadavai-security) of [0-9a-f]* is error' \
  land "a green landing with a security scan in error is refused" refused "$m0" "$c1" WP="$c1:pr/landing=success,sec=error"
land "the newest security status counts: red, then green, goes" ok "$m0" "$c1" WP="$c1:pr/landing=success,sec=failure,sec=success"
LREFUSED='security scan (nadavai-security) of [0-9a-f]* is failure' \
  land "the newest security status counts: green, then red, is refused" refused "$m0" "$c1" WP="$c1:pr/landing=success,sec=success,sec=failure"
for sec in none pending; do
  wp="$c1:pr/landing=success"; [ "$sec" = none ] || wp="$wp,sec=$sec"
  land "a green landing with the security scan $sec goes with a warning" ok "$m0" "$c1" WP="$wp"
  if grep -q $'\tlanding=ok-nosec$' "$t/home/.cache/nadavai/pre-push.log" && grep -q "security scan (nadavai-security) is $sec" "$t/out"; then
    ok "landing: ... and logs landing=ok-nosec"
  else bad "landing: nosec $sec" "$(grep landing "$t/out" | head -2)"; fi
  wafter "a landing with the scan $sec" ci-pass-skip no
done
LREFS="refs/tags/v1 $c1 refs/tags/v1 0000000000000000000000000000000000000000" \
  land "main pushed with a tag after it is still checked" refused "$m0" "$c1"
# Commits with the landing head's tree on top of it (a record commit with no change, a squash
# re-commit): the tree is found in the five first parents, not further.
es=("$c1"); for i in 1 2 3 4 5 6; do es+=("$(git -C "$ld" commit-tree "$c1^{tree}" -p "${es[i-1]}" -m "same tree $i")"); done
land "a same-tree commit on a green landing head goes" ok "$m0" "${es[1]}" WP="$c1:$G"
land "five same-tree commits up, the landing head is still found" ok "$m0" "${es[5]}" WP="$c1:$G"
land "six same-tree commits up, it is not looked for: refused" refused "$m0" "${es[6]}" WP="$c1:$G"
am=$(git -C "$ld" commit-tree "$c1^{tree}" -p "$m0" -m "reworded $c1")
land "a reworded landing head off its history has no landing of its own: refused" refused "$m0" "$am" WP="$c1:$G"
land "... and goes once that commit landed itself" ok "$m0" "$am" WP="$am:$G"
mt=$(git -C "$ld" commit-tree "$c1^{tree}" -p "$m0" -p "$c1" -m "merge $c1")
land "a merge with the tree of its green second parent goes" ok "$m0" "$mt" WP="$c1:$G"
mx=$(git -C "$ld" commit-tree "$(git -C "$ld" mktree </dev/null)" -p "$m0" -p "$c1" -m "merge $c1, another tree")
land "a merge whose tree is not its green second parent's is refused" refused "$m0" "$mx" WP="$c1:$G"
commit "$ld" STATUS.md 'record'; d1=$(git -C "$ld" rev-parse HEAD)
land "a record commit on a green landing head, main still before it, is refused" refused "$m0" "$d1" WP="$c1:$G"
land "the same record commit once main has the landing head: documentation only since main goes" ok "$c1" "$d1"
grep -q 'documentation only since main' "$t/out" && ok "landing: ... and says why" || bad "landing: wp docs why" "$(grep landing "$t/out")"
wafter "documentation only since main" docs-only no
git -C "$ld" reset -q --hard "$c1"
commit "$ld" src/b.ts 'export const b = 1'; c2=$(git -C "$ld" rev-parse HEAD)
land "a code commit on a green landing head is refused" refused "$c1" "$c2" WP="$c1:$G"
wdocs() { # name want path
  git -C "$ld" reset -q --hard "$c2"; commit "$ld" "$3" docs
  land "$1" "$2" "$c2" "$(git -C "$ld" rev-parse HEAD)"
}
wdocs "documentation only since main goes, with no status read" ok docs/notes.md
grep -q '/statuses' "$t/rec" && bad "landing: wp docs reads" "$(grep '/statuses' "$t/rec" | head -1)" || ok "landing: ... and reads no landing status"
wdocs "a Hebrew documentation path is documentation" ok 'docs/סיכום.md'
wdocs "supabase/*.md is documentation" ok supabase/README.md
wdocs "markdown under a code folder is not documentation: refused" refused src/README.md
wdocs "a text file is not documentation: refused" refused docs/notes.txt
land "NADAVAI_LAND_URGENT lets a fix through" ok "$m0" "$c2" NADAVAI_LAND_URGENT="prod down"
grep -q 'landing=urgent:prod down' "$t/home/.cache/nadavai/pre-push.log" && ok "landing: ... and the log keeps the reason" || bad "landing: wp urgent log" "$(cat "$t/home/.cache/nadavai/pre-push.log")"
wafter "an urgent push (no landing, so the local checks run)" related yes
land "GitHub unreadable lets the push through" ok "$m0" "$c2" WP_GH=down
grep -q 'landing=unreadable' "$t/home/.cache/nadavai/pre-push.log" && ok "landing: ... and the log says landing=unreadable" || bad "landing: wp unreadable log" "$(cat "$t/home/.cache/nadavai/pre-push.log")"
wafter "an unread landing (so the local checks run)" related yes
LURL=git@github.com:Nadav011/therapy-flow-v2.git
land "a second listed repo is checked too" refused "$m0" "$c2"
LURL=git@github.com:Nadav011/other-app.git
land "a repo the list does not name is not checked here" ok "$m0" "$c2"
LURL=git@github.com:someone/sportchat-web.git
land "a listed name under another owner is not checked here" ok "$m0" "$c2"
LURL=git@github.com:Nadav011/sportchat-web.git
# A documentation push with forceRerunTriggers classify_push cannot read (a function call): the
# classifier alone would run the full suite, but the tree landed, so no local checks (as cce881a on
# the nadavai-ci path).
commit "$ld" vitest.config.ts 'export default { test: { forceRerunTriggers: forceRerunTriggersAt(process.cwd()) } }'; c4=$(git -C "$ld" rev-parse HEAD)
commit "$ld" STATUS.md 'train record'; d4=$(git -C "$ld" rev-parse HEAD)
land "a docs push with unreadable forceRerunTriggers goes" ok "$c4" "$d4"
wafter "a docs push with unreadable forceRerunTriggers" ci-pass-skip no

echo "----"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
