#!/usr/bin/env bash
# tests/npm-update.sh: update_npm_globals (lib/common.sh) with a made-up npm and made-up global
# packages. It must name the package whose check passed before the update and fails after it, with
# the version to go back to, print the versions that changed, run only the named check command,
# and say nothing about a check that never passed.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

repo="$t/repo"; root="$t/root"; bin="$t/bin"
mkdir -p "$repo/lib" "$root/good" "$root/@scope/fragile" "$root/never" "$root/nocheck" "$bin"
cp "$here/lib/common.sh" "$repo/lib/common.sh"
list() { printf '%s\n' '# a comment' 'good | goodcmd --version   # two commands, one is the check' \
  '@scope/fragile | fragile --version   # breaks in the update' 'never | nevercmd --version' 'nocheck' 'absent' >"$repo/npm-globals.txt"; }
fresh() { # the state before an update
  list
  printf '%s\n' '{"name":"good","version":"1.0.0","bin":{"goodcmd":"x.js","trapcmd":"y.js"}}' >"$root/good/package.json"
  printf '%s\n' '{"name":"@scope/fragile","version":"2.3.4","bin":"x.js"}' >"$root/@scope/fragile/package.json"
  printf '%s\n' '{"name":"never","version":"0.1.0","bin":{"nevercmd":"x.js"}}' >"$root/never/package.json"
  printf '%s\n' '{"name":"nocheck","version":"5.0.0","bin":{"nocheckcmd":"x.js"}}' >"$root/nocheck/package.json"
  printf '#!/bin/sh\necho 1.0.0\n' >"$bin/goodcmd"
  printf '#!/bin/sh\necho 2.3.4\n' >"$bin/fragile"
  printf '#!/bin/sh\nexit 1\n' >"$bin/nevercmd"
  # A second command of "good" that must never be run (lighthouse's chrome-debug opens Chrome).
  printf '#!/bin/sh\ntouch "%s"\n' "$t/trap-ran" >"$bin/trapcmd"
  printf '#!/bin/sh\ntouch "%s"\n' "$t/trap-ran" >"$bin/nocheckcmd"
  chmod +x "$bin"/*
  rm -f -- "$root/update-args" "$t/trap-ran"
}
# The made-up npm: `root -g` prints the folder; `update -g` records its arguments and moves good
# to 1.1.0; with BREAK set it also leaves fragile unable to start, at a new major version.
cat >"$bin/npm" <<'NPM'
#!/bin/sh
case "$1" in
  root) echo "$FAKE_ROOT" ;;
  update)
    echo "$*" >"$FAKE_ROOT/update-args"
    printf '%s\n' '{"name":"good","version":"1.1.0","bin":{"goodcmd":"x.js","trapcmd":"y.js"}}' >"$FAKE_ROOT/good/package.json"
    if [ -n "${BREAK:-}" ]; then
      printf '#!/bin/sh\nexit 1\n' >"$FAKE_BIN/fragile"
      printf '%s\n' '{"name":"@scope/fragile","version":"3.0.0","bin":"x.js"}' >"$FAKE_ROOT/@scope/fragile/package.json"
    fi ;;
esac
NPM
run() { FAKE_ROOT="$root" FAKE_BIN="$bin" PATH="$bin:$PATH" REPO="$repo" HOME="$t" \
  bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; update_npm_globals' 2>&1; }

fresh; out=$(run); rc=$?
ok "an update that breaks nothing ends cleanly"       '[ "$rc" = 0 ] && grep -q "every check that passed before still passes" <<<"$out"'
ok "it updates exactly the listed packages, by name"  'grep -qx "update -g good @scope/fragile never nocheck absent --fetch-retries 5 --fetch-timeout 120000" "$root/update-args"'
ok "a version that changed is printed"                'grep -q "good 1.0.0 -> 1.1.0$" <<<"$out"'
ok "a version that did not change is not printed"     '! grep -q "fragile 2.3.4" <<<"$out"'
ok "a check that never passed is not reported"        '! grep -q "never" <<<"$out"'
ok "only the named check runs, no other command of the package" '[ ! -e "$t/trap-ran" ]'

fresh; out=$(BREAK=1 run); rc=$?
ok "a package whose check the update broke is named"  'grep -q "@scope/fragile: its check passed before the update and fails now" <<<"$out"'
ok "with the version to go back to"                   'grep -q "npm install -g @scope/fragile@2.3.4$" <<<"$out"'
ok "a new major version is marked"                    'grep -q "@scope/fragile 2.3.4 -> 3.0.0 (a new major version" <<<"$out"'
ok "the script goes on after it (a warning, not a stop)" '[ "$rc" = 0 ]'
ok "the package that still passes is not reported as broken" '! grep -q "good: its check" <<<"$out"'
ok "it does not claim that every check still passes"  '! grep -q "every check that passed before still passes" <<<"$out"'

fresh; printf '%s\n' '# only a comment' '' >"$repo/npm-globals.txt"
out=$(run); rc=$?
ok "a list with no package updates nothing"           '[ "$rc" = 0 ] && [ ! -e "$root/update-args" ]'

# The repo's own list: names carry no check text, and every check names a command.
names=$(REPO="$here" bash -c 'source "$REPO/lib/common.sh"; npm_globals')
checks=$(REPO="$here" bash -c 'source "$REPO/lib/common.sh"; npm_global_checks')
ok "the repo's list gives plain package names"        '[ -n "$names" ] && ! grep -q "[| ]" <<<"$names"'
ok "every check in the repo's list belongs to a listed package and has a command" \
  '[ -n "$checks" ] && ( while IFS="|" read -r p c; do grep -qxF "$p" <<<"$names" && [ -n "$c" ] || exit 1; done <<<"$checks" )'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
