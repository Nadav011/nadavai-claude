#!/usr/bin/env bash
# Tests for config/home-pyrightconfig.json and link_home_pyright (lib/common.sh), in a temp HOME.
#   tests/home-pyright.sh
set -u
repo=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
install_into() { # runs link_home_pyright with HOME=$1, prints what it logged
  HOME=$1 REPO=$repo bash -c 'source "$REPO/lib/common.sh"; link_home_pyright' 2>&1
}

mkdir "$t/home"
install_into "$t/home" >/dev/null
cmp -s "$repo/config/home-pyrightconfig.json" "$t/home/pyrightconfig.json" \
  && ok "a home without the file gets it" || bad "the file was not written to an empty home"
out=$(install_into "$t/home")
case $out in *"is current"*) ok "a second run changes nothing" ;; *) bad "a second run said: $out" ;; esac

mkdir "$t/own"; printf '{ "include": ["src"] }\n' >"$t/own/pyrightconfig.json"
out=$(install_into "$t/own")
grep -q '"include"' "$t/own/pyrightconfig.json" && case $out in *differs*) true ;; *) false ;; esac \
  && ok "a home with its own pyrightconfig.json keeps it, with a warning" \
  || bad "an existing different file was not kept: $out"

if command -v pyright >/dev/null 2>&1; then
  analysed() { (cd "$1" && pyright --outputjson 2>/dev/null) | python3 -I -c \
    'import json,sys; print(json.load(sys.stdin)["summary"]["filesAnalyzed"])' 2>/dev/null; }
  mkdir -p "$t/plain/sub" "$t/home/sub"
  for d in "$t/plain" "$t/home"; do printf 'x: int = 1\n' >"$d/a.py"; printf 'y: int = 2\n' >"$d/sub/b.py"; done
  n=$(analysed "$t/plain"); [ "$n" = 2 ] && ok "without the file pyright loads every .py file ($n)" \
    || bad "without the file pyright analysed '$n' files, expected 2"
  n=$(analysed "$t/home"); [ "$n" = 0 ] && ok "with the file it loads none by itself ($n)" \
    || bad "with the file pyright analysed '$n' files, expected 0"
else
  echo "skip pyright is not installed: the effect on the server was not checked"
fi
exit "$fail"
