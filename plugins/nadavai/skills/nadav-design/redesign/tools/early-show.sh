#!/usr/bin/env bash
# Check a link before it is sent to Nadav as "open this".
#
# usage: early-show.sh <url> [<commit id the page must carry>]
#   exit 0  the link is on an allowed host, answers 200, does not answer 200 for a made-up path
#           under it, and (when a commit id is given) the page contains it
#   exit 1  one of those is false; the reason is printed
#   exit 2  usage
#
# Allowed hosts: a claude.ai artifact, or one of his own domains. More own domains:
#   EARLY_SHOW_HOSTS="example.co.il other.com" early-show.sh <url>
# Never *.vercel.app (he does not show those to anyone).
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  [ "$#" -ge 1 ] && exit 0 || exit 2
fi

url="$1"
commit="${2:-}"
own_hosts="nadavc.ai ${EARLY_SHOW_HOSTS:-}"

case "$url" in
  https://*) ;;
  *) echo "not https: $url"; exit 1 ;;
esac

host="${url#https://}"
host="${host%%/*}"
host="${host%%:*}"

ok_host=""
case "$host" in
  *.vercel.app | vercel.app) echo "a vercel.app address is never shown: $host"; exit 1 ;;
  claude.ai) case "$url" in https://claude.ai/artifact/* | https://claude.ai/code/artifact/*) ok_host=1 ;; esac ;;
esac
if [ -z "$ok_host" ]; then
  for own in $own_hosts; do
    if [ "$host" = "$own" ] || [ "${host%."$own"}" != "$host" ]; then ok_host=1; break; fi
  done
fi
[ -n "$ok_host" ] || { echo "not one of his domains or a claude.ai artifact: $host (add it with EARLY_SHOW_HOSTS if it is his)"; exit 1; }

# A claude.ai artifact sits behind a sign-in, so only its address can be checked from here.
if [ "$host" = "claude.ai" ]; then
  echo "ok (claude.ai artifact: address checked, content not fetched)"
  exit 0
fi

body="$(mktemp)"
trap 'rm -f -- "${body:?}"' EXIT
status="$(curl -sS -L --max-time 20 -o "$body" -w '%{http_code}' "$url" || true)"
[ "$status" = "200" ] || { echo "the page answers $status, not 200: $url"; exit 1; }

probe="${url%/}/no-such-page-$(date +%s)-$$"
probe_status="$(curl -sS -L --max-time 20 -o /dev/null -w '%{http_code}' "$probe" || true)"
if [ "$probe_status" = "200" ]; then
  echo "a made-up path also answers 200 ($probe), so 200 proves nothing here; check the page by its content"
  exit 1
fi

if [ -n "$commit" ]; then
  grep -q -- "$commit" "$body" || { echo "the page does not carry commit $commit: it is an older deploy, or the build does not print its commit"; exit 1; }
fi

echo "ok"
