#!/usr/bin/env bash
# Tests for bin/vault-login-add, with a fake zenity and a temp vault. No real dialog opens.
#   tests/vault-login-add.sh
set -u
repo=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
mkdir "$t/bin" "$t/vault"
printf '#!/bin/sh\necho called >>"%s/zenity.calls"\nprintf "%%s\\n" "${FAKE_PW-}"\n[ -n "${FAKE_PW-}" ]\n' "$t" >"$t/bin/zenity"
chmod +x "$t/bin/zenity"
run() { PATH="$t/bin:$PATH" NADAVAI_VAULT_DIR="$t/vault" "$repo/bin/vault-login-add" "$@"; }
has() { grep -q "^LOGIN_PASSWORD='$2'\$" "$t/vault/login-$1.env" 2>/dev/null; }

printf 'from-pipe\n' | run piped https://example.test user >/dev/null 2>&1
has piped from-pipe && [ ! -e "$t/zenity.calls" ] && ok "a piped password is saved and no dialog opens" \
  || bad "a piped password was not saved, or the dialog opened"

FAKE_PW=from-dialog run agent https://example.test user </dev/null >/dev/null 2>&1
has agent from-dialog && ok "an empty stdin (an agent's shell) opens the dialog and saves what was typed" \
  || bad "with an empty stdin the dialog's password was not saved"

FAKE_PW='' run cancelled https://example.test user </dev/null >/dev/null 2>&1
[ $? -ne 0 ] && [ ! -e "$t/vault/login-cancelled.env" ] && ok "a cancelled dialog saves nothing" \
  || bad "a cancelled dialog left a file or exited 0"

[ "$(stat -c %a "$t/vault/login-agent.env")" = 600 ] && ok "the file is readable by its owner only" || bad "wrong mode on the saved file"
exit "$fail"
