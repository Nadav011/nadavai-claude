#!/usr/bin/env bash
# test-pre-push-affected-tests.sh — the Layer 2 "tests that touch this push" gate.
#
# Runs the REAL hook against throwaway git repos with a fake `npx` on PATH, so
# nothing here installs vitest or reaches the network. The fake records the
# arguments it was handed and exits with whatever the case asks for, which is
# what lets these assert the two things that actually matter: that the gate
# blocks a push whose affected tests fail, and that it picks the right base.
set -uo pipefail
HOOK="$HOME/.git-hooks/pre-push"

PASS=0; FAIL=0
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL: $1 — $2"; FAIL=$((FAIL+1)); }

# A repo with two commits, so HEAD~1 resolves, and a package.json that either
# does or does not put vitest where has_vitest looks.
setup_repo() {  # dir  with-vitest|without-vitest
  local dir="$1" mode="$2"
  mkdir -p "$dir"; cd "$dir"
  git init -q .
  # The hook runs from a real checkout; keep this repo off the user's own hooks.
  git config core.hooksPath /dev/null
  git config user.email t@t.t; git config user.name t
  if [ "$mode" = "with-vitest" ]; then
    printf '{"devDependencies":{"vitest":"4.0.0"}}' > package.json
  else
    printf '{"devDependencies":{"jest":"29.0.0"}}' > package.json
  fi
  echo one > a.txt; git add -A; git commit -qm one
  echo two > a.txt; git add -A; git commit -qm two
  cd - >/dev/null
}

# `npx` is the only thing the new layer shells out to. trivy is absent in this
# harness, so Layer 1 is skipped by its own `command -v` guard.
make_fake_npx() {  # dir  exit_code
  local dir="$1" code="$2"
  mkdir -p "$dir/bin"
  cat > "$dir/bin/npx" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$dir/npx-args.txt"
exit $code
EOF
  chmod +x "$dir/bin/npx"
}

# The hook reads its refs from stdin, the way git feeds it.
run_hook() {  # dir  remote_sha
  local dir="$1" sha="$2"
  cd "$dir"
  printf 'refs/heads/main %s refs/heads/main %s\n' "$(git rev-parse HEAD)" "$sha" \
    | PATH="$dir/bin:$PATH" bash "$HOOK" > "$dir/out.txt" 2>&1
  local rc=$?
  cd - >/dev/null
  return $rc
}

case_blocks_on_failure() {
  echo "=== CASE: affected tests fail -> push to main is blocked ==="
  local d="$TMPROOT/fail"; setup_repo "$d" with-vitest; make_fake_npx "$d" 1
  if run_hook "$d" "0000000000000000000000000000000000000000"; then
    bad blocks-on-failure "the hook exited 0 although the tests failed"
  else
    grep -q "tests touching this push failed" "$d/out.txt" \
      && ok blocks-on-failure \
      || bad blocks-on-failure "blocked, but without saying why: $(cat "$d/out.txt")"
  fi
}

case_passes_when_green() {
  echo "=== CASE: affected tests pass -> push proceeds ==="
  local d="$TMPROOT/green"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  if run_hook "$d" "0000000000000000000000000000000000000000"; then
    grep -q "affected tests passed" "$d/out.txt" \
      && ok passes-when-green \
      || bad passes-when-green "exited 0 but never ran the layer: $(cat "$d/out.txt")"
  else
    bad passes-when-green "blocked a green push: $(cat "$d/out.txt")"
  fi
}

case_base_is_the_remote() {
  echo "=== CASE: the base is what the remote already has, not just the last commit ==="
  local d="$TMPROOT/base"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  local first; first=$(cd "$d" && git rev-parse HEAD~1)
  run_hook "$d" "$first" || true
  if grep -q -- "--changed $first" "$d/npx-args.txt" 2>/dev/null; then
    ok base-is-the-remote
  else
    bad base-is-the-remote "expected --changed $first, got: $(cat "$d/npx-args.txt" 2>/dev/null)"
  fi
}

case_new_branch_falls_back() {
  echo "=== CASE: a remote that has no such branch falls back to the last commit ==="
  local d="$TMPROOT/newbranch"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  run_hook "$d" "0000000000000000000000000000000000000000" || true
  if grep -q -- "--changed HEAD~1" "$d/npx-args.txt" 2>/dev/null; then
    ok new-branch-falls-back
  else
    bad new-branch-falls-back "expected --changed HEAD~1, got: $(cat "$d/npx-args.txt" 2>/dev/null)"
  fi
}

case_unknown_sha_falls_back() {
  echo "=== CASE: a sha this clone cannot resolve falls back rather than erroring ==="
  local d="$TMPROOT/unknown"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  run_hook "$d" "dead0000dead0000dead0000dead0000dead0000" || true
  if grep -q -- "--changed HEAD~1" "$d/npx-args.txt" 2>/dev/null; then
    ok unknown-sha-falls-back
  else
    bad unknown-sha-falls-back "expected the fallback, got: $(cat "$d/npx-args.txt" 2>/dev/null)"
  fi
}

case_skips_without_vitest() {
  echo "=== CASE: a repo not on vitest is left alone (--changed is a vitest flag) ==="
  local d="$TMPROOT/novitest"; setup_repo "$d" without-vitest; make_fake_npx "$d" 1
  # The fake npx would exit 1 if it were called at all.
  if run_hook "$d" "0000000000000000000000000000000000000000"; then
    [ ! -f "$d/npx-args.txt" ] \
      && ok skips-without-vitest \
      || bad skips-without-vitest "ran vitest on a jest repo: $(cat "$d/npx-args.txt")"
  else
    bad skips-without-vitest "blocked a repo it should not have touched: $(cat "$d/out.txt")"
  fi
}

case_blocks_on_failure
case_passes_when_green
case_base_is_the_remote
case_new_branch_falls_back
case_unknown_sha_falls_back
case_skips_without_vitest

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
