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
  GHN=$(grep -c '^gh ' "$t/rec")
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
if [ ${#f[@]} = 11 ] && [ "${f[1]}" = Nadav011/synth ] && [ "${f[2]}" = main ] && [ "${f[3]}" = "${head:0:7}" ] &&
   [[ ${f[0]} == 20* ]] && [[ ${f[5]} == typecheck=- ]] && [[ ${f[7]} =~ ^trivy=[0-9]+$ ]] &&
   [[ ${f[8]} =~ ^total=[0-9]+\.[0-9]$ ]] && [[ ${f[9]} =~ ^gh=[0-9]+\.[0-9]$ ]] && [[ ${f[10]} =~ ^scan=(ok|block|fail|skip|missing|-)$ ]]; then
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

echo "----"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
