#!/usr/bin/env python3
"""Health checks of the CI that nadavai-watch runs on nadavai-vm (exit 0 = healthy).

  wp-health.py agents    at least one Docker agent that takes work answered in the last 10 minutes
  wp-health.py nightly   every repo with a cron named "nightly" started it in the last 26 hours

The token is WOODPECKER_TOKEN in ~/deploy/secrets/woodpecker.env (the deploy service's file).
Why: on 2026-11-09 omarchy went away, both its agents were out of contact for 22 hours and nothing
said so; one night four repos' crons waited 11 hours in the queue.
"""
import json
import os
import sys
import time
import urllib.request

SERVER = os.environ.get("WOODPECKER_SERVER", "https://ci.nadavc.ai").rstrip("/")
ENV = os.path.expanduser("~/deploy/secrets/woodpecker.env")


def token():
    with open(ENV) as fh:
        for line in fh:
            key, _, value = line.strip().partition("=")
            if key.removeprefix("export ").strip() == "WOODPECKER_TOKEN":
                return value.strip().strip("'\"")
    sys.exit("no WOODPECKER_TOKEN in " + ENV)


def get(path, tok):
    req = urllib.request.Request(SERVER + path, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def agents(tok):
    now = time.time()
    rows = [a for a in get("/api/agents", tok) or [] if a.get("backend") == "docker"]
    online = [a["name"] for a in rows if not a.get("no_schedule") and now - (a.get("last_contact") or 0) < 600]
    seen = ", ".join("%s %d min ago%s" % (a["name"], (now - (a.get("last_contact") or 0)) / 60,
                                          " (paused)" if a.get("no_schedule") else "") for a in rows)
    if online:
        print("online: " + ", ".join(online))
        return 0
    print("no CI agent online, so no landing can run. Last contact: " + (seen or "no agents registered"))
    return 1


def nightly(tok):
    now, late = time.time(), []
    for repo in get("/api/user/repos?all=true", tok) or []:
        if not repo.get("active"):
            continue
        if not any(c.get("name") == "nightly" for c in get("/api/repos/%d/cron" % repo["id"], tok) or []):
            continue
        runs = get("/api/repos/%d/pipelines?event=cron&branch=main&perPage=10" % repo["id"], tok) or []
        last = max((p.get("created", 0) for p in runs if p.get("cron") == "nightly"), default=0)
        if now - last > 26 * 3600:
            late.append("%s (last %s)" % (repo["name"], time.strftime("%F %H:%M UTC", time.gmtime(last)) if last else "never"))
    if late:
        print("nightly cron did not start in the last 26 hours: " + ", ".join(late))
        return 1
    print("every nightly cron started in the last 26 hours")
    return 0


if __name__ == "__main__":
    checks = {"agents": agents, "nightly": nightly}
    if len(sys.argv) != 2 or sys.argv[1] not in checks:
        sys.exit("usage: wp-health.py agents|nightly")
    try:
        sys.exit(checks[sys.argv[1]](token()))
    except OSError as err:  # the server not answering is the ci-server check's alert, not this one's
        print("could not ask Woodpecker: %s" % err)
        sys.exit(1)
