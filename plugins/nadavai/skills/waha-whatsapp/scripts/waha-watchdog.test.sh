#!/usr/bin/env bash
# Test of waha-watchdog against a fake WAHA (python http.server answering from a file). Run: bash waha-watchdog.test.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'kill $SRV 2>/dev/null || true; rm -rf "${T:?}"' EXIT
PORT=$((20000 + RANDOM % 20000))
cat > "$T/srv.py" <<'EOF'
import http.server, sys, os
D = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        code = int(open(os.path.join(D, "code")).read())
        body = open(os.path.join(D, "body")).read().encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[2])), H).serve_forever()
EOF
echo 200 > "$T/code"; echo '[]' > "$T/body"
python3 "$T/srv.py" "$T" "$PORT" & SRV=$!
sleep 0.5
printf 'WAHA_URL=http://127.0.0.1:%s\nWAHA_API_KEY=k\n' "$PORT" > "$T/env"
cat > "$T/alert" <<EOF
#!/bin/sh
printf '%s|%s\n' "\$1" "\$2" >> "$T/mails"
EOF
chmod +x "$T/alert"
export WAHA_ENV="$T/env" WAHA_STATE_DIR="$T/state" WAHA_ALERT="$T/alert"
fail=0; n=0
mails() { [ -f "$T/mails" ] && grep -c '^WAHA' "$T/mails" || echo 0; }
run() { # run <now> <code> <body>
  echo "$2" > "$T/code"; echo "$3" > "$T/body"; WAHA_NOW=$1 bash "$HERE/waha-watchdog"; }
check() { n=$((n+1)); if [ "$(mails)" != "$1" ]; then echo "FAIL $n: $2 (mails=$(mails), want $1)"; fail=1; else echo "ok $n: $2"; fi; }
S() { printf '[{"name":"%s","status":"%s","me":{"id":"972500000000@c.us"}}%s]' "$1" "$2" "${3:-}"; }

run 100 200 '[]';                                  check 0 "healthy: no mail"
run 220 200 "$(S medizen FAILED)";                  check 0 "first FAILED reading: wait"
run 340 200 "$(S medizen FAILED)";                  check 1 "second FAILED reading: mail"
run 460 200 "$(S medizen FAILED)";                  check 1 "still FAILED within 30 min: no repeat"
# Reviewer's case: another session flaps while medizen stays FAILED.
run 580 200 "$(S medizen FAILED ",$(S snooker STARTING | tr -d '[]')")"; check 1 "snooker first sighting: no mail"
run 700 200 "$(S medizen FAILED ",$(S snooker FAILED | tr -d '[]')")";   check 2 "snooker confirmed though its status changed: mail"
run 820 200 "$(S medizen FAILED ",$(S snooker STARTING | tr -d '[]')")"; check 2 "same set of problems: no mail"
run 2600 200 "$(S medizen FAILED ",$(S snooker FAILED | tr -d '[]')")";  check 3 "reminder after 30 min"
run 2720 200 "$(S medizen WORKING)";                check 4 "all good: recovery mail"
run 2840 200 "$(S medizen WORKING)";                check 4 "stays good: nothing"
run 2960 200 "$(S cash STOPPED)";                   check 4 "a deliberately stopped session is not a problem"
run 3080 401 '{"message":"unauthorized"}';          check 4 "WAHA down once: wait"
run 3200 503 '';                                   check 5 "WAHA down twice: mail"
run 3320 200 "$(S medizen SCAN_QR_CODE)";            check 5 "down -> a new unconfirmed problem: no false recovery"
run 3440 200 "$(S medizen SCAN_QR_CODE)";            check 6 "the new problem confirmed: mail"
run 3560 200 '[]';                                  check 7 "recovery"
L='[{"name":"s1","status":"SCAN_QR_CODE","config":{"metadata":{"linking":"99999"}},"me":null}]'
run 3680 200 "$L"; run 3800 200 "$L";               check 7 "waiting on its linking page: no mail"
U='[{"name":"s1","status":"SCAN_QR_CODE","config":{"metadata":{}},"me":null}]'
run 3920 200 "$U"; run 4040 200 "$U";               check 8 "logged out (no linking flag): mail"
F='[{"name":"s1","status":"FAILED","config":{"metadata":{"linking":"99999"}},"me":null}]'
run 4100 200 "$F"; run 4130 200 "$F";               check 9 "linking session whose QR timed out (FAILED) is no problem: the earlier one recovers"
V='[{"name":"s1","status":"STOPPED","config":{"metadata":{"live":"1"}},"me":null}]'
run 4160 200 "$V"; run 4280 200 "$V";               check 10 "a live session that is STOPPED: mail"
run 4400 200 '[]';                                  check 11 "recovery"
run 4520 200 "$V"; run 4640 200 "$V";               check 12 "a live session that stops again: mail"
run 4760 200 '[]';                                  check 13 "recovery"
X='[{"name":"s1","status":"FAILED","config":{"metadata":{"linking":"4000","live":"1"}},"me":null}]'
run 4880 200 "$X"; run 5000 200 "$X";               check 14 "a live session failed with an EXPIRED linking flag: mail"
run 5120 200 '[]';                                  check 15 "recovery"
W='[{"name":"s1","status":"WORKING","config":{"metadata":{"expectedPhone":"972501112222"}},"me":{"id":"972509999999@c.us"}}]'
run 5240 200 "$W"; run 5360 200 "$W";               check 16 "working on a different number than expected: mail"
grep -q '…9999' "$T/mails" && echo "ok: wrong-number text" || { echo "FAIL: wrong-number text"; fail=1; }
R='[{"name":"s1","status":"WORKING","config":{"metadata":{"expectedPhone":"972501112222"}},"me":{"id":"972501112222@c.us"}}]'
run 5480 200 "$R";                                  check 17 "the right number: recovery"
grep -q 'OK again' "$T/mails" && ! grep -q 'Dashboard: https' "$T/mails" && echo "ok: texts" || { echo "FAIL: texts"; fail=1; }
[ $fail = 0 ] && echo "ALL PASSED ($n checks)" || { echo FAILED; exit 1; }
