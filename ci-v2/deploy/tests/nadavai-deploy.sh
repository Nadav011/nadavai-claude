#!/usr/bin/env bash
# shellcheck disable=SC2034,SC2154,SC2329  # the sourced script's globals, and stubs it calls
# Offline tests of nadavai-deploy. The 37 checks of nadavai-ci's tests/nadavai-ci-hold.sh (9ca934d:
# lock order, hold, release, hold-status, rollback refusals, pages-live), ported to this service,
# plus the gate, the dry run, the auto pass and the clean upload environment. A scratch HOME, stub
# gh, curl and sudo: nothing reaches GitHub, Cloudflare, Vercel or a real ~/deploy.
#   tests/nadavai-deploy.sh [path to nadavai-deploy, default ../bin/nadavai-deploy]
set -u
umask 077
src=$(realpath "${1:-$(dirname "$0")/../bin/nadavai-deploy}")
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
export HOME=$t NADAVAI_DEPLOY_HOME=$t/deploy NADAVAI_DEPLOY_WORK=$t/work NADAVAI_DEPLOY_TOOLS=$t/tools \
  NADAVAI_DEPLOY_CACHE=$t/cache NADAVAI_DEPLOY_RETRY_SLEEP=0
mkdir -p "$t/bin" "$t/cf" "$t/deploy/secrets" "$t/deploy/state" "$t/work"
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

echo "-- $n checks in all"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
