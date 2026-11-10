#!/usr/bin/env bash
# Check a link before it is sent to Nadav as "open this".
#
# usage: early-show.sh <url> [<commit id the page must carry>]
#   exit 0  the link is on an allowed host, answers 200 without leaving the allowed hosts, a made-up
#           path under it does not answer 200, and (when a commit id is given) the page contains it
#   exit 1  one of those is false; the reason is printed
#   exit 2  usage
#
# Allowed hosts: a claude.ai artifact, or one of his own domains. More own domains:
#   EARLY_SHOW_HOSTS="example.co.il other.com" early-show.sh <url>
# Never *.vercel.app (he does not show those to anyone), also not through a redirect.
# A site that answers 200 for every path (a single-page app) passes only on its commit id.
# A claude.ai artifact sits behind a sign-in: only its address is checked, never its content.
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  [ "$#" -ge 1 ] && exit 0 || exit 2
fi

url="$1"
commit="${2:-}"
own_hosts="nadavc.ai ${EARLY_SHOW_HOSTS:-}"

# Prints the lower-case host of an https URL, or nothing when the URL is not one this script accepts.
host_of() {
  local u="$1" authority host
  case "$u" in
    https://*) ;;
    *) return 0 ;;
  esac
  authority="${u#https://}"
  authority="${authority%%[/?#]*}"
  case "$authority" in
    *@* | *\\* | *[[:space:]]* | "") return 0 ;;
  esac
  host="${authority%%:*}"
  host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"
  host="${host%.}"
  case "$host" in
    *[!a-z0-9.-]* | "" | .* | *..*) return 0 ;;
  esac
  printf '%s' "$host"
}

# 0 when the host is one of his own domains (never vercel.app, whatever EARLY_SHOW_HOSTS says).
own_host() {
  local h="$1" own
  case "$h" in
    vercel.app | *.vercel.app) return 1 ;;
  esac
  for own in $own_hosts; do
    own="$(printf '%s' "$own" | tr '[:upper:]' '[:lower:]')"
    if [ "$h" = "$own" ] || [ "${h%."$own"}" != "$h" ]; then return 0; fi
  done
  return 1
}

case "$url" in
  https://*) ;;
  *) echo "not https: $url"; exit 1 ;;
esac
host="$(host_of "$url")"
[ -n "$host" ] || { echo "the address has a user part, a strange host or no host, and is refused: $url"; exit 1; }
case "$host" in
  vercel.app | *.vercel.app) echo "a vercel.app address is never shown: $host"; exit 1 ;;
esac

if [ "$host" = "claude.ai" ]; then
  if [[ "$url" =~ ^https://claude\.ai/(code/)?artifact/[A-Za-z0-9_-]+/?$ ]]; then
    if [ -n "$commit" ]; then
      echo "ok (claude.ai artifact: address checked; the content and commit $commit were NOT checked, it is behind a sign-in)"
    else
      echo "ok (claude.ai artifact: address checked, content not fetched)"
    fi
    exit 0
  fi
  echo "a claude.ai link that is not an artifact address: $url"
  exit 1
fi

own_host "$host" || { echo "not one of his domains or a claude.ai artifact: $host (add it with EARLY_SHOW_HOSTS if it is his)"; exit 1; }

body="$(mktemp)"
trap 'rm -f -- "${body:?}"' EXIT

# Prints "<status> <final url>" after following redirects.
fetch() {
  curl -sS -L --max-redirs 5 --proto '=https' --proto-redir '=https' --max-time 20 -o "$2" -w '%{http_code} %{url_effective}' "$1" || true
}

read -r status final <<<"$(fetch "$url" "$body")"
[ "${status:-}" = "200" ] || { echo "the page answers ${status:-nothing}, not 200: $url"; exit 1; }
final_host="$(host_of "${final:-}")"
if [ -z "$final_host" ] || ! own_host "$final_host"; then
  echo "the link redirects to a host that is not his: ${final:-unknown}"
  exit 1
fi

has_commit=""
if [ -n "$commit" ]; then
  grep -qF -- "$commit" "$body" || { echo "the page does not carry commit $commit: it is an older deploy, or the build does not print its commit"; exit 1; }
  has_commit=1
fi

base="${url%%[?#]*}"
probe="${base%/}/no-such-page-$(date +%s)-$$"
read -r probe_status _ <<<"$(fetch "$probe" /dev/null)"
if [ "${probe_status:-}" = "200" ]; then
  if [ -n "$has_commit" ]; then
    echo "ok (this host answers 200 for any path, so 200 proved nothing; passed on commit $commit in the page)"
    exit 0
  fi
  echo "a made-up path also answers 200 ($probe), so 200 proves nothing here; give the commit id the page must carry"
  exit 1
fi

echo "ok"
