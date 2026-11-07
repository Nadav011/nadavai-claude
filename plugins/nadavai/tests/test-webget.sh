#!/usr/bin/env bash
# test-webget.sh: offline checks of bin/webget (routing, VTT cleanup, --max-chars, usage errors),
# then live checks against real sites. WEBGET_OFFLINE=1 skips the live part.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
WG="$here/../../../bin/webget"
FX="$here/fixtures/webget"
PASS=0; FAIL=0; SKIP=0
tmp=$(mktemp -d); srv=""
trap '[ -n "$srv" ] && kill "$srv" 2>/dev/null; rm -rf -- "${tmp:?}"' EXIT
s=$(command -v scrapling) || { echo "FAIL: scrapling not installed"; exit 1; }
PY=$(head -1 "$s"); PY=${PY:2}

expect() {  # name  want  got
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else echo "FAIL: $1 — want ${2}, got: ${3:0:300}"; FAIL=$((FAIL+1)); fi
}

# --- routing (no network: --dry-route prints "<route> <backend chain>")
while read -r want url; do
  expect "route $url" "$want" "$("$WG" "$url" --dry-route 2>&1 | cut -d' ' -f1)"
done <<'EOF'
youtube https://www.youtube.com/watch?v=jNQXAC9IVRw
youtube https://youtu.be/jNQXAC9IVRw
youtube https://m.youtube.com/shorts/abc123
web https://www.youtube.com/@SanDiegoZoo
reddit https://www.reddit.com/r/Israel/top/?t=week
reddit https://old.reddit.com/r/Israel/comments/abc/x/
reddit https://redd.it/abc123
x https://x.com/OpenAI
x https://twitter.com/OpenAI/status/1
web https://example.com
web https://www.ynet.co.il
EOF
expect "chain for web"   "web http,browser,brightdata" "$("$WG" https://example.com --dry-route 2>&1)"
expect "forced backend"  "reddit http" "$("$WG" https://www.reddit.com/r/x --backend http --dry-route 2>&1)"
expect "bare host gets https" "web http,browser,brightdata" "$("$WG" example.com --dry-route 2>&1)"

# --- VTT to text: tags, cue settings and rolling repeats dropped, a >2 s gap starts a paragraph
got=$("$PY" -I -c '
import importlib.machinery, importlib.util, sys
loader = importlib.machinery.SourceFileLoader("webget", sys.argv[1])
spec = importlib.util.spec_from_loader("webget", loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
print(m.vtt_to_text(open(sys.argv[2], encoding="utf-8").read()))' "$WG" "$FX/rolling.vtt")
expect "vtt dedupe" "hello there friends we see the elephants with & long trunks

after a pause" "$got"

# --- usage errors exit 2
"$WG" >/dev/null 2>&1; expect "no url exits 2" 2 "$?"
"$WG" file:///etc/hostname >/dev/null 2>&1; expect "file:// exits 2" 2 "$?"
"$WG" https://example.com --max-chars 0 >/dev/null 2>&1; expect "--max-chars 0 exits 2" 2 "$?"

# --- --max-chars truncation, over HTTP from a local server (no internet needed)
port=$("$PY" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
"$PY" -m http.server "$port" --bind 127.0.0.1 --directory "$FX" >/dev/null 2>&1 & srv=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do "$PY" -c 'import socket,sys; socket.create_connection(("127.0.0.1", int(sys.argv[1])), 1)' "$port" 2>/dev/null && break; sleep 0.3; done
"$WG" "http://127.0.0.1:$port/long.html" --backend http --max-chars 50 >"$tmp/trunc.out" 2>"$tmp/trunc.err"
expect "truncation exit 0"       0 "$?"
expect "truncated to 50 chars"   50 "$("$PY" -c 'import sys; print(len(open(sys.argv[1], encoding="utf-8").read().rstrip("\n")))' "$tmp/trunc.out")"
expect "stderr status line"      "webget: backend=http status=200 chars=50 truncated" "$(cat "$tmp/trunc.err")"
"$WG" "http://127.0.0.1:$port/long.html" --backend http --json --format text >"$tmp/full.json" 2>/dev/null
expect "json fields" "True" "$("$PY" -c '
import json, sys; d = json.load(open(sys.argv[1]))
print(list(d) == ["url","backend","status","title","content","truncated","tried"] and d["truncated"] is False
      and d["title"] == "webget fixture" and "threshold" in d["content"] and "#" not in d["content"])' "$tmp/full.json")"

# --- live checks
if [ "${WEBGET_OFFLINE:-}" = 1 ]; then
  SKIP=5
else
  out=$("$WG" https://example.com 2>"$tmp/ex.err")
  expect "example.com via http" "backend=http" "$(grep -o 'backend=[a-z]*' "$tmp/ex.err")"
  expect "example.com text" yes "$(grep -q documentation <<<"$out" && echo yes || echo no)"
  out=$("$WG" 'https://www.youtube.com/watch?v=jNQXAC9IVRw' 2>/dev/null)
  expect "youtube transcript" yes "$(sed -n '/^## Transcript/,$p' <<<"$out" | grep -qi elephants && echo yes || echo no)"
  n=$("$WG" 'https://www.reddit.com/r/Israel/top/?t=week' 2>/dev/null | grep -c '^- \[')
  expect "reddit >= 5 posts" yes "$([ "$n" -ge 5 ] && echo yes || echo "no ($n)")"
  out=$("$WG" https://x.com/OpenAI 2>"$tmp/x.err")
  expect "x.com via brightdata" "backend=brightdata OpenAI" "$(grep -o 'backend=[a-z]*' "$tmp/x.err") $(grep -o OpenAI <<<"$out" | head -1)"
fi

echo "test-webget: $PASS passed, $FAIL failed, $SKIP live checks skipped"
[ "$FAIL" -eq 0 ]
