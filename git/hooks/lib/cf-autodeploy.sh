#!/usr/bin/env bash
# cf-autodeploy.sh — Cloudflare Pages background auto-deploy + healthcheck + rollback.
# Sourced by ~/.git-hooks/pre-push (Layer 3) and by
# ~/.git-hooks/tests/test-pre-push-l3.sh (with wrangler/node/curl/notify-send mocked).
#
# Env overrides used only by tests: WRANGLER_BIN, NODE_BIN, NOTIFY_BIN, CURL_BIN
# (each defaults to the real command name so production behavior is unchanged).

rollback_pages() {
  # ponytail: Cloudflare Pages has no wrangler CLI rollback (only `wrangler rollback`
  # for Workers). This calls the documented REST endpoint directly — the same one the
  # dashboard's "Rollback to this deployment" button uses. Upgrade path: if wrangler
  # ever ships `wrangler pages deployment rollback`, swap this for that.
  local cf_project="$1"
  local wrangler="${WRANGLER_BIN:-npx --yes wrangler@latest}"
  local node="${NODE_BIN:-node}"
  local curl_bin="${CURL_BIN:-curl}"

  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "missing CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID — cannot rollback"
    return 1
  fi

  # Deployment list is newest-first; index 0 is the just-deployed (broken) one,
  # index 1 is the last deployment that was live before this push.
  local prev_id
  prev_id=$($wrangler pages deployment list --project-name="$cf_project" --environment=production --json 2>/dev/null \
    | "$node" -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const a=JSON.parse(d);console.log((a[1]&&a[1].id)||'')}catch(e){console.log('')}})")
  if [ -z "$prev_id" ]; then
    echo "could not determine previous deployment id"
    return 1
  fi

  local resp
  resp=$("$curl_bin" -sS -X POST \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${cf_project}/deployments/${prev_id}/rollback" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json")
  if printf '%s' "$resp" | "$node" -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.exit(JSON.parse(d).success?0:1)}catch(e){process.exit(1)}})"; then
    echo "rolled back to deployment $prev_id"
    return 0
  fi
  echo "rollback API call failed: $resp"
  return 1
}

write_deploy_failure_marker() {
  local cf_project="$1" rollback_status="$2" rollback_msg="$3" cf_log="$4"
  local dir="${DEPLOY_FAILURES_DIR:-$HOME/.claude/deploy-failures}"
  mkdir -p "$dir"
  local marker="$dir/${cf_project}-$(date +%Y%m%d-%H%M%S).log"
  {
    echo "project: $cf_project"
    echo "time: $(date -Iseconds)"
    echo "rollback: $rollback_status"
    echo "rollback_detail: $rollback_msg"
    echo "--- healthcheck/deploy output ---"
    cat "$cf_log" 2>/dev/null
  } > "$marker"
  echo "marker written: $marker"
}

cf_autodeploy_pipeline() {
  local repo_root="$1" cf_project="$2" cf_log="$3"
  local wrangler="${WRANGLER_BIN:-npx --yes wrangler@latest}"
  local node="${NODE_BIN:-node}"
  local notify="${NOTIFY_BIN:-notify-send}"

  cd "$repo_root" || return 1
  npm run build || return 1
  $wrangler pages deploy dist --project-name="$cf_project" --branch=main --commit-dirty=true || return 1

  if [ ! -f .cf-healthcheck.mjs ]; then
    echo "(no .cf-healthcheck.mjs — skipping health check)"
    return 0
  fi

  echo "--- post-deploy healthcheck ---"
  if "$node" .cf-healthcheck.mjs; then
    echo "HEALTHCHECK: PASS"
    return 0
  fi

  echo "HEALTHCHECK: FAIL — the live site looks broken, see above"
  local rollback_status rollback_msg
  if rollback_msg=$(rollback_pages "$cf_project" 2>&1); then
    rollback_status="SUCCESS"
  else
    rollback_status="FAILED"
  fi
  echo "ROLLBACK: $rollback_status — $rollback_msg"

  command -v "$notify" >/dev/null 2>&1 && "$notify" -u critical \
    "🚨 Deploy health FAILED — rollback $rollback_status" \
    "$cf_project — see $cf_log"

  write_deploy_failure_marker "$cf_project" "$rollback_status" "$rollback_msg" "$cf_log"
  return 1
}

# Deploys the pushed commit only once it is on the remote (Nadav, D7, 2026-10-27). The pre-push
# hook runs before git sends anything, so this waits for that `git push` to exit, checks that the
# remote branch now points at the pushed sha, and builds that sha in a clean worktree. Until then
# a rejected push (not a fast-forward) still deployed, and the build used the working folder
# (dirty or behind) rather than what was pushed. These repos have no nadavai-ci, so the local
# typecheck and tests of pre-push layer 2, which ran before this, are the gate.
cf_autodeploy_after_push() {  # repo_root cf_project cf_log sha remote branch push_pid
  local repo_root="$1" cf_project="$2" cf_log="$3" sha="$4" remote="$5" branch="$6" push_pid="$7"
  local landed wt rc
  timeout 900 tail --pid="$push_pid" -f /dev/null 2>/dev/null
  landed=$(git -C "$repo_root" ls-remote "$remote" "refs/heads/$branch" 2>/dev/null | cut -f1)
  if [ "$landed" != "$sha" ]; then
    echo "the push did not land ($remote $branch is ${landed:-unreadable}, pushed $sha): nothing deployed"
    return 0
  fi
  wt=$(mktemp -d) || return 1
  git -C "$repo_root" worktree add -q --detach "$wt" "$sha" || { rm -rf -- "$wt"; return 1; }
  # The build reads the gitignored env files (VITE_* and the like), which a worktree does not
  # have; the working-folder build always had them.
  local e
  for e in .env .env.production .env.local .env.production.local .dev.vars; do
    [ -f "$repo_root/$e" ] && cp -p "$repo_root/$e" "$wt/$e"
  done
  # The installed dependencies serve when the pushed manifests match the working folder's.
  if [ -d "$repo_root/node_modules" ] &&
     git -C "$repo_root" diff --quiet "$sha" -- package.json package-lock.json pnpm-lock.yaml 2>/dev/null; then
    ln -s "$repo_root/node_modules" "$wt/node_modules"
  else
    (cd "$wt" && if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --prefer-offline
      elif [ -f package-lock.json ]; then npm ci --prefer-offline --no-audit --no-fund
      else npm install --no-audit --no-fund; fi) ||
      { git -C "$repo_root" worktree remove --force "$wt"; return 1; }
  fi
  echo "deploying $sha from a clean worktree"
  cf_autodeploy_pipeline "$wt" "$cf_project" "$cf_log"; rc=$?
  git -C "$repo_root" worktree remove --force "$wt" 2>/dev/null || rm -rf -- "$wt"
  return "$rc"
}
