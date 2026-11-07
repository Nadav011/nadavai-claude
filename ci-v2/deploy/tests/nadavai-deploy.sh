#!/usr/bin/env bash
# shellcheck disable=SC2034,SC2154,SC2329  # the sourced script's globals, and stubs it calls
# Offline tests of nadavai-deploy. The 37 checks of nadavai-ci's tests/nadavai-ci-hold.sh (9ca934d:
# lock order, hold, release, hold-status, rollback refusals, pages-live), ported to this service,
# plus the gate, the dry run, the auto pass, the clean upload environment, and (2026-11-04) the
# migration gate (on a real git mirror built here), the nightly gate (stub Woodpecker), and
# (2026-11-07) the OTA step (a stub of the vendored publisher, stub R2). A scratch HOME, stub gh, curl and sudo:
# nothing reaches GitHub, Cloudflare, Vercel, Woodpecker, R2 or a real ~/deploy.
#   tests/nadavai-deploy.sh [path to nadavai-deploy, default ../bin/nadavai-deploy]
set -u
umask 077
src=$(realpath "${1:-$(dirname "$0")/../bin/nadavai-deploy}")
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
export HOME=$t NADAVAI_DEPLOY_HOME=$t/deploy NADAVAI_DEPLOY_WORK=$t/work NADAVAI_DEPLOY_TOOLS=$t/tools \
  NADAVAI_DEPLOY_CACHE=$t/cache NADAVAI_DEPLOY_RETRY_SLEEP=0 NADAVAI_DEPLOY_WP_SERVER=https://wp.test \
  NADAVAI_DEPLOY_NIGHTLY_GAP=0
mkdir -p "$t/bin" "$t/cf" "$t/wp" "$t/deploy/secrets" "$t/deploy/state" "$t/work"
echo 'GH_TOKEN=zz-fake-gh-77' >"$t/deploy/secrets/github.env"
# gh: every call is logged; api answers come from $GH_* (JSON), a status POST succeeds.
cat >"$t/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "$*" >>"$HOME/gh.log"
[ "${GH_TOKEN:-}" = zz-fake-gh-77 ] || { echo "no token" >&2; exit 1; }
case $* in
  *"-X POST"*statuses/*) echo '{}' ;;
  *compare/*) printf '{"status":"%s"}\n' "${GH_COMPARE:-ahead}" ;;
  *commits/*/pulls) echo "${GH_PULLS:-[]}" ;;
  *commits/*/status*) echo "${GH_STATUS:-{\"statuses\":[]}}" ;;
  *commits/main) printf '{"sha":"%s"}\n' "${GH_MAIN:-}" ;;
  *commits/*) a="$*"; r=${a##*/commits/}; r=${r%% *}; [[ $r =~ ^[0-9a-f]{40}$ ]] && printf '{"sha":"%s"}\n' "$r" || exit 1 ;;
  *) exit 1 ;;
esac
GH
# curl: Cloudflare's Pages API for account acc123, project medizen, from the files in ~/cf:
# canonical (the live deployment's id), commit-<id> (its commit), deployments-<page>.json (the
# project's deployment list). A rollback makes its deployment canonical. Every command line goes to
# ~/curl.log and every header file's contents to ~/curl.headers; anything else fails as curl -f does.
cat >"$t/bin/curl" <<'CURL'
#!/usr/bin/env bash
echo "$*" >>"$HOME/curl.log"
method=GET url=''
while [ $# -gt 0 ]; do
  case $1 in
    -X) method=$2; shift ;;
    -H) case $2 in @*) cat -- "${2#@}" >>"$HOME/curl.headers" ;; *) echo "-H $2" >>"$HOME/curl.headers" ;; esac; shift ;;
    --max-time|-o|-w) shift ;;
    https://*) url=$1 ;;
  esac
  shift
done
base=https://api.cloudflare.com/client/v4/accounts/acc123/pages/projects/medizen
cf=$HOME/cf
# Woodpecker at https://wp.test, from the files in ~/wp: pipelines.json (the run list), cron.json,
# trigger.json (what a cron run answers; each POST is logged in ~/wp/posts, and after-post.json,
# when it exists, becomes the run list), and per run N:
# seq-N (its status at each read, one per line, the last one repeats), commit-N, wf-N.json.
wp=$HOME/wp
case "$method $url" in
  "GET https://wp.test/api/repos/4/pipelines?"*) cat "$wp/pipelines.json"; exit ;;
  "GET https://wp.test/api/repos/4/cron") cat "$wp/cron.json"; exit ;;
  "POST https://wp.test/api/repos/4/cron/"*) echo "${url##*/}" >>"$wp/posts"; cat "$wp/trigger.json"
    [ -f "$wp/after-post.json" ] && cp "$wp/after-post.json" "$wp/pipelines.json"; exit 0 ;;
  "GET https://wp.test/api/repos/4/pipelines/"*)
    n=${url##*/}; k=$(( $(cat "$wp/reads-$n" 2>/dev/null || echo 0) + 1 )); echo "$k" >"$wp/reads-$n"
    st=$(sed -n "${k}p" "$wp/seq-$n"); st=${st:-$(tail -1 "$wp/seq-$n")}
    printf '{"number":%s,"status":"%s","commit":"%s","workflows":%s}\n' "$n" "$st" "$(cat "$wp/commit-$n")" "$(cat "$wp/wf-$n.json" 2>/dev/null || echo '[]')"
    exit ;;
esac
case "$method $url" in
  "GET $base")
    [ -s "$cf/canonical" ] || { echo '{"success":true,"result":{"name":"medizen"}}'; exit 0; }
    id=$(cat "$cf/canonical")
    printf '{"success":true,"result":{"name":"medizen","canonical_deployment":{"id":"%s","environment":"production","deployment_trigger":{"type":"ad_hoc","metadata":{"branch":"main","commit_hash":"%s"}}}}}\n' \
      "$id" "$(cat "$cf/commit-$id" 2>/dev/null)" ;;
  "GET $base/deployments?"*)
    p=$(sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p' <<<"$url")
    [ -f "$cf/deployments-$p.json" ] && cat "$cf/deployments-$p.json" || echo '{"success":true,"result":[]}' ;;
  "POST $base/deployments/"*/rollback)
    id=${url#"$base/deployments/"}; id=${id%/rollback}
    echo "$id" >"$cf/canonical"; echo '{"success":true,"result":{}}' ;;
  *) echo "curl: (22) The requested URL returned error: 404" >&2; exit 22 ;;
esac
CURL
printf '#!/bin/sh\nexit 1\n' >"$t/bin/sudo"
chmod +x "$t/bin/gh" "$t/bin/curl" "$t/bin/sudo"
PATH=$t/bin:$PATH
# shellcheck source=/dev/null
. "$src" || exit 1
fail=0 n=0
check() { # name expected actual
  n=$((n + 1))
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected '$2', got '$3'"; fail=1; fi
}
R=therapy-flow-v2 S=$STATE
hf=$S/$R.hold
dstatus() { grep -c "statuses/$1 .*context=nadavai-deploy .*description=$2" "$HOME/gh.log"; }
m=$(printf 'a%.0s' {1..40}) s2=$(printf 'b%.0s' {1..40})

# The steps around the per-kind deploy are stubbed: the gate passes, the checkout is an empty dir,
# and deploy_pages records what it put live, in order, and when ~/dep-ready is a fifo first says it
# started and then waits on ~/dep-go.
stubs() {
gate() { GATE_PR=7 GATE_HEAD=$2; return 0; }
migration_gate() { return 0; }
nightly_gate() { return 0; }
mirror_fetch() { :; }
new_workdir() { mkdir -p "$WORK/w-$2" && echo "$WORK/w-$2"; }
live_of() { echo "live1 c1"; }
deploy_pages() {
  [ -p "$HOME/dep-ready" ] && { echo started >"$HOME/dep-ready"; read -r _ <"$HOME/dep-go"; }
  echo "deployed $2" >>"$HOME/deployed"; echo deploy-end >>"$HOME/order"; LIVE_AFTER="new-$2 $2"; return 0
}
}
stubs
export -f gate mirror_fetch new_workdir live_of deploy_pages
: >"$S/$R.auto"

# ---- hold-status: the mode with no hold, and usage.
check "hold-status: auto with the auto flag and no hold" auto "$(bash "$src" hold-status $R 2>&1)"
check "hold-status: a manual repo prints manual" manual "$(bash "$src" hold-status sportchat-web 2>&1)"
bash "$src" hold-status no-such-repo >/dev/null 2>&1; rc=$?
check "hold-status: an unknown repo is a usage error" 2 "$rc"
bash "$src" hold $R >/dev/null 2>&1; rc=$?
check "hold: no reason is a usage error and holds nothing" "2 no" "$rc $([ -e "$hf" ] && echo yes || echo no)"

# ---- Lock order: a deploy that holds the repo lock finishes before hold returns.
mkfifo "$HOME/dep-ready" "$HOME/dep-go" "$HOME/hold.err"
: >"$HOME/order"; : >"$HOME/deployed"; : >"$HOME/gh.log"
( cmd_deploy $R "$m" ) >/dev/null 2>&1 &
dp=$!
read -r _ <"$HOME/dep-ready"     # the deploy is running, under the repo lock
( bash "$src" hold $R "stage-1 full stop test" >/dev/null 2>"$HOME/hold.err"; echo "hold-returned $?" >>"$HOME/order" ) &
hp=$!
exec 5<"$HOME/hold.err"; read -r -t 10 note <&5 || note=''
before=$([ -e "$hf" ] && echo yes || echo no)
echo go >"$HOME/dep-go"; wait "$dp"; wait "$hp"; exec 5<&-
rm -f "$HOME/dep-ready" "$HOME/dep-go" "$HOME/hold.err"
check "lock order: hold waits for the lock and says so" "waiting" "$(grep -o waiting <<<"$note")"
check "lock order: the hold file is written at once, before the running deploy ends" yes "$before"
check "lock order: the running deploy finishes before hold returns" "deploy-end|hold-returned 0" "$(paste -sd'|' "$HOME/order")"
check "lock order: the deploy that held the lock went live" "deployed $m" "$(cat "$HOME/deployed")"
check "hold: the hold file names the reason" "stage-1 full stop test" "$(head -1 "$hf" 2>/dev/null)"
check "hold-status: held while the file exists" held "$(bash "$src" hold-status $R 2>&1)"

# ---- A deploy that starts after hold refuses, naming the hold (the auto pass, and `deploy`).
: >"$HOME/deployed"; : >"$HOME/gh.log"
GH_MAIN=$s2 cmd_auto >/dev/null 2>&1
check "after hold: the auto pass puts nothing live" "" "$(cat "$HOME/deployed")"
check "after hold: the auto pass reads nothing on GitHub" 0 "$(grep -c . "$HOME/gh.log")"
check "after hold: the commit is not recorded as deployed" "$m" "$(cat "$S/$R.deployed" 2>/dev/null)"
( cmd_deploy $R "$s2" ) >/dev/null 2>&1; rc=$?
check "after hold: deploy refuses with 3 and puts nothing live" "3 " "$rc $(cat "$HOME/deployed")"
check "after hold: deploy's status names the hold" 1 "$(dstatus "$s2" "not deployed: deploys are held on nadavai-deploy: stage-1 full stop test")"

# ---- off (the switch) prints off; a hold still prints held.
: >"$S/off"
check "hold-status: held beats off" held "$(bash "$src" hold-status $R 2>&1)"

# ---- release: under the same lock; then the mode again, and deploys go.
mkfifo "$HOME/lk-ready" "$HOME/rel-go" "$HOME/rel.err"
( exec 9>"$S/$R.lock"; flock 9; echo >"$HOME/lk-ready"; read -r _ <"$HOME/rel-go" ) &
lp=$!; read -r _ <"$HOME/lk-ready"   # another holder (a deploy, a rollback) has the lock
( bash "$src" release $R >/dev/null 2>"$HOME/rel.err"; echo "release-returned $?" >>"$HOME/rel-order" ) &
rp=$!
exec 5<"$HOME/rel.err"; read -r -t 10 note <&5 || note=''
before=$([ -e "$hf" ] && echo yes || echo no)
echo lock-freed >>"$HOME/rel-order"; echo go >"$HOME/rel-go"; wait "$lp"; wait "$rp"; exec 5<&-
rm -f "$HOME/rel.err" "$HOME/rel-go" "$HOME/lk-ready"
check "release: waits for the lock" "yes|lock-freed|release-returned 0" "$before|$(paste -sd'|' "$HOME/rel-order")"
check "release: the hold file is gone" no "$([ -e "$hf" ] && echo yes || echo no)"
check "hold-status: off while state/off exists" off "$(bash "$src" hold-status $R 2>&1)"
rm -f "$S/off"
check "hold-status: auto again after release" auto "$(bash "$src" hold-status $R 2>&1)"
: >"$HOME/deployed"
( cmd_deploy $R "$s2" ) >/dev/null 2>&1
check "release: the next deploy goes live" "deployed $s2" "$(cat "$HOME/deployed")"
check "deploy: success posts a status starting with live" 1 "$(sed -n 's/.*statuses\/'"$s2"' .*description=\(.*\)/\1/p' "$HOME/gh.log" | grep -c '^live: new-')"
bash "$src" release $R >/dev/null 2>&1; rc=$?
check "release: with no hold it still succeeds" "0 auto" "$rc $(bash "$src" hold-status $R 2>&1)"

# ---- pages-live and rollback, against the stub Cloudflare.
printf 'CLOUDFLARE_API_TOKEN=zz-fake-token-91\nCLOUDFLARE_ACCOUNT_ID=acc123\n' >"$SECRETS/$R.env"
uuid() { printf '%08x-0000-4000-8000-%012x\n' "$1" "$1"; }
live=$(uuid 1) prev=$(uuid 40) preview=$(uuid 7)
echo "$live" >"$t/cf/canonical"; echo aaaaaaa1111111111111111111111111111111aa >"$t/cf/commit-$live"
echo bbbbbbb2222222222222222222222222222222bb >"$t/cf/commit-$prev"
# Page 1: 25 production deployments and one preview; page 2: older ones, the target among them.
python3 - "$t/cf" "$preview" <<'PY'
import json, sys
d, pv = sys.argv[1], sys.argv[2]
u = lambda n: "%08x-0000-4000-8000-%012x" % (n, n)
p1 = [{"id": u(n), "environment": "production"} for n in range(1, 26) if n != 7] + [{"id": pv, "environment": "preview"}]
p2 = [{"id": u(n), "environment": "production"} for n in range(26, 45)]
json.dump({"success": True, "result": p1, "result_info": {"page": 1, "per_page": 25, "total_pages": 2}}, open(d + "/deployments-1.json", "w"))
json.dump({"success": True, "result": p2, "result_info": {"page": 2, "per_page": 25, "total_pages": 2}}, open(d + "/deployments-2.json", "w"))
PY
: >"$HOME/curl.log"; : >"$HOME/curl.headers"
out=$(bash "$src" pages-live $R 2>&1); rc=$?
check "pages-live: prints the canonical id and its commit" "0 $live aaaaaaa1111111111111111111111111111111aa" "$rc $out"
check "pages-live: the token reaches curl in a header" 1 "$(grep -c '^Authorization: Bearer zz-fake-token-91$' "$HOME/curl.headers")"
check "pages-live: the token is on no command line" 0 "$(grep -c zz-fake-token-91 "$HOME/curl.log")"
rm -f "$t/cf/canonical"
out=$(bash "$src" pages-live $R 2>/dev/null); rc=$?
check "pages-live: no canonical deployment fails and prints nothing" "1 " "$rc $out"
echo "$live" >"$t/cf/canonical"
bash "$src" pages-live no-such-repo >/dev/null 2>&1; rc=$?
check "pages-live: an unknown repo is a usage error" 2 "$rc"

: >"$HOME/curl.log"
out=$(bash "$src" rollback $R "$(uuid 999)" 2>&1); rc=$?
check "rollback: an id outside the project's list is refused" "1 0 $live" "$rc $(grep -c -- '-X POST' "$HOME/curl.log") $(cat "$t/cf/canonical")"
check "rollback: the refusal says so" refusing "$(grep -o refusing <<<"$out" | head -1)"
check "rollback: the whole list was read before refusing" 2 "$(grep -c '/deployments?' "$HOME/curl.log")"
: >"$HOME/curl.log"
bash "$src" rollback $R "$preview" >/dev/null 2>&1; rc=$?
check "rollback: a preview deployment is refused" "1 0" "$rc $(grep -c -- '-X POST' "$HOME/curl.log")"
: >"$HOME/curl.log"
bash "$src" rollback $R "not-a-uuid; rm -rf /" >/dev/null 2>&1; rc=$?
check "rollback: a malformed id is a usage error, before any call" "2 0" "$rc $(grep -c . "$HOME/curl.log")"
: >"$HOME/curl.log"; : >"$HOME/curl.headers"
out=$(bash "$src" rollback $R "$prev" 2>&1); rc=$?
check "rollback: a listed production id is rolled back to and read back" "0 $prev" "$rc $(cat "$t/cf/canonical")"
check "rollback: one POST, to that deployment's rollback" "1" \
  "$(grep -c -- "-X POST .*https://api.cloudflare.com/client/v4/accounts/acc123/pages/projects/medizen/deployments/$prev/rollback" "$HOME/curl.log")"
check "rollback: prints the live id and commit" "$prev bbbbbbb2222222222222222222222222222222bb" "$(grep -oE "$prev [0-9a-f]{40}" <<<"$out")"
check "rollback: the token is on no command line and not printed" "0 0" "$(grep -c zz-fake-token-91 "$HOME/curl.log") $(grep -c zz-fake-token-91 <<<"$out")"
mv "$SECRETS/$R.env" "$SECRETS/$R.env.off"; : >"$HOME/curl.log"
bash "$src" rollback $R "$live" >/dev/null 2>&1; rc=$?
check "rollback: no deploy env refuses before any call" "1 0" "$rc $(grep -c . "$HOME/curl.log")"
mv "$SECRETS/$R.env.off" "$SECRETS/$R.env"
echo "-- $n checks so far (the 37 ported ones and the live-status check)"

# ---- Beyond the port: rollback under a hold, Vercel ids, the gate, dry run, auto pass, clean env.
bash "$src" hold $R "rollback drill" >/dev/null 2>&1
bash "$src" rollback $R "$live" >/dev/null 2>&1; rc=$?
check "rollback: allowed while held (a person rolls back under a hold)" "0 $live held" "$rc $(cat "$t/cf/canonical") $(bash "$src" hold-status $R)"
bash "$src" release $R >/dev/null 2>&1
bash "$src" rollback cash-next-app "$live" >/dev/null 2>&1; rc=$?
check "rollback: a Vercel repo takes only a dpl_ id" 2 "$rc"
check "rollback: every rollback is in deploys.log" 2 "$(grep -c $'\trollback\t' "$LOGS/deploys.log")"
: >"$S/sportchat-web.auto"
check "hold-status: sportchat-web stays manual even with an auto flag" manual "$(bash "$src" hold-status sportchat-web)"

# The real gate, through the stub gh.
unset -f gate; . "$src"
pr="[{\"number\":42,\"merged_at\":\"x\",\"base\":{\"ref\":\"main\"},\"merge_commit_sha\":\"$s2\",\"head\":{\"sha\":\"$m\"}}]"
st_json() { printf '{"statuses":[{"context":"ci/woodpecker/pr/web","state":"%s"},{"context":"ci/woodpecker/pr/backend","state":"%s"},{"context":"nadavai-security","state":"%s"}]}' "$@"; }
green='{"statuses":[{"context":"ci/woodpecker/pr/web","state":"success"},{"context":"ci/woodpecker/pr/backend","state":"success"},{"context":"nadavai-security","state":"success"}]}'
g() { ( GH_COMPARE=${1} GH_PULLS=${2} GH_STATUS=${3} gate $R "$s2" ) >/dev/null 2>&1; echo $?; }
check "gate: green landing of a commit on main passes" 0 "$(g ahead "$pr" "$green")"
check "gate: main's head itself passes" 0 "$(g identical "$pr" "$green")"
check "gate: a commit not on main is refused" 4 "$(g diverged "$pr" "$green")"
check "gate: a commit that is no PR's merge commit is refused" 4 "$(g ahead "[{\"number\":1,\"merged_at\":\"x\",\"base\":{\"ref\":\"main\"},\"merge_commit_sha\":\"$m\",\"head\":{\"sha\":\"$m\"}}]" "$green")"
check "gate: a red woodpecker workflow is refused" 4 "$(g ahead "$pr" "$(st_json success failure success)")"
check "gate: a pending workflow is not ready (75)" 75 "$(g ahead "$pr" "$(st_json pending success success)")"
check "gate: no nadavai-security is refused" 4 "$(g ahead "$pr" '{"statuses":[{"context":"ci/woodpecker/pr/web","state":"success"}]}')"
check "gate: no woodpecker status is refused" 4 "$(g ahead "$pr" '{"statuses":[{"context":"nadavai-security","state":"success"}]}')"
check "gate: red nadavai-security is refused" 4 "$(g ahead "$pr" "$(st_json success success failure)")"
check "gate: an unreadable GitHub is not ready (75)" 75 "$(mv "$SECRETS/github.env" "$t/gh.env"; g ahead "$pr" "$green"; mv "$t/gh.env" "$SECRETS/github.env")"

# Dry run: the gate runs, no lock is taken, no status is posted, nothing is recorded as deployed.
stubs
deploy_pages() { [ -n "$4" ] && echo "dry $2" >>"$HOME/deployed"; LIVE_AFTER="live1 c1"; return 0; }
: >"$HOME/deployed"; : >"$HOME/gh.log"; echo "$s2" >"$S/$R.deployed"
( exec 9>"$S/$R.lock"; flock 9; sleep 3 ) & lk=$!; sleep 0.3
( cmd_deploy $R "$m" --dry-run ) >/dev/null 2>&1; rc=$?
kill "$lk" 2>/dev/null; wait "$lk" 2>/dev/null
check "dry run: passes while a deploy holds the lock (it takes none)" "0 dry $m" "$rc $(cat "$HOME/deployed")"
check "dry run: posts no status" 0 "$(grep -c 'statuses/' "$HOME/gh.log")"
check "dry run: records nothing as deployed" "$s2" "$(cat "$S/$R.deployed")"
check "dry run: logs a dry-run line with the live deployment" 1 "$(grep -c "$m"$'\tdry-run\tlive before deploy: live1 c1' "$LOGS/deploys.log")"
check "deploy: the live deploy logged its live-before line" 1 "$(grep -c "$s2"$'\tlive\tlive before deploy: live1 c1\tlive after: new-' "$LOGS/deploys.log")"

# Auto pass: nothing without flags; sportchat-web never; a failed head is not retried.
rm -f "$S"/*.auto; : >"$HOME/gh.log"
GH_MAIN=$m cmd_auto >/dev/null 2>&1
check "auto: with no .auto flag it reads nothing and deploys nothing" 0 "$(grep -c . "$HOME/gh.log")"
: >"$S/sportchat-web.auto"; GH_MAIN=$m cmd_auto >/dev/null 2>&1
check "auto: a sportchat-web flag is ignored" 0 "$(grep -c . "$HOME/gh.log")"
rm -f "$S/sportchat-web.auto"; : >"$S/$R.auto"
deploy_pages() { echo "auto $2" >>"$HOME/deployed"; return 1; }
: >"$HOME/deployed"; GH_MAIN=$m cmd_auto >/dev/null 2>&1; GH_MAIN=$m cmd_auto >/dev/null 2>&1
check "auto: deploys main's new head once, and a failed head is not retried" "auto $m|$m" "$(paste -sd'|' "$HOME/deployed")|$(cat "$S/$R.auto-seen")"
rm -f "$S/$R.auto"

# ---- The migration gate, on a real git mirror: c0 app; c1 adds a migration; c2 app only; c3 a
# migration test and a doc in the migrations folder; c4 a hand-applied migrations-gal1/ file.
fx=$t/fx; git init -q -b main "$fx"
mk() { mkdir -p "$fx/$(dirname "$1")"; echo "$2" >"$fx/$1"; git -C "$fx" add -A
  git -C "$fx" -c user.name=t -c user.email=t@t.invalid commit -qm "$1"; git -C "$fx" rev-parse HEAD; }
c0=$(mk src/app.js 1); c1=$(mk supabase/migrations/20261104_init.sql 'create table a();'); c2=$(mk src/app.js 2)
echo doc >"$fx/supabase/migrations/AGENTS.md"; c3=$(mk supabase/migrations/__tests__/dryrun-1.sql 'select 1;')
c4=$(mk migrations-gal1/p1.sql 'create view v as select 1;')
mkdir -p "$MIRROR"; git clone -q --bare "$fx" "$MIRROR/$R.git"
. "$src"; real_mg=$(declare -f migration_gate) real_ng=$(declare -f nightly_gate)   # the real gates again
mg() { ( migration_gate $R "$1" "$2" "${3:-}" ) >"$t/mg.out" 2>&1; echo $?; }
key() { sed -n 's/.*approval key \([0-9a-f]\{12\}\).*/\1/p' "$t/mg.out" | head -1; }
check "migrations: none in range passes" "0 1" "$(mg "$c1" "$c2") $(grep -c 'migrations: none' "$t/mg.out")"
check "migrations: a migration in range is refused with 5" 5 "$(mg "$c0" "$c2")"
k02=$(key)
check "migrations: the refusal names the file, the key and how to approve" "1 1" \
  "$(grep -c '^  supabase/migrations/20261104_init.sql$' "$t/mg.out") $(grep -c -- "--migration-approved \"$k02:<what he approved>\"" "$t/mg.out")"
check "migrations: tests and docs in the migrations folder do not count" 0 "$(mg "$c2" "$c3")"
check "migrations: a hand-applied migrations-gal1/ file counts" 5 "$(mg "$c3" "$c4")"
check "migrations: a deploy behind production (back over a migration) is refused too" 5 "$(mg "$c2" "$c0")"
check "migrations: the approval with this range's key lets it through and says so" "0 1" \
  "$(mg "$c0" "$c2" "$k02:Nadav approved 20261104_init") $(grep -c "approved by Nadav ($k02): Nadav approved 20261104_init" "$t/mg.out")"
check "migrations: an approval with another key is refused" "5 1" "$(mg "$c0" "$c2" "0123456789ab:old approval") $(grep -c 'the approval is for key 0123456789ab' "$t/mg.out")"
mg "$c0" "$c3" >/dev/null
check "migrations: another target gives another key" yes "$([ "$(key)" != "$k02" ] && echo yes)"
check "migrations: an approval for one target does not cover another" 5 "$(mg "$c0" "$c3" "$k02:Nadav approved 20261104_init")"
check "migrations: an unreadable live commit is refused" 5 "$(mg - "$c2")"
check "migrations: an unknown live commit is refused" 5 "$(mg "$(printf 'e%.0s' {1..40})" "$c2")"
check "migrations: the paths of all four repos, nested and in any case" \
  "supabase/migrations/1.sql|supabase/migrations-deferred/2.sql|migrations-gal2/3.sql|supabase/release-candidates/4.sql|migrations/5.sql|apps/api/supabase/migrations/6.sql|Supabase/Migrations/7.SQL|supabase/schemas/8.sql" \
  "$(printf '%s\n' supabase/migrations/1.sql supabase/migrations-deferred/2.sql migrations-gal2/3.sql supabase/release-candidates/4.sql \
      migrations/5.sql apps/api/supabase/migrations/6.sql Supabase/Migrations/7.SQL supabase/schemas/8.sql supabase/seed.sql \
      supabase/rollbacks/9.sql src/lib/migration/x.ts scripts/x.sql planning/clinic-migration-2026-10-31/y.sql supabase/migrations/AGENTS.md |
      grep -iE "$MIGRATION_RE" | paste -sd'|')"

# The migration gate inside deploy (the nightly gate stubbed, recording its mode).
stubs; eval "$real_mg"
nightly_gate() { echo "nightly ${3:-wait}" >>"$HOME/nightly-ran"; return 0; }
live_of() { echo "live1 $c0"; }
deploy_pages() { echo "${4:+dry }$2" >>"$HOME/deployed"; LIVE_AFTER="new-$2 $2"; return 0; }
: >"$HOME/deployed"; : >"$HOME/gh.log"; : >"$HOME/nightly-ran"
( cmd_deploy $R "$c2" ) >"$t/mg.out" 2>&1; rc=$?
check "deploy: a migration in range refuses with 5 and builds nothing" "5 " "$rc $(cat "$HOME/deployed")"
check "deploy: no nightly run is started for a deploy that needs Nadav first" "" "$(cat "$HOME/nightly-ran")"
check "deploy: the migration refusal posts its status" 1 "$(dstatus "$c2" "not deployed: database migrations")"
check "deploy: the migration refusal is in deploys.log" 1 "$(grep -c "$c2"$'\trefused-migration\t' "$LOGS/deploys.log")"
k=$(key)
( cmd_deploy $R "$c2" --migration-approved "$k:Nadav approved 20261104_init (AskUserQuestion)" ) >/dev/null 2>&1; rc=$?
check "deploy: --migration-approved with the printed key deploys" "0 $c2" "$rc $(cat "$HOME/deployed")"
check "deploy: the nightly verdict is read again under the lock, without a wait" "nightly wait|nightly nowait" "$(paste -sd'|' "$HOME/nightly-ran")"
check "deploy: the approval and its reason are in deploys.log" 1 "$(grep -c "$c2"$'\tlive\t.*\tmigration approved: '"$k"':Nadav approved 20261104_init (AskUserQuestion)$' "$LOGS/deploys.log")"
: >"$HOME/deployed"; : >"$HOME/gh.log"; : >"$HOME/nightly-ran"
( cmd_deploy $R "$c2" --dry-run ) >/dev/null 2>&1; rc=$?
check "dry run: a migration refusal is reported, the rest runs, and it exits 5" "5 dry $c2 nightly dry" "$rc $(cat "$HOME/deployed") $(cat "$HOME/nightly-ran")"
check "dry run: the refusal is in its deploys.log line, and no status is posted" "1 0" "$(grep -c "$c2"$'\tdry-run (refused-migration)\t' "$LOGS/deploys.log") $(grep -c 'statuses/' "$HOME/gh.log")"
deploy_pages() { return 1; }
( cmd_deploy $R "$c2" --dry-run ) >/dev/null 2>&1; rc=$?
check "dry run: the refusal's code stays when the build fails too" "5 1" "$rc $(grep -c "$c2"$'\tfailed (refused-migration)\t' "$LOGS/deploys.log")"
deploy_pages() { echo "${4:+dry }$2" >>"$HOME/deployed"; LIVE_AFTER="new-$2 $2"; return 0; }
for a in "" "  " "Nadav approved it" "$k:" "$k:   " "XYZ:reason"; do
  ( cmd_deploy $R "$c2" --migration-approved "$a" ) >/dev/null 2>&1; rc=$?
  check "deploy: --migration-approved '$a' is a usage error" 2 "$rc"
done
( cmd_deploy $R "$c2" --migration-approved ) >/dev/null 2>&1; rc=$?
check "deploy: --migration-approved without a value is a usage error" 2 "$rc"
( cmd_deploy $R "$c2" --auto --migration-approved "$k:x" ) >/dev/null 2>&1; rc=$?
check "deploy: the auto pass cannot approve a migration" 2 "$rc"
# The live commit moves while the deploy waits for the lock: the migrations are checked again.
live_of() { local n; n=$(( $(cat "$HOME/live-reads" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$HOME/live-reads"
  if [ "$n" = 1 ]; then echo "live1 $c1"; else echo "live2 $c0"; fi; }
rm -f "$HOME/live-reads"; : >"$HOME/deployed"; : >"$HOME/gh.log"
( cmd_deploy $R "$c2" ) >"$t/mg.out" 2>&1; rc=$?
check "deploy: a live commit that moved before the lock is checked for migrations again" "5 1 " "$rc $(grep -c 'live changed while this deploy waited' "$t/mg.out") $(cat "$HOME/deployed")"
# The gates run without the repo lock (a rollback is not kept waiting behind the nightly wait).
live_of() { echo "live1 $c1"; }
nightly_gate() { ( exec 7>"$S/$R.lock"; flock -n 7 ) && echo free >>"$HOME/nightly-ran" || echo locked >>"$HOME/nightly-ran"; return 0; }
: >"$HOME/nightly-ran"
( cmd_deploy $R "$c2" ) >/dev/null 2>&1
check "deploy: the nightly gate runs without the repo lock, the re-check with it" "free|locked" "$(paste -sd'|' "$HOME/nightly-ran")"

# ---- The nightly gate, against the stub Woodpecker (repo id 4) and the same mirror.
eval "$real_ng"
printf 'WOODPECKER_TOKEN=zz-fake-wp-3\n' >"$SECRETS/woodpecker.env"
echo '[{"id":4,"name":"nightly","branch":"main"}]' >"$t/wp/cron.json"
run() { printf '{"number":%s,"status":"%s","commit":"%s","cron":"%s","event":"cron","branch":"%s","parent":%s}' "$1" "$2" "$3" "${4:-nightly}" "${5:-main}" "${6:-0}"; }
runs() { local IFS=,; echo "[$*]" >"$t/wp/pipelines.json"; }
wprun() { printf '%s\n' "${@:3}" >"$t/wp/seq-$1"; echo "$2" >"$t/wp/commit-$1"; rm -f "$t/wp/reads-$1"; }
echo '[{"name":"web","state":"failure","children":[{"name":"unit","state":"failure","exit_code":1},{"name":"lint","state":"success","exit_code":0}]},{"name":"backend","state":"success","children":[]}]' >"$t/wp/wf-41.json"
cp "$t/wp/wf-41.json" "$t/wp/wf-99.json"; cp "$t/wp/wf-41.json" "$t/wp/wf-55.json"; wprun 41 "$c2" failure
ng() { : >"$t/wp/posts"; ( nightly_gate $R "$1" "${2:-}" ) >"$t/ng.out" 2>&1; echo $?; }
posts() { grep -c . "$t/wp/posts"; }
# Woodpecker's real answer (GET /api/repos/4/pipelines?event=cron&branch=main, 2026-11-04,
# trimmed to these fields): run #55 red on ef962b0.
fxl=$(dirname "$0")/fixtures/wp-therapy-flow-v2-nightly-list.json
cp "$fxl" "$t/wp/pipelines.json"; wprun 55 ef962b03b44038a38f9a11585ce6160f133b77b6 failure
check "nightly: Woodpecker's real list: run #55 red on the sha refuses with 6" "6 1" \
  "$(ng ef962b03b44038a38f9a11585ce6160f133b77b6) $(grep -c 'the latest, run #55 on ef962b0, is red' "$t/ng.out")"
runs "$(run 40 success "$c1")"
: >"$HOME/curl.log"; : >"$HOME/curl.headers"
check "nightly: the latest green passes, nothing is started" "0 0" "$(ng "$c2") $(posts)"
check "nightly: the token reaches Woodpecker in a header (the list and the cron), on no command line" "2 0" \
  "$(grep -c '^Authorization: Bearer zz-fake-wp-3$' "$HOME/curl.headers") $(grep -c zz-fake-wp-3 "$HOME/curl.log")"
runs "$(run 43 failure "$c3" other)" "$(run 42 failure "$c3" nightly feature)" "$(run 40 success "$c1")"
check "nightly: other crons and other branches are not the nightly's verdict" 0 "$(ng "$c2")"
runs "$(run 42 killed "$c3")" "$(run 40 success "$c1")"
check "nightly: a cancelled latest run newer than the green one is not ready (75)" "75 1" "$(ng "$c2") $(grep -c 'was cancelled' "$t/ng.out")"
for body in null '<html><body>502 Bad Gateway</body></html>' '{"error":"x"}'; do
  printf '%s\n' "$body" >"$t/wp/pipelines.json"
  check "nightly: a list that is not a JSON array ($body) is not ready (75)" 75 "$(ng "$c2")"
done
echo '[]' >"$t/wp/pipelines.json"
check "nightly: no finished run while the cron exists is not ready (75)" "75 1" "$(ng "$c4") $(grep -c 'no finished run yet' "$t/ng.out")"
echo '[]' >"$t/wp/cron.json"; runs "$(run 40 success "$c1")"
check "nightly: no nightly cron is not ready (75)" 75 "$(ng "$c4")"
echo '[{"id":4,"name":"nightly","branch":"main"}]' >"$t/wp/cron.json"
runs "$(run 41 failure "$c2")" "$(run 40 success "$c1")"
check "nightly: red on the sha itself refuses with 6, nothing started" "6 0" "$(ng "$c2") $(posts)"
check "nightly: the refusal prints the failing step" "1 0" "$(grep -c '^  web/unit: failure (exit 1)$' "$t/ng.out") $(grep -c 'lint' "$t/ng.out")"
check "nightly: red on a newer commit refuses an older sha" "6 0" "$(ng "$c1") $(posts)"
run 99 pending "$c4" >"$t/wp/trigger.json"; wprun 99 "$c4" pending running success
check "nightly: a newer sha starts the nightly once and passes when it is green on the sha" "0 1 4" "$(ng "$c4") $(posts) $(cat "$t/wp/posts")"
check "nightly: a dry run never starts the nightly; it says it would" "0 0 1" "$(ng "$c4" dry) $(posts) $(grep -c 'would start the nightly' "$t/ng.out")"
check "nightly: the re-check under the lock never starts or waits" "75 0" "$(ng "$c4" nowait) $(posts)"
wprun 99 "$c4" running failure
check "nightly: the fresh run red refuses with 6 and prints its failing steps (the old run's, then its own)" "6 1 2" \
  "$(ng "$c4") $(grep -c 'nightly run #99 on [0-9a-f]\{7\} ended failure' "$t/ng.out") $(grep -c '^  web/unit: failure' "$t/ng.out")"
wprun 99 "$c4" running
check "nightly: still running when the wait ends is not ready (75)" "75 1" "$(NIGHTLY_WAIT=0 ng "$c4") $(grep -c 'run the deploy again later' "$t/ng.out")"
runs "$(run 99 running "$c4")" "$(run 41 failure "$c2")"; wprun 99 "$c4" running success
check "nightly: a run already going on the sha is waited on, not started again" "0 0" "$(ng "$c4") $(posts)"
wprun 99 "$c4" running success
check "nightly: a dry run waits on a run already going on the sha" "0 0" "$(ng "$c4" dry) $(posts)"
# wp-watchdog cancels a run that lost its agent and restarts it (a new run whose parent is the old).
runs "$(run 101 running "$c4" nightly main 99)" "$(run 99 killed "$c4")" "$(run 41 failure "$c2")"
wprun 99 "$c4" running killed; wprun 101 "$c4" running success
: >"$t/wp/posts"; ( wp_wait $R 99 "$c4" ) >"$t/ng.out" 2>&1; rc=$?
check "nightly: a run the watchdog restarted is followed to its result" "0 1" "$rc $(grep -c 'restarted as #101; following it' "$t/ng.out")"
runs "$(run 99 killed "$c4")" "$(run 41 failure "$c2")"; wprun 99 "$c4" killed
( wp_wait $R 99 "$c4" ) >"$t/ng.out" 2>&1; rc=$?
check "nightly: a cancelled run with no restart is not ready (75), not red" "75 1" "$rc $(grep -c 'was killed and not restarted' "$t/ng.out")"
runs "$(run 41 failure "$c2")"; run 100 pending "$(printf 'f%.0s' {1..40})" >"$t/wp/trigger.json"
check "nightly: main moved past the sha is 4, 'main moved; deploy <head>'" "4 1 1" "$(ng "$c4") $(posts) $(grep -c 'main moved; deploy fffffff' "$t/ng.out")"
mv "$SECRETS/woodpecker.env" "$t/wp.env"
check "nightly: no Woodpecker token is not ready (75)" 75 "$(ng "$c4")"
mv "$t/wp.env" "$SECRETS/woodpecker.env"

# The nightly gate inside deploy (the real gate, migrations stubbed).
stubs; eval "$real_ng"
deploy_pages() { echo "${4:+dry }$2" >>"$HOME/deployed"; LIVE_AFTER="new-$2 $2"; return 0; }
runs "$(run 41 failure "$c2")"; : >"$HOME/deployed"; : >"$HOME/gh.log"
( cmd_deploy $R "$c2" ) >/dev/null 2>&1; rc=$?
check "deploy: a red nightly refuses with 6 and builds nothing" "6 " "$rc $(cat "$HOME/deployed")"
check "deploy: the nightly refusal posts its status, and no pending one" "1 0" "$(dstatus "$c2" "not deployed: the nightly full suite") $(grep -c 'state=pending' "$HOME/gh.log")"
run 99 pending "$c4" >"$t/wp/trigger.json"; wprun 99 "$c4" running; : >"$HOME/gh.log"
( NIGHTLY_WAIT=0 cmd_deploy $R "$c4" ) >/dev/null 2>&1; rc=$?
check "deploy: a nightly still running at the deadline is 75 and posts no status" "75 0" "$rc $(grep -c 'statuses/' "$HOME/gh.log")"
# Green on the newer sha; Woodpecker's list then shows that run as the latest (after-post.json).
wprun 99 "$c4" success; runs "$(run 41 failure "$c2")"
printf '[%s,%s]\n' "$(run 99 success "$c4")" "$(run 41 failure "$c2")" >"$t/wp/after-post.json"; : >"$HOME/deployed"
( cmd_deploy $R "$c4" ) >/dev/null 2>&1; rc=$?
check "deploy: green on the newer sha deploys" "0 $c4" "$rc $(cat "$HOME/deployed")"
rm -f "$t/wp/after-post.json"
runs "$(run 41 failure "$c2")"; run 100 pending "$(printf 'f%.0s' {1..40})" >"$t/wp/trigger.json"; : >"$HOME/deployed"; : >"$HOME/gh.log"
( cmd_deploy $R "$c4" ) >/dev/null 2>&1; rc=$?
check "deploy: main moved during the nightly check is 4, with its own status" "4 1" "$rc $(dstatus "$c4" "not deployed: main moved during the nightly check; deploy fffffff")"
nightly_gate() { printf 'hold set during the wait\n' >"$S/$R.hold"; return 0; }
: >"$HOME/deployed"; : >"$HOME/gh.log"
( cmd_deploy $R "$c4" ) >/dev/null 2>&1; rc=$?
check "deploy: a hold set while the gates ran stops the deploy" "3  1" "$rc $(cat "$HOME/deployed") $(dstatus "$c4" "not deployed: deploys are held on nadavai-deploy: hold set during the wait")"
rm -f "$S/$R.hold"

# ---- `deploy` from a session runs detached (a stub systemd-run runs the unit in the background).
cat >"$t/bin/systemd-run" <<'SR'
#!/usr/bin/env bash
echo "$*" >>"$HOME/systemd-run.log"
unit='' out=''
while [ "$1" != -- ]; do
  case $1 in
    --unit=*) unit=${1#--unit=} ;;
    StandardOutput=append:*) out=${1#StandardOutput=append:} ;;
    --setenv=*=*) v=${1#--setenv=}; export "${v%%=*}=${v#*=}" ;;
  esac
  shift
done
shift
setsid "$@" >>"$out" 2>&1 </dev/null &
echo $! >"$HOME/unit-$unit"
SR
printf '#!/usr/bin/env bash\ncat "$HOME/unit-${*: -1}" 2>/dev/null\n' >"$t/bin/systemctl"
chmod +x "$t/bin/systemd-run" "$t/bin/systemctl"
bash "$src" hold $R "detach test" >/dev/null 2>&1; : >"$HOME/gh.log"
out=$(bash "$src" deploy $R "$c2" 2>&1); rc=$?
check "detached: the follower returns the deploy's exit code and prints its output" "3 1 1" \
  "$rc $(grep -c 'running as user unit nadavai-deploy-run-' <<<"$out") $(grep -c 'refusing: deploys of therapy-flow-v2 are held (detach test)' <<<"$out")"
check "detached: the deploy ran in the unit, with its exit code beside the output" "1 3" \
  "$(grep -c -- '-- .*nadavai-deploy deploy therapy-flow-v2' "$HOME/systemd-run.log") $(cat "$LOGS"/session-$R-*.out.rc | tail -1)"
check "detached: the unit gets the caller's NADAVAI_DEPLOY_* settings" 1 "$(grep -c -- '--setenv=NADAVAI_DEPLOY_WP_SERVER ' "$HOME/systemd-run.log")"
bash "$src" release $R >/dev/null 2>&1
bash "$src" deploy no-such-repo "$c2" >/dev/null 2>&1; rc=$?
check "detached: a usage error starts no unit" "2 1" "$rc $(grep -c . "$HOME/systemd-run.log")"
check "deploy: the TERM, INT, HUP and PIPE traps roll back" 1 "$(grep -c 'trap on_term TERM INT HUP PIPE' "$src")"

# Vercel API URLs: one ? then &teamId (bash 5.2's patsub_replacement once doubled the path).
printf 'VERCEL_TOKEN=zz-fake-vercel-5\n' >"$SECRETS/cash-next-app.env"; : >"$HOME/curl.log"
vercel_call cash-next-app "/v9/projects/p1" >/dev/null 2>&1; vercel_call cash-next-app "/v6/deployments?projectId=p1&limit=100" >/dev/null 2>&1
check "vercel: a path without a query gets ?teamId" 1 "$(grep -c 'https://api.vercel.com/v9/projects/p1?teamId=team_qlONn2fSQNzkGkzgQLBXrUDD$' "$HOME/curl.log")"
check "vercel: a path with a query gets &teamId" 1 "$(grep -c 'https://api.vercel.com/v6/deployments?projectId=p1&limit=100&teamId=team_qlONn2fSQNzkGkzgQLBXrUDD$' "$HOME/curl.log")"
chmod 644 "$SECRETS/cash-next-app.env"; : >"$HOME/curl.log"
vercel_call cash-next-app "/v9/projects/p1" >/dev/null 2>&1; rc=$?
check "secrets: a file that is not mode 600 is refused before any call" "1 0" "$rc $(grep -c . "$HOME/curl.log")"

# The upload tools get only the named variables, never the rest of this process's environment.
out=$( unset CLOUDFLARE_ACCOUNT_ID; export LEAKY_SECRET=x CLOUDFLARE_API_TOKEN=y HOME=/h PATH=/usr/bin:/bin; clean_exec /usr/bin/env )
check "clean_exec: only the allowed variables reach the tool" "CLOUDFLARE_API_TOKEN HOME PATH" "$(cut -d= -f1 <<<"$out" | grep -v '^_$\|^PWD$\|^SHLVL$\|^OLDPWD$' | sort | paste -sd' ')"

# ---- OTA: the store apps follow a live deploy. The real ota_step and tools/ota-step.mjs, with a
# stub of the vendored publisher in tools/ota (fixtures/ota/scripts/native: ota-publish.mjs and
# fingerprint.mjs; the fixture commit carries the same files, plus native/apps.json and
# native/runtimes.json) and a stub R2 (files under ~/r2). A stub sudo runs each sandboxed unit in
# place with env -i, only its Environment=, EnvironmentFile= and credential; before the first OTA
# unit it runs ~/on-ota-unit once when that exists (a person acting while a publish is in flight),
# and before medizen's bundle build ~/on-build-unit (a person acting while a build runs).
cat >"$t/bin/sudo" <<'SUDO'
#!/usr/bin/env bash
[ "$1" = -n ] && shift
case $1 in
  systemd-run) shift; echo "$*" >>"$HOME/sudo.log"
    case $* in *nadavai-deploy-ota-*) [ -x "$HOME/on-ota-unit" ] && { mv "$HOME/on-ota-unit" "$HOME/on-ota-unit.ran"; "$HOME/on-ota-unit.ran"; } ;; esac
    case $* in *nadavai-deploy-build-*'>dist/index.html'*) [ -x "$HOME/on-build-unit" ] && { mv "$HOME/on-build-unit" "$HOME/on-build-unit.ran"; "$HOME/on-build-unit.ran"; } ;; esac
    wd=/ envf='' cred='' e=()
    while [ "$1" != -- ]; do
      if [ "$1" = -p ]; then
        case $2 in
          WorkingDirectory=*) wd=${2#*=} ;; EnvironmentFile=*) envf=${2#*=} ;; LoadCredential=*) cred=${2#*=} ;;
          Environment=*) read -ra x <<<"${2#Environment=}"; e+=("${x[@]}") ;;
        esac
        shift
      fi
      shift
    done
    shift
    [ -z "$envf" ] || while IFS= read -r l; do case $l in ''|'#'*) ;; *=*) e+=("$l") ;; esac; done <"$envf"
    if [ -n "$cred" ]; then c=$(mktemp -d "$HOME/cred.XXXXXX"); cp "${cred#*:}" "$c/${cred%%:*}"; e+=("CREDENTIALS_DIRECTORY=$c"); fi
    cd "$wd" && exec env -i "${e[@]}" "$@" ;;
  systemctl) echo "$*" >>"$HOME/sudo.log"; exit 0 ;;
  chown) exit 0 ;;
  install) a=(); while [ $# -gt 0 ]; do case $1 in -o|-g) shift ;; *) a+=("$1") ;; esac; shift; done; exec "${a[@]}" ;;
  chmod|rm) exec "$@" ;;
  *) exit 1 ;;
esac
SUDO
chmod +x "$t/bin/sudo"
mkdir -p "$t/tools/node/bin" "$t/tools/bin" "$t/tools/ota" "$t/tools/cli/node_modules/aws4fetch" "$t/r2"
echo '{"name":"aws4fetch","version":"0.0.0-stub"}' >"$t/tools/cli/node_modules/aws4fetch/package.json"
ln -s "$(command -v node)" "$t/tools/node/bin/node"; printf '#!/bin/sh\nexit 0\n' >"$t/tools/bin/pnpm"; chmod +x "$t/tools/bin/pnpm"
here=$(dirname "$0")
cp "$here/../tools/ota-step.mjs" "$t/tools/ota-step.mjs"
cp "$here/fixtures/ota/scripts/native/ota-publish.mjs" "$here/fixtures/ota/scripts/native/fingerprint.mjs" "$t/tools/ota/"
printf 'R2_ACCOUNT_ID=acc\nR2_ACCESS_KEY_ID=zz-fake-r2-id\nR2_SECRET_ACCESS_KEY=zz-fake-r2-secret\nR2_BUCKET=nadavai-app-updates-staging\nOTA_PUBLIC_BASE=https://evil.test\nOTA_STUB_R2=%s\n' "$t/r2" >"$SECRETS/r2-ota.env"
for a in medizen retrobarber; do echo "zz-fake-key-$a" >"$SECRETS/ota-$a.pem"; done
echo 'VITE_APP=medizen-public' >"$SECRETS/$R.build.env"; echo 'VITE_APP=salon-public' >"$SECRETS/vitlana-salon-public.env"
cp -R "$here/fixtures/ota/." "$fx/"; git -C "$fx" add -A
git -C "$fx" -c user.name=t -c user.email=t@t.invalid commit -qm ota; c5=$(git -C "$fx" rev-parse HEAD)
git -C "$MIRROR/$R.git" fetch -q --update-head-ok "$fx" +main:main
# side() name file...: a commit on branch <name> (in the mirror too) that changes the files
# written by the caller; prints its sha and leaves the fixture repo on main.
side() {
  local b=$1 sha; shift
  git -C "$fx" add -A && git -C "$fx" -c user.name=t -c user.email=t@t.invalid commit -qm "$b" && sha=$(git -C "$fx" rev-parse HEAD)
  git -C "$fx" branch -q -f "$b" "$sha" && git -C "$fx" reset -q --hard "$c5"
  git -C "$MIRROR/$R.git" fetch -q "$fx" "+$b:$b"; echo "$sha"
}
r2m() { # app platform runtime seq commit action published-at: a production manifest in the stub R2
  local f=$t/r2/nadavai-app-updates/$1/$2/$3/manifest.json body
  mkdir -p "$(dirname "$f")"
  body=$(jq -cn --arg a "$1" --arg p "$2" --argjson s "$4" --arg c "$5" --arg act "$6" --arg at "$7" \
    '{schema:1, app:$a, platform:$p, seq:$s, action:$act, bundleId:"old", commit:(if $c == "" then null else $c end), publishedAt:$at}')
  jq -cn --arg b "$body" '{alg:"stub", body:$b, signature:"stub"}' >"$f"
}
m2() { local f=$t/r2/nadavai-app-updates/$1/$2/$3/manifest.json; [ -f "$f" ] && jq -r .body "$f" | jq -r '"\(.seq) \(.action) \(.commit)"' || echo none; }
ostatus() { grep "statuses/$1 .*context=nadavai-ota .*description=$2" "$HOME/gh.log" | grep -c "state=$3"; }
pubs() { grep -c . "$t/r2/publish.log" 2>/dev/null || echo 0; }
. "$src"; real_nw=$(declare -f new_workdir) real_lo=$(declare -f live_of); stubs; eval "$real_nw"
echo "$c5" >"$HOME/live-commit"
live_of() { echo "live-x $(cat "$HOME/live-commit")"; }
deploy_pages() { echo "deployed $2" >>"$HOME/deployed"; LIVE_AFTER="new-$2 $2"; return 0; }
# The store shells out there: medizen android and retrobarber android on an older commit;
# retrobarber ios behind a person's rollback made after this commit; medizen ios has manifests only
# on an older runtime (its shell changed: the commit's runtime has none).
r2m medizen android runtime-aaaaaaaaaaa1 1 "$c0" apply 2026-11-06T00:00:00Z
r2m retrobarber android runtime-bbbbbbbbbbb1 1 "$c0" apply 2026-11-06T00:00:00Z
r2m retrobarber ios runtime-bbbbbbbbbbb2 3 "${c0:0:12}" rollback 2999-01-01T00:00:00Z
r2m medizen ios runtime-0000000000ff 4 "$c0" apply 2026-11-01T00:00:00Z
: >"$HOME/deployed"; : >"$HOME/gh.log"; : >"$HOME/sudo.log"
( cmd_deploy $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: the deploy goes live and exits 0" "0 deployed $c5 1" "$rc $(cat "$HOME/deployed") $(dstatus "$c5" "live: new-")"
check "ota: publishes where the runtime has a production manifest" "2 apply $c5|2 apply $c5" "$(m2 medizen android runtime-aaaaaaaaaaa1)|$(m2 retrobarber android runtime-bbbbbbbbbbb1)"
check "ota: a runtime with no manifest, the platform having others, is a native change: nothing published there" "none 0" "$(m2 medizen ios runtime-aaaaaaaaaaa2) $(grep -c 'medizen ios' "$t/r2/publish.log")"
check "ota: a person's rollback newer than the commit is kept" "3 rollback ${c0:0:12} 0" "$(m2 retrobarber ios runtime-bbbbbbbbbbb2) $(grep -c 'retrobarber ios' "$t/r2/publish.log")"
check "ota: nadavai-ota says a store build is needed, after the live nadavai-deploy" "1 yes" \
  "$(ostatus "$c5" "native change: store build needed: medizen/ios; published medizen/android,retrobarber/android" failure) $(
    [ "$(grep -n 'context=nadavai-deploy .*description=live: ' "$HOME/gh.log" | cut -d: -f1)" -lt "$(grep -n 'context=nadavai-ota' "$HOME/gh.log" | head -1 | cut -d: -f1)" ] && echo yes)"
check "ota: a pending nadavai-ota is posted first" "1 pending" "$(ostatus "$c5" "publishing the store apps over the air" pending) $(grep 'context=nadavai-ota' "$HOME/gh.log" | head -1 | sed -n 's/.*state=\([a-z]*\).*/\1/p')"
check "ota: the deploy log names it, and deploys.log has an ota line" "1 1" \
  "$(grep -c 'OTA: STORE BUILD NEEDED: native change' "$t/ota.out") $(grep -c "$c5"$'\tota-native-change\tnative change: store build needed: medizen/ios' "$LOGS/deploys.log")"
bundle=$t/r2/nadavai-app-updates/medizen/bundles/${c5:0:12}-stub
check "ota: the bundle built with its public env only, no R2 or GitHub secret" "1 0 0" \
  "$(grep -c '^VITE_APP=medizen-public$' "$bundle/build-env.txt") $(grep -c 'zz-fake' "$bundle/build-env.txt") $(grep -c 'OTA_STUB_R2\|CREDENTIALS_DIRECTORY' "$bundle/build-env.txt")"
check "ota: the salon bundle built with the salon env" 1 "$(grep -c '^VITE_APP=salon-public$' "$t/r2/nadavai-app-updates/retrobarber/bundles/${c5:0:12}-stub/build-env.txt")"
check "ota: the build units get no R2 env and no key; each publish unit gets r2-ota.env and only its app's key" "0 2 2 4" \
  "$(grep 'nadavai-deploy-build-' "$HOME/sudo.log" | grep -c 'r2-ota\|ota-medizen\|ota-retrobarber\|LoadCredential') $(grep 'nadavai-deploy-ota-' "$HOME/sudo.log" | grep -c "LoadCredential=ota-key:$SECRETS/ota-medizen.pem") $(grep 'nadavai-deploy-ota-' "$HOME/sudo.log" | grep -c "LoadCredential=ota-key:$SECRETS/ota-retrobarber.pem") $(grep 'nadavai-deploy-ota-' "$HOME/sudo.log" | grep -c "EnvironmentFile=$SECRETS/r2-ota.env")"
check "ota: every publish unit runs as nadavai-ota, none as nadavai-upload" "4 0" \
  "$(grep 'nadavai-deploy-ota-' "$HOME/sudo.log" | grep -c 'User=nadavai-ota -p Group=nadavai-ota') $(grep 'nadavai-deploy-ota-' "$HOME/sudo.log" | grep -c 'nadavai-upload')"
check "ota: the publish units run the trusted driver, never a script of the commit" "4 0" \
  "$(grep -c " sh $t/tools/node/bin/node $t/tools/ota-step.mjs publish $WORK/" "$HOME/sudo.log") $(grep -c 'scripts/native' "$HOME/sudo.log")"
check "ota: the bucket and the public host are fixed, whatever r2-ota.env or apps.json say" 2 "$(grep -c ' nadavai-app-updates https://updates.nadavc.ai$' "$t/r2/publish.log")"
check "ota: the runtime each platform reached and the bundle of the commit are recorded" "runtime-aaaaaaaaaaa1 runtime-bbbbbbbbbbb2 1 no" \
  "$(cat "$S/$R.ota-runtime.medizen.android") $(cat "$S/$R.ota-runtime.retrobarber.ios") $(grep -c "^medizen android runtime-aaaaaaaaaaa1 ${c5:0:12}-stub $c5$" "$S/$R.ota-bundles") $([ -e "$S/$R.ota-runtime.medizen.ios" ] && echo yes || echo no)"
check "ota: the clones are removed" "" "$(find "$WORK" -mindepth 1 -maxdepth 1 -name "$R-*")"

# Idempotent: the same commit again publishes nothing.
: >"$HOME/gh.log"
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: the same commit again is current everywhere and publishes nothing" "0 2 2" "$rc $(pubs) $(grep -c ' current .*-stub seq 2 apply' "$t/ota.out")"
check "ota: and posts current on nadavai-ota" 1 "$(ostatus "$c5" "native change: store build needed: medizen/ios; current medizen/android,retrobarber/android" failure)"
# Dry run: an older manifest would be published over, but nothing is written or posted.
r2m medizen android runtime-aaaaaaaaaaa1 2 "$c0" apply 2026-11-06T00:00:00Z; : >"$HOME/gh.log"
( cmd_ota $R "$c5" --dry-run ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a dry run says it would publish, writes nothing, posts nothing" "0 1 2 2 0" \
  "$rc $(grep -c 'medizen android runtime-aaaaaaaaaaa1 would-publish - over seq 2' "$t/ota.out") $(pubs) $(m2 medizen android runtime-aaaaaaaaaaa1 | cut -d' ' -f1) $(grep -c 'statuses/' "$HOME/gh.log")"
# An R2 failure: reported loudly, the web deploy stands (no rollback, exit 0, live status).
: >"$t/r2/fail-medizen"; : >"$HOME/deployed"; : >"$HOME/gh.log"
( cmd_deploy $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a failed publish does not undo the web deploy" "0 deployed $c5 1 0" \
  "$rc $(cat "$HOME/deployed") $(dstatus "$c5" "live: new-") $(grep -c 'rolled-back\|rolling back' "$t/ota.out")"
check "ota: the failure is on nadavai-ota, in the log and in deploys.log" "1 1 1" \
  "$(ostatus "$c5" "OTA failed: medizen/android (log on the Oracle VM); native change: medizen/ios" failure) $(grep -c 'OTA: FAILED' "$t/ota.out") $(grep -c "$c5"$'\tota-failed\t' "$LOGS/deploys.log")"
rm -f "$t/r2/fail-medizen"
# A platform with no manifest on any runtime was never released over the air: not a failure.
rm -rf "${t:?}/r2/nadavai-app-updates/medizen/ios"; : >"$HOME/gh.log"
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a platform with no manifest at all is 'not released yet', success" "0 1 0" \
  "$rc $(ostatus "$c5" "store apps on ${c5:0:7}; published medizen/android; current retrobarber/android; rollback kept: retrobarber/ios; not released: medizen/ios" success) $(grep -c 'store build' "$t/ota.out")"
r2m medizen ios runtime-aaaaaaaaaaa2 1 "$c5" apply 2026-11-06T00:00:00Z

# The commit's publisher is never run: a commit whose scripts/native/ota-publish.mjs differs from
# the vendored blob (here: one that would leave a mark on import) is refused before any build.
printf '\nimport("node:fs").then((fs) => fs.writeFileSync(process.env.OTA_STUB_R2 + "/commit-code-ran", "x"));\n' >>"$fx/scripts/native/ota-publish.mjs"
c6=$(side bad-publisher); echo "$c6" >"$HOME/live-commit"; : >"$HOME/gh.log"; : >"$HOME/sudo.log"; n0=$(pubs)
( cmd_ota $R "$c6" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a changed publisher in the commit is refused: nothing built, signed or published" "1 0 0 $n0 no" \
  "$rc $(grep -c 'nadavai-deploy-ota-' "$HOME/sudo.log") $(grep -c 'dist\|build:' "$HOME/sudo.log") $(pubs) $([ -e "$t/r2/commit-code-ran" ] && echo yes || echo no)"
check "ota: and says so on nadavai-ota and in deploys.log" "1 1 1" \
  "$(ostatus "$c6" "OTA refused: publisher changed in the commit: review and re-vendor" failure) $(grep -c 'differ from the publisher vendored in nadavai' "$t/ota.out") $(grep -c "$c6"$'\tota-publisher-changed\t' "$LOGS/deploys.log")"
# The vendored file is hashed as its own bytes (hash-object --no-filters): a copy that differs from
# the commit's blob only in line ends is refused too, whatever core.autocrlf says.
cp "$t/tools/ota/fingerprint.mjs" "$t/fp.lf"; sed -i 's/$/\r/' "$t/tools/ota/fingerprint.mjs"
echo "$c5" >"$HOME/live-commit"; : >"$HOME/gh.log"; n0=$(pubs)
( export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=input; cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a vendored publisher that differs only in line ends is refused, whatever core.autocrlf says" "1 $n0 1" \
  "$rc $(pubs) $(grep -c "scripts/native/ fingerprint.mjs of ${c5:0:7} differ from the publisher vendored" "$t/ota.out")"
mv "$t/fp.lf" "$t/tools/ota/fingerprint.mjs"

# A bundle that is not this commit's (medizen's sw.js stamp), or has no updater (retrobarber), is
# never signed; the other platforms go on.
jq '.apps.medizen.buildCommand |= sub("git rev-parse --short HEAD"; "echo deadbee") | .apps.retrobarber.buildCommand |= sub(" && \\{ printf.*$"; "")' \
  "$fx/native/apps.json" >"$t/apps.json" && mv "$t/apps.json" "$fx/native/apps.json"
c7=$(side bad-bundles); echo "$c7" >"$HOME/live-commit"; : >"$HOME/gh.log"; n0=$(pubs)
( cmd_ota $R "$c7" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a bundle without this commit's stamp, or without the updater, is not published" "1 $n0 1 1" \
  "$rc $(pubs) $(grep -c "dist/sw.js carries 'tf-shell-0123456789-deadbee', not ${c7:0:7}" "$t/ota.out") $(grep -c 'retrobarber android .* failed - the bundle has no OTA updater: https://updates.nadavc.ai, the runtime-<fp12>/manifest.json path, the app.s public key not found' "$t/ota.out")"
check "ota: nadavai-ota names both" 1 "$(ostatus "$c7" "OTA failed: medizen,retrobarber/android" failure)"
# A symlink in a built bundle is never copied into the signing clone (ota-step.mjs refuses one as
# well; see the real publisher below).
jq '.apps.medizen.buildCommand += " && ln -s /etc/hostname dist/leak"' "$fx/native/apps.json" >"$t/apps.json" && mv "$t/apps.json" "$fx/native/apps.json"
c8=$(side link-in-dist); echo "$c8" >"$HOME/live-commit"; : >"$HOME/gh.log"; : >"$HOME/sudo.log"
( cmd_ota $R "$c8" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a symlink in the built bundle is refused before anything signs it" "1 0 1 1" \
  "$rc $(grep -c 'ota-step.mjs publish .* medizen ' "$HOME/sudo.log") $(grep -c "OTA: medizen's dist has no index.html, is tracked in git, or holds a symlink" "$t/ota.out") $(ostatus "$c8" "OTA failed: medizen (log on the Oracle VM)" failure)"
echo "$c5" >"$HOME/live-commit"

# A hold, an ota-off or a web rollback while a publish is in flight: the next platform is not
# published. ~/on-ota-unit acts during the first publish unit.
r2m medizen android runtime-aaaaaaaaaaa1 5 "$c0" apply 2026-11-06T00:00:00Z
r2m medizen ios runtime-aaaaaaaaaaa2 5 "$c0" apply 2026-11-06T00:00:00Z
r2m retrobarber android runtime-bbbbbbbbbbb1 5 "$c0" apply 2026-11-06T00:00:00Z
printf '#!/bin/sh\nprintf "in flight\\nset now\\n" >"%s"\n' "$hf" >"$HOME/on-ota-unit"; chmod +x "$HOME/on-ota-unit"
: >"$HOME/gh.log"; n0=$(pubs)
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a hold during a publish stops the step before the next platform" "1 $((n0 + 1)) 5 apply $c0|5 apply $c0" "$rc $(pubs) $(m2 medizen ios runtime-aaaaaaaaaaa2)|$(m2 retrobarber android runtime-bbbbbbbbbbb1)"
check "ota: nadavai-ota says where it stopped and why" 1 "$(ostatus "$c5" "OTA stopped before medizen/ios,retrobarber/android,retrobarber/ios: deploys of $R are held; published medizen/android" failure)"
rm -f "$hf"
printf '#!/bin/sh\necho %s >"%s"\n' "$c0" "$HOME/live-commit" >"$HOME/on-ota-unit"; chmod +x "$HOME/on-ota-unit"
: >"$HOME/gh.log"; n0=$(pubs)
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a web rollback during a publish stops the step too" "1 $n0 1" "$rc $(pubs) $(ostatus "$c5" "OTA stopped before medizen/ios,retrobarber/android,retrobarber/ios: production now serves $c0" failure)"
echo "$c5" >"$HOME/live-commit"
# The same gate runs before each app's build: a hold set while medizen builds stops the step before
# retrobarber is built, and nothing is signed.
printf '#!/bin/sh\nprintf "during a build\\nset now\\n" >"%s"\n' "$hf" >"$HOME/on-build-unit"; chmod +x "$HOME/on-build-unit"
: >"$HOME/gh.log"; : >"$HOME/sudo.log"; n0=$(pubs)
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a hold during a build stops the step before the next app's build" "1 $n0 1 0 0" \
  "$rc $(pubs) $(grep -c 'nadavai-deploy-build-.*>dist/index.html' "$HOME/sudo.log") $(grep -c 'nadavai-deploy-build-.*dist-salon-client' "$HOME/sudo.log") $(grep -c 'nadavai-deploy-ota-' "$HOME/sudo.log")"
check "ota: nadavai-ota names every platform it stopped before" 1 \
  "$(ostatus "$c5" "OTA stopped before retrobarber/android,retrobarber/ios,medizen/android,medizen/ios: deploys of $R are held" failure)"
rm -f "$hf"
# hold returns only once a step holding the OTA lock has let go.
mkfifo "$HOME/ol-ready" "$HOME/ol-go" "$HOME/hold.err"; : >"$HOME/ol-order"
( exec 7>"$S/$R.ota.lock"; flock 7; echo >"$HOME/ol-ready"; read -r _ <"$HOME/ol-go"; echo ota-lock-freed >>"$HOME/ol-order" ) &
lp=$!; read -r _ <"$HOME/ol-ready"
( bash "$src" hold $R "ota lock test" >/dev/null 2>"$HOME/hold.err"; echo "hold-returned $?" >>"$HOME/ol-order" ) &
hp=$!
exec 5<"$HOME/hold.err"; read -r -t 10 note <&5 || note=''
echo go >"$HOME/ol-go"; wait "$lp"; wait "$hp"; exec 5<&-
rm -f "$HOME/ol-ready" "$HOME/ol-go" "$HOME/hold.err"
check "hold: waits for the OTA lock too, and says so" "OTA lock|ota-lock-freed|hold-returned 0" "$(grep -o 'OTA lock' <<<"$note" | head -1)|$(paste -sd'|' "$HOME/ol-order")"
# A held repo: no deploy, so no OTA step; the ota command refuses too.
: >"$HOME/sudo.log"; : >"$HOME/gh.log"; n0=$(pubs)
( cmd_deploy $R "$c5" ) >/dev/null 2>&1; rc=$?
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc2=$?
check "ota: held, neither deploy nor ota builds or publishes anything" "3 3 0 $n0 0" \
  "$rc $rc2 $(grep -c . "$HOME/sudo.log") $(pubs) $(grep -c 'context=nadavai-ota' "$HOME/gh.log")"
bash "$src" release $R >/dev/null 2>&1
( cmd_ota $R "$c4" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: a commit production does not serve is refused (4), nothing built" "4 0 1" "$rc $(grep -c . "$HOME/sudo.log") $(grep -c 'follows only the live commit' "$t/ota.out")"
bash "$src" ota cash-next-app "$c5" >/dev/null 2>&1; rc=$?
check "ota: a repo without store apps is a usage error" 2 "$rc"
# ota-off: the whole OTA step publishes nothing (and says so) until ota-on; web deploys go on.
bash "$src" ota-off $R "store review pending" >/dev/null 2>&1; rc=$?
: >"$HOME/gh.log"; : >"$HOME/deployed"; n0=$(pubs)
( cmd_deploy $R "$c5" ) >/dev/null 2>&1; rc2=$?
check "ota-off: the deploy goes live, the OTA step publishes nothing and says why" "0 0 deployed $c5 $n0 1" \
  "$rc $rc2 $(cat "$HOME/deployed") $(pubs) $(ostatus "$c5" "not published: the OTA is off on nadavai-deploy: store review pending" failure)"
bash "$src" ota-on $R >/dev/null 2>&1; rc=$?
check "ota-on: the switch is gone" "0 no" "$rc $([ -e "$S/$R.ota-off" ] && echo yes || echo no)"

# The wrappers: the trusted driver on main's head as data, production bucket, the key only where it signs.
: >"$HOME/sudo.log"
out=$(cmd_ota_tool ota-status $R 2>/dev/null); rc=$?
check "ota-status: each app's status, production bucket, no key, the trusted driver" "0 1 1 1" \
  "$rc $(grep -c '^status medizen android=runtime-aaaaaaaaaaa1 ios=runtime-aaaaaaaaaaa2 bucket=nadavai-app-updates key=none$' <<<"$out") $(grep -c '^status retrobarber android=runtime-bbbbbbbbbbb1 ios=runtime-bbbbbbbbbbb2 bucket=nadavai-app-updates key=none$' <<<"$out") $(grep -c " sh $t/tools/node/bin/node $t/tools/ota-step.mjs status $WORK/" "$HOME/sudo.log")"
( cmd_ota_tool ota-rollback $R medizen android reset ) >"$t/ota.out" 2>&1; rc=$?
check "ota-rollback: no --runtime means the runtime the last OTA step reached" "0 1 1" \
  "$rc $(grep -c '^rollback medizen android reset runtime-aaaaaaaaaaa1 nadavai-app-updates https://updates.nadavc.ai$' "$t/r2/publish.log") $(grep -c $'\tota-rollback\tmedizen/android reset --runtime runtime-aaaaaaaaaaa1\texit 0$' "$LOGS/deploys.log")"
check "ota-rollback: holds that platform's OTA step" "ota-rollback to reset on runtime-aaaaaaaaaaa1" "$(head -1 "$S/$R.ota-hold.medizen.android" 2>/dev/null)"
r2m medizen android runtime-aaaaaaaaaaa1 9 "$c0" apply 2026-11-06T00:00:00Z; : >"$HOME/gh.log"
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1; rc=$?
check "ota: the next step skips the held platform (no publish over a person's rollback)" "0 9 apply $c0 1" \
  "$rc $(m2 medizen android runtime-aaaaaaaaaaa1) $(ostatus "$c5" "store apps on ${c5:0:7}; .*held: medizen/android" success)"
bash "$src" ota-release $R medizen android >/dev/null 2>&1; rc=$?
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1
check "ota-release: the next step publishes there again" "0 10 apply $c5" "$rc $(m2 medizen android runtime-aaaaaaaaaaa1)"
rm -f "${S:?}/$R.ota-runtime.retrobarber.android"
( cmd_ota_tool ota-rollback $R retrobarber android reset ) >"$t/ota.out" 2>&1; rc=$?
check "ota-rollback: no runtime recorded and no --runtime refuses (2), writes nothing" "2 1 no" \
  "$rc $(grep -c 'pass --runtime' "$t/ota.out") $([ -e "$S/$R.ota-hold.retrobarber.android" ] && echo yes || echo no)"
out=$(cmd_ota_tool ota-rollback $R retrobarber android 4c1e2d3f4a5b-0f1e2d3c --runtime runtime-bbbbbbbbbbb1 2>/dev/null); rc=$?
check "ota-rollback: --runtime is passed on" "0 1" "$rc $(grep -c '^rollback retrobarber android 4c1e2d3f4a5b-0f1e2d3c runtime-bbbbbbbbbbb1 nadavai-app-updates https://updates.nadavc.ai$' "$t/r2/publish.log")"
# The rollback is published, but its hold cannot be written (a directory in its place): exit 1, and
# say that the next deploy's step would publish over it.
mkdir "$S/$R.ota-hold.retrobarber.ios"
( cmd_ota_tool ota-rollback $R retrobarber ios reset --runtime runtime-bbbbbbbbbbb2 ) >"$t/ota.out" 2>&1; rc=$?
check "ota-rollback: a hold file that cannot be written fails (1) and says why it matters" "1 1 1" \
  "$rc $(grep -c '^rollback retrobarber ios reset runtime-bbbbbbbbbbb2 ' "$t/r2/publish.log") $(grep -c "could not be written, so the next deploy's OTA step would publish over it" "$t/ota.out")"
rmdir "${S:?}/$R.ota-hold.retrobarber.ios"
rm -f "${S:?}/$R.ota-hold."*
out=$(cmd_ota_tool ota-min $R retrobarber ios 7 --message "update the app" 2>/dev/null); rc=$?
check "ota-min: the build and the message, with the app's key" "0 1" "$rc $(grep -c '^min retrobarber ios 7 update the app nadavai-app-updates$' "$t/r2/publish.log")"
for a in "ota-rollback $R medizen windows reset" "ota-rollback $R nosuch ios reset" "ota-rollback $R medizen ios ../x" "ota-min $R medizen ios seven" \
  "ota-min $R medizen ios 7 --runtime x" "ota-status $R extra" "ota-status cash-next-app" "ota-release $R medizen" "ota-off $R" "ota-on $R x" "rollback $R $(uuid 1) --bogus"; do
  bash "$src" $a >/dev/null 2>&1; rc=$?
  check "ota wrappers: '$a' is a usage error" 2 "$rc"
done

# A web rollback leaves the phones on the rolled-back deploy's bundle: it prints the ota-rollback
# per platform the OTA step reached (the bundle of the commit production serves now, else reset),
# or runs them with --with-ota.
eval "$real_lo"; tgt=$(uuid 41); echo "$c0" >"$t/cf/commit-$tgt"; echo "$(uuid 1)" >"$t/cf/canonical"
printf 'medizen android runtime-aaaaaaaaaaa1 %s-c0bundle %s\nmedizen android runtime-aaaaaaaaaaa1 %s-stub %s\n' "${c0:0:12}" "$c0" "${c5:0:12}" "$c5" >"$S/$R.ota-bundles"
for f in medizen.android:runtime-aaaaaaaaaaa1 medizen.ios:runtime-aaaaaaaaaaa2 retrobarber.android:runtime-bbbbbbbbbbb1; do echo "${f#*:}" >"$S/$R.ota-runtime.${f%%:*}"; done
rm -f "${S:?}/$R.ota-runtime.retrobarber.ios"
( cmd_rollback $R "$tgt" ) >"$t/ota.out" 2>&1; rc=$?
check "rollback: prints the exact ota-rollback of each store-app platform" "0 1 1 1 0" \
  "$rc $(grep -c "^  nadavai-deploy ota-rollback $R medizen android ${c0:0:12}-c0bundle --runtime runtime-aaaaaaaaaaa1$" "$t/ota.out") $(grep -c "^  nadavai-deploy ota-rollback $R medizen ios reset --runtime runtime-aaaaaaaaaaa2   (no bundle of ${c0:0:7}" "$t/ota.out") $(grep -c "^  nadavai-deploy ota-rollback $R retrobarber android reset --runtime runtime-bbbbbbbbbbb1 " "$t/ota.out") $(grep -c "^rollback medizen android ${c0:0:12}-c0bundle" "$t/r2/publish.log")"
echo "$(uuid 1)" >"$t/cf/canonical"
( cmd_rollback $R "$tgt" --with-ota ) >"$t/ota.out" 2>&1; rc=$?
check "rollback --with-ota: runs them, and holds those platforms" "0 1 1 3" \
  "$rc $(grep -c "^rollback medizen android ${c0:0:12}-c0bundle runtime-aaaaaaaaaaa1 nadavai-app-updates" "$t/r2/publish.log") $(grep -c '^rollback retrobarber android reset runtime-bbbbbbbbbbb1 ' "$t/r2/publish.log") $(find "$S" -name "$R.ota-hold.*" | wc -l)"
# No OTA step recorded at all (state lost): the phones are unknown, never "need no rollback".
rm -f "${S:?}/$R.ota-hold."* "${S:?}/$R.ota-runtime."*
echo "$(uuid 1)" >"$t/cf/canonical"
( cmd_rollback $R "$tgt" ) >"$t/ota.out" 2>&1; rc=$?
check "rollback: with no OTA step recorded it says OTA unknown and points at ota-status" "0 1 0" \
  "$rc $(grep -cF "OTA: unknown, no OTA step recorded; check \`nadavai-deploy ota-status $R\`" "$t/ota.out") $(grep -c 'need no rollback' "$t/ota.out")"
echo "$(uuid 1)" >"$t/cf/canonical"; n0=$(pubs)
( cmd_rollback $R "$tgt" --with-ota ) >"$t/ota.out" 2>&1; rc=$?
check "rollback --with-ota: with nothing recorded it fails (1) and runs no ota-rollback" "1 $n0" "$rc $(pubs)"
rm -f "${S:?}/$R.ota-hold."*; stubs; eval "$real_nw"; live_of() { echo "live-x $(cat "$HOME/live-commit")"; }

# A TERM during the OTA step: its units are stopped, nadavai-ota says it was interrupted.
r2m medizen android runtime-aaaaaaaaaaa1 20 "$c0" apply 2026-11-06T00:00:00Z
mkfifo "$HOME/ota-ready"; printf '#!/bin/sh\necho started >"%s"\nsleep 1\n' "$HOME/ota-ready" >"$HOME/on-ota-unit"; chmod +x "$HOME/on-ota-unit"
: >"$HOME/gh.log"; : >"$HOME/sudo.log"
( cmd_ota $R "$c5" ) >"$t/ota.out" 2>&1 &
op=$!; exec 6<>"$HOME/ota-ready"; read -r -t 30 _ <&6; kill -TERM "$op"; wait "$op"; rc=$?; exec 6<&-; rm -f "$HOME/ota-ready"
check "ota: a TERM stops the step's units and says so on nadavai-ota" "1 1 1 1" \
  "$rc $(grep -c "^systemctl stop nadavai-deploy-ota-$$-\*.service nadavai-deploy-build-$$-\*.service$" "$HOME/sudo.log") $(ostatus "$c5" "OTA interrupted" error) $(grep -c "$c5"$'\tota-interrupted' "$LOGS/deploys.log")"
check "ota: install.sh makes the nadavai-ota user and installs the vendored publisher" "1 1 1" \
  "$(grep -c '^for u in nadavai-build nadavai-upload nadavai-ota; do$' "$here/../install.sh") $(grep -c 'tools/ota/ota-publish.mjs" "$src/tools/ota/fingerprint.mjs" "$T/ota/"' "$here/../install.sh") $(grep -c '^OTA_VENDORED=(ota-publish.mjs fingerprint.mjs)$' "$src")"
printf '#!/bin/sh\nexit 1\n' >"$t/bin/sudo"

# ---- The real publisher: tools/ota-step.mjs with the vendored tools/ota (not the stub), on a small
# git clone, offline. A key pair from two generated RSA keys, and the path and symlink guards. With
# no R2_* env, a run that passed every check before R2 ends at "R2_ACCOUNT_ID is not set".
rt=$t/real rr=$t/real/repo
mkdir -p "$rt/tools/ota" "$rr/native/keys" "$rr/native/medizen/android"
cp "$here/../tools/ota-step.mjs" "$rt/tools/"; cp "$here/../tools/ota/ota-publish.mjs" "$here/../tools/ota/fingerprint.mjs" "$rt/tools/ota/"
node -e 'const { generateKeyPairSync } = require("node:crypto"); const fs = require("node:fs");
  for (const n of ["a", "b"]) { const k = generateKeyPairSync("rsa", { modulusLength: 2048 });
    fs.writeFileSync(`${process.argv[1]}/${n}.pem`, k.privateKey.export({ type: "pkcs8", format: "pem" }));
    fs.writeFileSync(`${process.argv[1]}/${n}.pub.pem`, k.publicKey.export({ type: "spki", format: "pem" })); }' "$rt"
cp "$rt/a.pub.pem" "$rr/native/keys/medizen.pub.pem"; cp "$here/fixtures/ota/pnpm-lock.yaml" "$rr/"
echo 'android {}' >"$rr/native/medizen/android/build.gradle"; echo 'export default {};' >"$rr/capacitor.config.ts"
jq -n '{schema: 1, updates: {}, apps: {medizen: {appId: "ai.example.medizen", vertical: "clinic", webDir: "dist", buildCommand: "true",
  publicKey: "native/keys/medizen.pub.pem", configInputs: [{path: "capacitor.config.ts"}], platforms: {android: {path: "native/medizen/android"}}}}}' >"$rt/apps.json"
cp "$rt/apps.json" "$rr/native/apps.json"
git -C "$rr" init -q -b main && git -C "$rr" add -A && git -C "$rr" -c user.name=t -c user.email=t@t.invalid commit -qm real; rsha=$(git -C "$rr" rev-parse HEAD)
mkdir -p "$rr/dist"; echo real >"$rr/dist/index.html"
{ printf 'u="https://updates.nadavc.ai";m=`/runtime-${f}/manifest.json`;k=`'; cat "$rt/a.pub.pem"; echo '`'; } >"$rr/dist/u.js"
rp() { # signing key -> the RESULT line of a publish of medizen android from the clone
  env -i PATH="$PATH" HOME="$t" OTA_SIGNING_KEY="$1" node "$rt/tools/ota-step.mjs" publish "$rr" medizen android "$rsha" 2026-11-07T00:00:00Z 2>&1 | grep '^RESULT'
}
reg() { jq "$1" "$rt/apps.json" >"$rr/native/apps.json"; } # a registry edit, in the clone only
check "real publisher: the service key whose pair is the commit's public key passes every check before R2" 1 \
  "$(rp "$rt/a.pem" | grep -c '^RESULT medizen android - failed - R2_ACCOUNT_ID is not set')"
check "real publisher: another generated key is refused before anything is read from R2" 1 \
  "$(rp "$rt/b.pem" | grep -c 'failed - The signing key does not match native/keys/medizen.pub.pem; refusing')"
ln -s /etc/hostname "$rr/dist/leak.txt"
check "real publisher: a symlink in the built bundle is refused" 1 "$(rp "$rt/a.pem" | grep -c 'failed - dist/leak.txt is a symlink or a special file; refusing to sign')"
rm -f "${rr:?}/dist/leak.txt"; mv "$rr/dist" "$rr/dist.real"; ln -s dist.real "$rr/dist"
check "real publisher: a bundle directory that is a symlink is refused" 1 "$(rp "$rt/a.pem" | grep -c 'failed - dist is missing, a symlink, or not a directory')"
rm -f "${rr:?}/dist"; mv "$rr/dist.real" "$rr/dist"
for p in /etc/hostname ../outside.ts 'native/../../x.ts' ''; do
  reg ".apps.medizen.configInputs[0].path = \"$p\""
  check "real publisher: configInputs path '$p' is refused" 1 "$(rp "$rt/a.pem" | grep -c "failed - medizen configInputs path \"${p//./\\.}\" in native/apps.json is not a plain path inside the repo")"
done
reg '.apps.medizen.platforms.android.path = "/etc"'
check "real publisher: an absolute platform path is refused" 1 "$(rp "$rt/a.pem" | grep -c 'failed - medizen android path "/etc" in native/apps.json is not a plain path')"
mkdir -p "$rr/cfg.real"; echo 'export default {};' >"$rr/cfg.real/c.ts"; ln -s cfg.real "$rr/cfg"; reg '.apps.medizen.configInputs[0].path = "cfg/c.ts"'
check "real publisher: a config input under a symlinked directory is refused" 1 "$(rp "$rt/a.pem" | grep -c 'failed - cfg/c.ts is a symlink, sits under one, or is not a regular file')"
reg .; rm -f "${rr:?}/native/keys/medizen.pub.pem"; ln -s "$rt/a.pub.pem" "$rr/native/keys/medizen.pub.pem"
check "real publisher: a public key that is a symlink is refused" 1 "$(rp "$rt/a.pem" | grep -c 'failed - native/keys/medizen.pub.pem is a symlink, sits under one')"
rm -f "${rr:?}/native/keys/medizen.pub.pem"; cp "$rt/a.pub.pem" "$rr/native/keys/medizen.pub.pem"
ln -s /etc/hostname "$rr/native/medizen/android/leak.gradle"; git -C "$rr" add native/medizen/android/leak.gradle
check "real publisher: a tracked symlink in the native project is refused" 1 "$(rp "$rt/a.pem" | grep -c 'failed - native/medizen/android/leak.gradle is a symlink, sits under one')"

echo "-- $n checks in all"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
