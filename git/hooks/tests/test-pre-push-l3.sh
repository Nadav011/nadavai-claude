#!/usr/bin/env bash
# test-pre-push-l3.sh — planted-bug-style test for the Layer 3 auto-rollback pipeline.
# Sources the real lib (~/.git-hooks/lib/cf-autodeploy.sh) and overrides wrangler/node/
# notify-send/curl with mock functions so nothing here touches a real Cloudflare account
# or a real site. No network calls, no real deploy.
set -uo pipefail
LIB="$HOME/.git-hooks/lib/cf-autodeploy.sh"
source "$LIB"

PASS=0; FAIL=0
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

setup_repo() {  # dir  pass|fail
  local dir="$1" mode="$2"
  mkdir -p "$dir"
  printf '{"scripts":{"build":"true"}}' > "$dir/package.json"
  printf 'process.exit(%s);\n' "$([ "$mode" = "pass" ] && echo 0 || echo 1)" > "$dir/.cf-healthcheck.mjs"
}

# ── mocks (no real network, no real wrangler/CF calls) ─────────────────────
mock_wrangler() {
  case "$*" in
    *"deployment list"*) echo '[{"id":"dep-new-broken"},{"id":"dep-prev-good"}]' ;;
    *) echo "[mock wrangler] $*" >&2 ;;
  esac
  return 0
}
mock_notify() { echo "notify: $*" >> "$NOTIFY_LOG"; return 0; }
mock_curl() { echo '{"success":true,"result":{"id":"dep-prev-good"}}'; return 0; }
mock_curl_reject() { echo '{"success":false,"errors":[{"message":"forced test rejection"}]}'; return 0; }
export -f mock_wrangler mock_notify mock_curl mock_curl_reject

run_case_pass() {
  echo "=== CASE: healthcheck success -> no rollback ==="
  local dir="$TMPROOT/pass-repo" log="$TMPROOT/pass.log"
  setup_repo "$dir" pass
  NOTIFY_LOG="$TMPROOT/notify-pass.log"; : > "$NOTIFY_LOG"
  WRANGLER_BIN=mock_wrangler NODE_BIN=node NOTIFY_BIN=mock_notify CURL_BIN=mock_curl \
    cf_autodeploy_pipeline "$dir" "test-project" "$log" > "$log" 2>&1
  local rc=$?
  echo "--- pipeline output ---"; cat "$log"
  if [ "$rc" -eq 0 ] && ! grep -q "ROLLBACK" "$log" && [ ! -s "$NOTIFY_LOG" ]; then
    echo "PASS: healthcheck-success-no-rollback"; PASS=$((PASS+1))
  else
    echo "FAIL: healthcheck-success-no-rollback (rc=$rc)"; FAIL=$((FAIL+1))
  fi
  echo
}

run_case_fail() {
  echo "=== CASE: healthcheck failure -> rollback called + notify fired + marker written ==="
  local dir="$TMPROOT/fail-repo" log="$TMPROOT/fail.log"
  setup_repo "$dir" fail
  NOTIFY_LOG="$TMPROOT/notify-fail.log"; : > "$NOTIFY_LOG"
  export DEPLOY_FAILURES_DIR="$TMPROOT/deploy-failures"
  export CLOUDFLARE_API_TOKEN="test-token"
  export CLOUDFLARE_ACCOUNT_ID="test-account"
  WRANGLER_BIN=mock_wrangler NODE_BIN=node NOTIFY_BIN=mock_notify CURL_BIN=mock_curl \
    cf_autodeploy_pipeline "$dir" "test-project" "$log" > "$log" 2>&1
  local rc=$?
  echo "--- pipeline output ---"; cat "$log"
  echo "--- notify mock captured ---"; cat "$NOTIFY_LOG" 2>/dev/null
  local marker_count marker_file
  marker_count=$(find "$DEPLOY_FAILURES_DIR" -type f 2>/dev/null | wc -l)
  marker_file=$(find "$DEPLOY_FAILURES_DIR" -type f 2>/dev/null | head -1)
  echo "--- marker files found: $marker_count ---"
  [ -n "$marker_file" ] && { echo "--- marker content ($marker_file) ---"; cat "$marker_file"; }
  if [ "$rc" -ne 0 ] && grep -q "ROLLBACK: SUCCESS" "$log" && [ -s "$NOTIFY_LOG" ] && [ "$marker_count" -ge 1 ]; then
    echo "PASS: healthcheck-fail-rollback-notify-marker"; PASS=$((PASS+1))
  else
    echo "FAIL: healthcheck-fail-rollback-notify-marker (rc=$rc, marker_count=$marker_count)"; FAIL=$((FAIL+1))
  fi
  echo
}

run_case_rollback_api_rejects() {
  # PLANTED-BUG CHECK: proves the test suite can actually FAIL a broken rollback_pages()
  # (e.g. one that returns 0 regardless of the API response) instead of rubber-stamping it.
  echo "=== CASE: healthcheck failure + rollback API rejects -> reported as FAILED, still alerts ==="
  local dir="$TMPROOT/reject-repo" log="$TMPROOT/reject.log"
  setup_repo "$dir" fail
  NOTIFY_LOG="$TMPROOT/notify-reject.log"; : > "$NOTIFY_LOG"
  export DEPLOY_FAILURES_DIR="$TMPROOT/deploy-failures-reject"
  export CLOUDFLARE_API_TOKEN="test-token"
  export CLOUDFLARE_ACCOUNT_ID="test-account"
  WRANGLER_BIN=mock_wrangler NODE_BIN=node NOTIFY_BIN=mock_notify CURL_BIN=mock_curl_reject \
    cf_autodeploy_pipeline "$dir" "test-project" "$log" > "$log" 2>&1
  local rc=$?
  echo "--- pipeline output ---"; cat "$log"
  if [ "$rc" -ne 0 ] && grep -q "ROLLBACK: FAILED" "$log" && [ -s "$NOTIFY_LOG" ]; then
    echo "PASS: rollback-api-rejects-reported-as-failed"; PASS=$((PASS+1))
  else
    echo "FAIL: rollback-api-rejects-reported-as-failed (rc=$rc)"; FAIL=$((FAIL+1))
  fi
  echo
}

run_case_after_push() {
  # D7: only a push that landed deploys, and it deploys the pushed sha, not the working folder.
  echo "=== CASE: deploy waits for the push to land, then builds the pushed sha in a clean worktree ==="
  local bare="$TMPROOT/remote.git" repo="$TMPROOT/clone" log="$TMPROOT/after.log" sha other pid rc
  git init -q --bare -b main "$bare"
  git init -q -b main "$repo" && git -C "$repo" config user.email t@t.invalid && git -C "$repo" config user.name t
  git -C "$repo" config core.hooksPath /dev/null
  printf '{"scripts":{"build":"mkdir -p dist && git rev-parse HEAD > dist/built-from && cp .env dist/env"}}' >"$repo/package.json"
  printf '.env\n' >"$repo/.gitignore"; echo 'VITE_SUPABASE_URL=https://abc.supabase.co' >"$repo/.env"
  git -C "$repo" add -A && git -C "$repo" commit -qm one && git -C "$repo" remote add origin "$bare"
  git -C "$repo" push -q origin main; sha=$(git -C "$repo" rev-parse HEAD)
  echo "dirty, not pushed" >"$repo/index.html"   # the working folder differs from what was pushed
  mkdir -p "$repo/node_modules"
  deploy_dir() { echo "$PWD" >"$TMPROOT/deployed-from"; cp dist/built-from "$TMPROOT/built-from" 2>/dev/null; cp dist/env "$TMPROOT/built-env" 2>/dev/null; }
  mock_wrangler_dir() { case "$*" in *"pages deploy"*) deploy_dir ;; esac; return 0; }
  export -f mock_wrangler_dir deploy_dir; export TMPROOT
  sleep 1 & pid=$!
  WRANGLER_BIN=mock_wrangler_dir NOTIFY_BIN=true cf_autodeploy_after_push "$repo" test-project "$log" "$sha" origin main "$pid" >"$log" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ] && [ "$(cat "$TMPROOT/built-from" 2>/dev/null)" = "$sha" ] && [ "$(cat "$TMPROOT/deployed-from")" != "$repo" ] &&
     grep -q abc.supabase.co "$TMPROOT/built-env" 2>/dev/null &&
     [ -z "$(git -C "$repo" worktree list | sed 1d)" ]; then
    echo "PASS: landed-push-deploys-pushed-sha-from-clean-worktree-with-its-env"; PASS=$((PASS+1))
  else
    echo "FAIL: landed push (rc=$rc built=$(cat "$TMPROOT/built-from" 2>/dev/null) from=$(cat "$TMPROOT/deployed-from" 2>/dev/null))"; cat "$log"; FAIL=$((FAIL+1))
  fi
  rm -f "$TMPROOT/deployed-from" "$TMPROOT/built-from"
  rm -f "$repo/index.html"; echo two >"$repo/two.txt"; git -C "$repo" add two.txt; git -C "$repo" commit -qm two
  other=$(git -C "$repo" rev-parse HEAD)   # never pushed: as if the push was rejected
  sleep 1 & pid=$!
  WRANGLER_BIN=mock_wrangler_dir NOTIFY_BIN=true cf_autodeploy_after_push "$repo" test-project "$log" "$other" origin main "$pid" >"$log" 2>&1
  if [ ! -e "$TMPROOT/deployed-from" ] && grep -q "did not land" "$log"; then
    echo "PASS: rejected-push-deploys-nothing"; PASS=$((PASS+1))
  else
    echo "FAIL: a push that did not land deployed"; cat "$log"; FAIL=$((FAIL+1))
  fi
  echo
}

run_case_pass
run_case_fail
run_case_rollback_api_rejects
run_case_after_push

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
