#!/usr/bin/env python3
# Operator script on nadavai-svc: create a STOPPED WAHA session for one app number, with its webhook (own HMAC key),
# metadata and a scoped key (read + send). Prints only file paths and booleans; the keys go to a root-only file
# /opt/waha/keys/<session>.env that the operator copies into the app's secrets.
# Usage: sudo python3 new-session.py <session> <app> <webhook url> <expected phone 972...>
import json, os, secrets, sys, urllib.error, urllib.request

name, app, hook, phone = sys.argv[1:5]
assert phone.isdigit() and phone.startswith("972"), "phone must be 972..."
KEY = open("/opt/waha/.env").read().split("WAHA_API_KEY=")[1].split("\n")[0]

def call(method, path, body=None):
    req = urllib.request.Request("http://127.0.0.1:3000" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Api-Key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}

st, _ = call("GET", f"/api/sessions/{name}")
assert st == 404, f"session {name} already exists"
hmac_key = secrets.token_hex(32)
cfg = {"client": {"deviceName": "Bot server", "browserName": "Chrome"},  # the name the client sees in Linked devices, apart from WaSender's "Mac OS"
       "metadata": {"app": app, "number": "…" + phone[-4:], "expectedPhone": phone},
       "webhooks": [{"url": hook, "events": ["message", "message.any", "message.ack", "message.reaction", "message.revoked", "session.status"],
                     "hmac": {"key": hmac_key}, "retries": {"policy": "exponential", "delaySeconds": 2, "attempts": 6}}]}
st, _ = call("POST", "/api/sessions", {"name": name, "start": False, "config": cfg})
assert st in (200, 201), f"create failed {st}"
st, k = call("POST", "/api/keys", {"isAdmin": False, "session": name, "isActive": True, "actions": {"read": True, "send": True}})
assert st in (200, 201) and k.get("key"), f"key failed {st}"
os.makedirs("/opt/waha/keys", mode=0o700, exist_ok=True)
path = f"/opt/waha/keys/{name}.env"
with open(path, "w") as f:
    f.write(f"WAHA_URL=https://waha.nadavc.ai\nWAHA_SESSION={name}\nWAHA_API_KEY={k['key']}\nWAHA_WEBHOOK_HMAC_KEY={hmac_key}\nWAHA_EXPECTED_PHONE={phone}\n")
os.chmod(path, 0o600)
st, d = call("GET", f"/api/sessions/{name}")
print(json.dumps({"session": name, "status": d.get("status"), "webhook": [w["url"] for w in d["config"]["webhooks"]],
                  "hmac_set": bool(d["config"]["webhooks"][0].get("hmac", {}).get("key")), "keys_file": path}))
