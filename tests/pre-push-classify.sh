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
# full suite runs less; only a full-scope nadavai-ci pass (directly, or one level through "same
# tree as" / "documentation only since") skips the checks; forceRerunTriggers are read only when
# the reading is certain.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
NEW_HOOK=${NEW_HOOK:-$here/git/hooks/pre-push}
OLD_REV=${OLD_REV:-3231dc1}   # the hook's last revision before the CI-pass and docs-only paths
DAYS=${DAYS:-7}
REPLAY_REPOS=${REPLAY_REPOS:-"$HOME/Desktop/SportChat/sportchat-web $HOME/Desktop/therapy-flow-v2 $HOME/Desktop/cash-next-app $HOME/Desktop/snooker-smart"}

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
# none), DEC (the new hook's logged decision), GHN (status reads).
run() { # hook dir base head url
  : >"$t/rec"; rm -f "$t/home/.cache/nadavai/pre-push.log"
  (cd "$2" && printf 'refs/heads/main %s refs/heads/main %s\n' "$4" "$3" |
    HOME=$t/home PATH=$t/bin:$PATH REC=$t/rec HEADSHA=$4 GH_MODE=${GH_MODE:-unavailable} \
      bash "$1" origin "$5" >"$t/out" 2>&1)
  TC=no; grep -q '^typecheck' "$t/rec" && TC=yes
  TESTS=none
  grep -q '^vitest run' "$t/rec" && TESTS=full
  grep -q '^vitest related' "$t/rec" && TESTS=related
  DEC=$(cut -f5 "$t/home/.cache/nadavai/pre-push.log" 2>/dev/null)
  # The landing check's "is this repo on NadavAI CI" read (main's statuses) is not a CI-pass read.
  GHN=$(grep '^gh ' "$t/rec" | grep -vc 'commits/main/statuses')
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
    run "$t/old-pre-push" "$dir" "$old" "$new" "$url"; otc=$TC otests=$TESTS
    GH_MODE=unavailable run "$NEW_HOOK" "$dir" "$old" "$new" "$url"; ntc=$TC ntests=$TESTS ndec=$DEC
    GH_MODE=pass run "$NEW_HOOK" "$dir" "$old" "$new" "$url"; pdec=$DEC
    printf '%-15s %-15s %-16s %-16s %-30s %s\n' "${dir##*/}" "${old:0:6}..${new:0:6}" "tc=$otc/$otests" \
      "tc=$ntc/$ntests" "${ndec:0:30}" "$pdec"
    [ "$pdec" = ci-pass-skip ] && skipped=$((skipped + 1))
    if [ "$ndec" = docs-only ]; then
      docs=$((docs + 1))
      [ "$ntc$ntests" = nonone ] || bad "${dir##*/} ${new:0:7}" "documentation only, yet ran tc=$ntc tests=$ntests"
      [ "$otests" != full ] || bad "${dir##*/} ${new:0:7}" "documentation only now, the full suite before"
    elif [ "$otc/$otests" != "$ntc/$ntests" ]; then
      bad "${dir##*/} ${new:0:7}" "ran tc=$ntc tests=$ntests, before tc=$otc tests=$otests"
    fi
  done
done
echo "$pushes pushes: $docs documentation only, $skipped would skip on a full CI pass"
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

echo "=== landing: a push to main of a repo on NadavAI CI needs a main-tier landing pass ==="
# This gh answers commits/<sha>/statuses with a list, by sha: $LAND_MAIN a main-tier landing round
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
land() { # name want(ok|refused) base head [env...]; LREFS: extra ref lines pushed after main
  local name=$1 want=$2 base=$3 head=$4 rc; shift 4
  : >"$t/rec"; rm -f "$t/home/.cache/nadavai/pre-push.log"
  (cd "$ld" && { printf 'refs/heads/main %s refs/heads/main %s\n' "$head" "$base"; [ -n "${LREFS:-}" ] && printf '%s\n' "$LREFS"; } |
    env HOME="$t/home" PATH="$t/lbin:$PATH" REC="$t/rec" "$@" bash "$NEW_HOOK" origin "$LURL" >"$t/out" 2>&1); rc=$?
  if { [ "$want" = ok ] && [ "$rc" = 0 ]; } || { [ "$want" = refused ] && [ "$rc" = 1 ] && grep -q 'pre-push \[landing\]: .* no main-tier landing pass' "$t/out"; }; then
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

echo "----"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
