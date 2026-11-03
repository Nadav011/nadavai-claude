#!/usr/bin/env python3
"""wp-watchdog: cancel and restart (once) Woodpecker runs orphaned by an agent restart.

A workflow whose state is running but which is missing from the server queue's running list on two
checks in a row lost its agent (the agent restarted or died mid-run). Woodpecker would otherwise
show it running until the repo timeout (60 min). Runs every 2 minutes from a systemd timer on the
Oracle VM (CI v2, ~/.omc/plans/ci-v2-2026-11-03.md on the LENOVO). Log: ~/wp-watchdog/log.
"""
import json
import os
import time
import urllib.request

SERVER = os.environ.get("WOODPECKER_SERVER", "https://ci.nadavc.ai")
HOME = os.path.expanduser("~/wp-watchdog")
TOKEN = open(os.path.join(HOME, "token")).read().strip()
STATE = os.path.join(HOME, "state.json")


def api(path, method="GET"):
    req = urllib.request.Request(f"{SERVER}/api/{path}", method=method,
                                 headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        body = r.read()
        return json.loads(body) if body else None


def log(msg):
    with open(os.path.join(HOME, "log"), "a") as f:
        f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {msg}\n")


def main():
    try:
        state = json.load(open(STATE))
    except (OSError, ValueError):
        state = {"suspect": {}, "restarted": []}
    queue = api("queue/info") or {}
    live = {str(t["id"]) for t in (queue.get("running") or [])}
    live |= {str(t["id"]) for t in (queue.get("pending") or [])}
    live |= {str(t["id"]) for t in (queue.get("waiting_on_deps") or [])}
    suspect_now = {}
    for repo in api("user/repos") or []:
        if not repo.get("active"):
            continue
        rid = repo["id"]
        for p in api(f"repos/{rid}/pipelines?per_page=10") or []:
            if p.get("status") != "running":
                continue
            d = api(f"repos/{rid}/pipelines/{p['number']}") or {}
            orphan = [w for w in d.get("workflows") or [] if w.get("state") == "running" and str(w["id"]) not in live]
            if not orphan:
                continue
            key = f"{rid}/{p['number']}"
            suspect_now[key] = True
            if not state["suspect"].get(key):
                continue  # first sighting: wait for a second check
            if key in state["restarted"]:
                log(f"{repo['full_name']} pipeline {p['number']}: orphaned again after a restart; cancelled, not restarted")
                api(f"repos/{rid}/pipelines/{p['number']}/cancel", "POST")
                continue
            api(f"repos/{rid}/pipelines/{p['number']}/cancel", "POST")
            time.sleep(3)
            new = api(f"repos/{rid}/pipelines/{p['number']}", "POST") or {}
            state["restarted"].append(key)
            log(f"{repo['full_name']} pipeline {p['number']}: workflows {[w['name'] for w in orphan]} lost their agent; "
                f"cancelled and restarted as {new.get('number')}")
    state["suspect"] = suspect_now
    state["restarted"] = state["restarted"][-200:]
    json.dump(state, open(STATE, "w"))


if __name__ == "__main__":
    main()
