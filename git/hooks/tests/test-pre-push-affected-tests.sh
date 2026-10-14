#!/usr/bin/env bash
# test-pre-push-affected-tests.sh — the Layer 2 "tests that touch this push" gate.
#
# Runs the REAL hook against throwaway git repos with fake `npx`, `npm` and `trivy`
# on PATH, so nothing here installs vitest or reaches the network. Each fake records
# the arguments it was handed and exits with whatever the case asks for, which is
# what lets these assert the things that actually matter: that the gate blocks a
# push whose affected tests fail, that it hands vitest every changed file of the
# whole pushed range, that it falls back to the full suite when the import graph
# cannot see the change, and that trivy, typecheck and tests run side by side.
#
# HOOK may point at another copy of the hook (a staged edit) instead of the live one.
set -uo pipefail
HOOK="${HOOK:-$HOME/.git-hooks/pre-push}"

PASS=0; FAIL=0
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
# The hook puts $HOME/.local/bin first. Each run gets its own HOME, and every repo a
# quiet fake trivy there, so the real one (in ~/.local/bin and /usr/bin) never scans.

ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL: $1 — $2"; FAIL=$((FAIL+1)); }

# A repo with two commits, so HEAD~1 resolves, and a package.json that either
# does or does not put vitest where has_vitest looks. The second commit changes
# a code file, so `vitest related` has something to be handed.
setup_repo() {  # dir  with-vitest|without-vitest  [typecheck]
  local dir="$1" mode="$2" tc="${3:-}" scripts=""
  mkdir -p "$dir/src" "$dir/home"; cd "$dir"
  git init -q .
  # The hook runs from a real checkout; keep this repo off the user's own hooks.
  git config core.hooksPath /dev/null
  git config user.email t@t.t; git config user.name t
  # The fakes and the run's records live beside the repo's files, never in a commit.
  printf '%s\n' bin/ home/ '*-args.txt' '*-times.txt' out.txt >> .git/info/exclude
  [ -n "$tc" ] && scripts=',"scripts":{"typecheck":"tsc"}'
  if [ "$mode" = "with-vitest" ]; then
    printf '{"devDependencies":{"vitest":"4.0.0"}%s}' "$scripts" > package.json
  else
    printf '{"devDependencies":{"jest":"29.0.0"}%s}' "$scripts" > package.json
  fi
  echo one > a.txt; echo 'export const a = 1' > src/a.ts; git add -A; git commit -qm one
  echo 'export const a = 2' > src/a.ts; git add -A; git commit -qm two
  cd - >/dev/null
  make_fake "$dir" trivy 0
}

# Adds one commit to the repo: `commit_change dir path [content|--delete]`.
commit_change() {
  local dir="$1" path="$2" content="${3:-x}"
  cd "$dir"
  if [ "$content" = "--delete" ]; then git rm -q "$path"
  else mkdir -p "$(dirname "$path")"; echo "$content" > "$path"; git add -A; fi
  git commit -qm "change $path"
  cd - >/dev/null
}

# A fake command on the run's PATH: records "$@" to <name>-args.txt, optionally
# sleeps, then exits with the given code. Extra stdout can be given.
make_fake() {  # dir  name  exit_code  [sleep_s]  [stdout]
  local dir="$1" name="$2" code="$3" nap="${4:-0}" out="${5:-}" bindir="$1/bin"
  [ "$name" = trivy ] && bindir="$1/home/.local/bin"
  mkdir -p "$bindir"
  cat > "$bindir/$name" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$dir/$name-args.txt"
echo "start \$(date +%s.%N)" >> "$dir/$name-times.txt"
sleep $nap
printf '%b' '$out'
exit $code
EOF
  chmod +x "$bindir/$name"
}
make_fake_npx() { make_fake "$1" npx "$2" "${3:-0}"; }

# The hook reads its refs from stdin, the way git feeds it.
run_hook() {  # dir  remote_sha  [branch]
  local dir="$1" sha="$2" branch="${3:-main}"
  cd "$dir"
  printf 'refs/heads/%s %s refs/heads/%s %s\n' "$branch" "$(git rev-parse HEAD)" "$branch" "$sha" \
    | HOME="$dir/home" PATH="$dir/bin:$PATH" bash "$HOOK" > "$dir/out.txt" 2>&1
  local rc=$?
  cd - >/dev/null
  return $rc
}
ZERO=0000000000000000000000000000000000000000
args() { cat "$1/npx-args.txt" 2>/dev/null; }

case_blocks_on_failure() {
  echo "=== CASE: affected tests fail -> push to main is blocked ==="
  local d="$TMPROOT/fail"; setup_repo "$d" with-vitest; make_fake_npx "$d" 1
  local first; first=$(cd "$d" && git rev-parse HEAD~1)
  if run_hook "$d" "$first"; then
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
  local first; first=$(cd "$d" && git rev-parse HEAD~1)
  if run_hook "$d" "$first"; then
    grep -q "affected tests passed" "$d/out.txt" \
      && ok passes-when-green \
      || bad passes-when-green "exited 0 but never ran the layer: $(cat "$d/out.txt")"
  else
    bad passes-when-green "blocked a green push: $(cat "$d/out.txt")"
  fi
}

case_base_is_the_remote() {
  echo "=== CASE: vitest related gets the files changed since what the remote has ==="
  local d="$TMPROOT/base"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  local first; first=$(cd "$d" && git rev-parse HEAD~1)
  run_hook "$d" "$first" || true
  if [ "$(args "$d")" = "vitest related --run --passWithNoTests src/a.ts" ]; then
    ok base-is-the-remote
  else
    bad base-is-the-remote "expected related over src/a.ts, got: $(args "$d")"
  fi
}

case_full_pushed_range() {
  echo "=== CASE: every changed file of a multi-commit push, test files included ==="
  local d="$TMPROOT/range"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  local base; base=$(cd "$d" && git rev-parse HEAD~1)
  commit_change "$d" src/b.ts 'export const b = 1'
  commit_change "$d" src/b.test.ts 'import "./b"'
  commit_change "$d" README.md 'docs'
  run_hook "$d" "$base" || true
  local a; a=$(args "$d")
  if [[ $a == "vitest related --run --passWithNoTests "* ]] && [[ $a == *" src/a.ts"* ]] &&
     [[ $a == *" src/b.ts"* ]] && [[ $a == *" src/b.test.ts"* ]] && [[ $a != *README* ]]; then
    ok full-pushed-range
  else
    bad full-pushed-range "expected src/a.ts src/b.ts src/b.test.ts, got: $a"
  fi
}

case_new_branch_runs_full() {
  echo "=== CASE: a remote that has no such branch yet gets the full suite ==="
  local d="$TMPROOT/newbranch"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  run_hook "$d" "$ZERO" || true
  [ "$(args "$d")" = "vitest run --passWithNoTests" ] && grep -q "base of the push is not known" "$d/out.txt" \
    && ok new-branch-runs-full \
    || bad new-branch-runs-full "expected the full suite, got: $(args "$d")"
}

case_unknown_sha_runs_full() {
  echo "=== CASE: a sha this clone cannot resolve gets the full suite rather than erroring ==="
  local d="$TMPROOT/unknown"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  run_hook "$d" "dead0000dead0000dead0000dead0000dead0000" || true
  [ "$(args "$d")" = "vitest run --passWithNoTests" ] \
    && ok unknown-sha-runs-full \
    || bad unknown-sha-runs-full "expected the full suite, got: $(args "$d")"
}

# Each of these changes one file the import graph cannot account for.
case_full_triggers() {
  echo "=== CASE: force-rerun triggers, unclassified and deleted files run the full suite ==="
  local spec path content name d base
  for spec in "package.json|{\"devDependencies\":{\"vitest\":\"4.0.1\"}}" "pnpm-lock.yaml|x" "vitest.config.ts|x" "vite.config.ts|x" \
              "tsconfig.json|{}" "tests/setup.ts|x" "src/vitest.setup.ts|x" ".env.test|X=1" \
              "tests/fixtures/data.json|{}" "src/__snapshots__/a.test.ts.snap|x" \
              "supabase/migrations/1_init.sql|select 1" "scripts/run.sh|true" "src/a.ts|--delete"; do
    path=${spec%%|*}; content=${spec#*|}; name=$(tr '/.' '__' <<<"$path")
    d="$TMPROOT/trigger-$name"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
    base=$(cd "$d" && git rev-parse HEAD)
    commit_change "$d" "$path" "$content"
    run_hook "$d" "$base" || true
    if [ "$(args "$d")" = "vitest run --passWithNoTests" ]; then
      ok "full-trigger $path${content:+ ($content)}"
    else
      bad "full-trigger $path" "expected the full suite, got: $(args "$d")"
    fi
  done
}

case_docs_only_runs_nothing() {
  echo "=== CASE: a docs-only push hands vitest nothing and passes ==="
  local d="$TMPROOT/docs"; setup_repo "$d" with-vitest; make_fake_npx "$d" 1
  local base; base=$(cd "$d" && git rev-parse HEAD)
  commit_change "$d" docs/guide.md 'hello'
  commit_change "$d" .github/workflows/ci.yml 'on: push'
  if run_hook "$d" "$base" && [ ! -f "$d/npx-args.txt" ]; then
    ok docs-only-runs-nothing
  else
    bad docs-only-runs-nothing "rc or npx call unexpected: $(args "$d") / $(cat "$d/out.txt")"
  fi
}

case_skips_without_vitest() {
  echo "=== CASE: a repo not on vitest is left alone (related is a vitest command) ==="
  local d="$TMPROOT/novitest"; setup_repo "$d" without-vitest; make_fake_npx "$d" 1
  # The fake npx would exit 1 if it were called at all.
  if run_hook "$d" "$ZERO"; then
    [ ! -f "$d/npx-args.txt" ] \
      && ok skips-without-vitest \
      || bad skips-without-vitest "ran vitest on a jest repo: $(cat "$d/npx-args.txt")"
  else
    bad skips-without-vitest "blocked a repo it should not have touched: $(cat "$d/out.txt")"
  fi
}

case_typecheck_via_repo_script() {
  echo "=== CASE: typecheck runs the repo's own script, and its failure blocks ==="
  local d="$TMPROOT/tc"; setup_repo "$d" with-vitest typecheck; make_fake_npx "$d" 0
  make_fake "$d" npm 1
  local first; first=$(cd "$d" && git rev-parse HEAD~1)
  if run_hook "$d" "$first"; then
    bad typecheck-via-repo-script "a failed typecheck did not block"
  elif [ "$(cat "$d/npm-args.txt" 2>/dev/null)" = "run typecheck" ] && grep -q "typecheck failed" "$d/out.txt"; then
    ok typecheck-via-repo-script
  else
    bad typecheck-via-repo-script "npm got: $(cat "$d/npm-args.txt" 2>/dev/null); $(cat "$d/out.txt")"
  fi
}

case_runs_in_parallel() {
  echo "=== CASE: trivy, typecheck and tests run side by side (wall = slowest) ==="
  local d="$TMPROOT/par"; setup_repo "$d" with-vitest typecheck
  make_fake "$d" npx 0 2; make_fake "$d" npm 0 2; make_fake "$d" trivy 0 2
  local first t0 t1; first=$(cd "$d" && git rev-parse HEAD~1)
  t0=$(date +%s.%N); run_hook "$d" "$first"; local rc=$?; t1=$(date +%s.%N)
  local wall; wall=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f", b-a}')
  if [ $rc -eq 0 ] && [ -f "$d/trivy-args.txt" ] && [ -f "$d/npm-args.txt" ] && [ -f "$d/npx-args.txt" ] &&
     awk -v w="$wall" 'BEGIN{exit !(w < 4.5)}'; then
    ok "runs-in-parallel (three 2 s checks in ${wall}s)"
  else
    bad runs-in-parallel "rc=$rc wall=${wall}s (serial would be 6 s+): $(cat "$d/out.txt")"
  fi
}

case_trivy_blocks_every_branch() {
  echo "=== CASE: trivy still runs and blocks on a feature-branch push ==="
  local d="$TMPROOT/trivy"; setup_repo "$d" with-vitest; make_fake_npx "$d" 0
  make_fake "$d" trivy 0 0 '│ lib │ CVE-1 │ CRITICAL │\n'
  local first; first=$(cd "$d" && git rev-parse HEAD~1)
  if run_hook "$d" "$first" feature/x; then
    bad trivy-blocks-every-branch "a CRITICAL finding did not block the branch push"
  elif grep -q "CRITICAL CVEs found" "$d/out.txt" && [ ! -f "$d/npx-args.txt" ]; then
    ok trivy-blocks-every-branch
  else
    bad trivy-blocks-every-branch "$(cat "$d/out.txt"); npx: $(args "$d")"
  fi
}

case_blocks_on_failure
case_passes_when_green
case_base_is_the_remote
case_full_pushed_range
case_new_branch_runs_full
case_unknown_sha_runs_full
case_full_triggers
case_docs_only_runs_nothing
case_skips_without_vitest
case_typecheck_via_repo_script
case_runs_in_parallel
case_trivy_blocks_every_branch

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
