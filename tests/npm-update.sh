#!/usr/bin/env bash
# tests/npm-update.sh: update_npm_globals (lib/common.sh) with a made-up npm and two made-up global
# packages. It must name the command that answered --version before the update and does not after
# it, with the version to go back to, and say nothing about a command that never started.
# shellcheck disable=SC2016,SC2034  # the checks are single-quoted and read variables inside the eval of ok()
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "${t:?}"' EXIT
PASS=0; FAIL=0
ok() { if eval "$2"; then PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

repo="$t/repo"; root="$t/root"; bin="$t/bin"
mkdir -p "$repo/lib" "$root/good" "$root/@scope/fragile" "$root/never" "$bin"
cp "$here/lib/common.sh" "$repo/lib/common.sh"
printf '%s\n' '# a comment' 'good' '@scope/fragile   # breaks in the update' 'never' 'absent' >"$repo/npm-globals.txt"
printf '%s\n' '{"name":"good","version":"1.0.0","bin":{"goodcmd":"x.js"}}' >"$root/good/package.json"
printf '%s\n' '{"name":"@scope/fragile","version":"2.3.4","bin":"x.js"}' >"$root/@scope/fragile/package.json"
printf '%s\n' '{"name":"never","version":"0.1.0","bin":{"nevercmd":"x.js"}}' >"$root/never/package.json"
printf '#!/bin/sh\necho 1.0.0\n' >"$bin/goodcmd"
printf '#!/bin/sh\necho 2.3.4\n' >"$bin/fragile"
printf '#!/bin/sh\nexit 1\n' >"$bin/nevercmd"
# The made-up npm: `root -g` prints the folder; `update -g` records its arguments and, when
# BREAK is set, leaves fragile unable to start and at a newer version.
cat >"$bin/npm" <<'NPM'
#!/bin/sh
case "$1" in
  root) echo "$FAKE_ROOT" ;;
  update)
    echo "$*" >"$FAKE_ROOT/update-args"
    if [ -n "${BREAK:-}" ]; then
      printf '#!/bin/sh\nexit 1\n' >"$FAKE_BIN/fragile"
      printf '%s\n' '{"name":"@scope/fragile","version":"3.0.0","bin":"x.js"}' >"$FAKE_ROOT/@scope/fragile/package.json"
    fi ;;
esac
NPM
chmod +x "$bin"/*
run() { FAKE_ROOT="$root" FAKE_BIN="$bin" PATH="$bin:$PATH" REPO="$repo" HOME="$t" \
  bash -c 'set -euo pipefail; source "$REPO/lib/common.sh"; update_npm_globals' 2>&1; }

out=$(run); rc=$?
ok "an update that breaks nothing ends cleanly"       '[ "$rc" = 0 ] && grep -q "every command that started before still starts" <<<"$out"'
ok "it updates exactly the listed packages"           'grep -q "^update -g good @scope/fragile never absent --fetch-retries" "$root/update-args"'
ok "a command that never started is not reported"     '! grep -q nevercmd <<<"$out"'

out=$(BREAK=1 run); rc=$?
ok "a command the update broke is named"              'grep -q "fragile answered --version before the update and does not now" <<<"$out"'
ok "with the version to go back to"                   'grep -q "npm install -g @scope/fragile@2.3.4" <<<"$out"'
ok "the script goes on after it (a warning, not a stop)" '[ "$rc" = 0 ]'
ok "the command that still starts is not reported"    '! grep -q goodcmd <<<"$out"'

: >"$repo/npm-globals.txt"; rm -f -- "$root/update-args"
out=$(run); rc=$?
ok "an empty list updates nothing"                    '[ "$rc" = 0 ] && [ ! -e "$root/update-args" ]'

echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ]
