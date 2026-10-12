# Fixture: «רצים», two screens

The test bed of the redesign tools. The config points `dirs.parts` at `../../templates/parts`, so the templates are
tested too. Everything the run writes (`today/`, `demo.html`, `out/`, `pub/`, `work/`) is gitignored.

Run from this folder, one browser at a time (check `uptime` first). Port 8977 is the fixture's own throwaway server;
never use 8900. Playwright comes from an app's own install, never a global one.

```
export PLAYWRIGHT_MODULE=<an app repo>/node_modules/playwright/index.mjs
python3 -m http.server 8977 --bind 127.0.0.1 -d app & echo $! > work.pid   # "today's app"
node ../../tools/capture-today.mjs --config redesign.json                     # today/home.png, today/profile.png
kill $(cat work.pid); rm work.pid
python3 ../../tools/build.py --config redesign.json                           # exit 0, missing [] leftover []
python3 ../../tools/publish-prep.py --config redesign.json                    # pub/index.html + pub/a/*.png
node ../../tools/shoot.mjs --config redesign.json --dir work/shots/dark --theme dark
node ../../tools/shoot.mjs --config redesign.json --dir work/shots/light --theme light
node ../../tools/shoot.mjs --config redesign.json --dir work/shots/320-dark --theme dark --width 320
node ../../tools/shoot.mjs --config redesign.json --dir work/shots/320-light --theme light --width 320
node ../../tools/shoot.mjs --config redesign.json --in pub/index.html --dir work/shots/pub
python3 ../../tools/check-anchors.py --config redesign.json                            # exit 0
python3 ../../tools/check-anchors.py --config redesign.json --plan plan/build-plan-broken.md   # exit 1: 1 missing, 1 wrong
node ../../tools/dry-run-workflow.mjs ../../workflows/demo-round.js demo-round.args.json       # exit 0
node ../../tools/dry-run-workflow.mjs ../../workflows/plan-review.js plan-review.args.json     # exit 0
```

Every shoot must print empty lists and exit 0. The args files use paths relative to this folder, which is enough for
the dry run; a real Workflow run needs absolute paths. The regression tests of every tool and both workflows:
`node ../../tests/run.mjs` (from anywhere; `--no-browser` skips the three browser tests).
