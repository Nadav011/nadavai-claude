#!/usr/bin/env python3
"""Delete old finished pipelines through Woodpecker's API, so the server's database stops growing.

  wp-purge.py [--dry-run]     per repo: finished pipelines older than KEEP_DAYS, never the newest KEEP_MIN

Why: Woodpecker has no retention setting, and the step logs took the database from 0.3 MB to
2.1 GB in its first week (about 0.3 GB a day). Deleting a pipeline through the API removes its
workflows, steps and logs (checked on 2026-11-10: no orphan rows). SQLite reuses the freed pages,
so the file levels off at about KEEP_DAYS of logs. Commit statuses on GitHub are not touched, and
the deploy service's nightly gate reads only the latest cron run.
The token is WOODPECKER_TOKEN in ~/deploy/secrets/woodpecker.env. Runs daily (wp-purge.timer).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

SERVER = os.environ.get("WOODPECKER_SERVER", "https://ci.nadavc.ai").rstrip("/")
ENV = os.path.expanduser("~/deploy/secrets/woodpecker.env")
KEEP_DAYS = int(os.environ.get("WP_KEEP_DAYS", "30"))
KEEP_MIN = int(os.environ.get("WP_KEEP_MIN", "30"))
# "blocked" waits for an approval and is not finished; "canceled" is what the server calls a cancelled run.
FINISHED = {"success", "failure", "killed", "canceled", "error", "declined", "skipped"}


def token():
    with open(ENV) as fh:
        for line in fh:
            key, _, value = line.strip().partition("=")
            if key.removeprefix("export ").strip() == "WOODPECKER_TOKEN":
                return value.strip().strip("'\"")
    sys.exit("no WOODPECKER_TOKEN in " + ENV)


def call(method, path, tok):
    req = urllib.request.Request(SERVER + path, method=method, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else None


def pipelines(repo_id, tok):
    out, page = [], 1
    while True:
        chunk = call("GET", "/api/repos/%d/pipelines?perPage=100&page=%d" % (repo_id, page), tok) or []
        if not chunk:  # the server caps a page (50 on 3.20), so only an empty page ends the list
            return out
        out += chunk
        page += 1


def main():
    dry = "--dry-run" in sys.argv[1:]
    tok, cutoff, failed = token(), time.time() - KEEP_DAYS * 86400, 0
    for repo in call("GET", "/api/user/repos?all=true", tok) or []:
        if not repo.get("active"):
            continue
        runs = sorted(pipelines(repo["id"], tok), key=lambda p: p["number"], reverse=True)
        old = [p for p in runs[KEEP_MIN:] if p.get("status") in FINISHED and (p.get("finished") or p.get("created") or cutoff) < cutoff]
        done = 0
        for p in old:
            if dry:
                done += 1
                continue
            try:
                call("DELETE", "/api/repos/%d/pipelines/%d" % (repo["id"], p["number"]), tok)
                done += 1
            except urllib.error.URLError as err:
                failed += 1
                print("%s #%d: not deleted: %s" % (repo["name"], p["number"], err))
        print("%s: %d pipelines, %s %d older than %d days" % (
            repo["name"], len(runs), "would delete" if dry else "deleted", done, KEEP_DAYS))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
