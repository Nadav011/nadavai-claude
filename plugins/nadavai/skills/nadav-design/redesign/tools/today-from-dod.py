#!/usr/bin/env python3
"""Take «היום» shots from the project's DoD run (README step 2, source 1), only the ones that prove the right page.

usage: python3 -I today-from-dod.py --config redesign.json --dod <app>/reports/dod/dod.json --app <app>
                                    [--width 375] [--scheme dark] name=/route:file,file ...
  name=/route        the «היום» name (today/<name>.png) and the DoD route it comes from
  :file,file         the app files of that route (REQUIRED): the shot must be newer than their last commit
  --app <repo>       the app checkout pinned at step 0 (REQUIRED): freshness is never optional

The DoD (nadavai templates/dod) writes a screenshot for EVERY entry, also for a route it could not open: a 302 to the
login page, an error screen, a page still loading. A shot is copied only when its dod.json entry has a 2xx status, is
not unreachable, was not redirected (`redirected_to`, the older `redirected`, or a `landed` path or query other than
the route's), was reached (`reached` is true: an entry without the field comes from an older DoD and is rejected, so
that screen falls through to source 2; updating the app's e2e/dod is setup or retro work, never this mode's), the PNG
exists, and it is newer than the route files' last commit. Everything else is listed in "rejected" with its reason,
for INVENTORY.md «Screens that could not be captured», and falls through to source 2 (capture-today.mjs).
The DoD does not block service workers, so an accepted shot is still only a candidate: Read each one and record in
INVENTORY.md that the route's `expect` text is visible in it; a shot that does not show it is deleted and falls through.
Prints JSON {accepted, rejected}. Exit 0 all accepted · 1 some rejected · 2 a config or argument error.
Read-only on the app and on dod.json.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys
from urllib.parse import urlsplit

ap = argparse.ArgumentParser(description='Copy trustworthy DoD shots into today/', add_help=True)
ap.add_argument('--config', default='redesign.json')
ap.add_argument('--dod', required=True)
ap.add_argument('--width', type=int, default=375)
ap.add_argument('--scheme')
ap.add_argument('--app', required=True, help='the app checkout pinned at step 0 (freshness is mandatory)')
ap.add_argument('pairs', nargs='+')
args = ap.parse_args()

cfg_path = pathlib.Path(args.config).resolve()
C = json.loads(cfg_path.read_text(encoding='utf-8'))
dflt = (C.get('theme') or {}).get('default', 'dark')
scheme = args.scheme or dflt
today = cfg_path.parent / (C.get('dirs') or {}).get('today', 'today')
dod_path = pathlib.Path(args.dod).resolve()
if not dod_path.is_file():
    print(f'no dod.json at {dod_path}', file=sys.stderr)
    sys.exit(2)
report = json.loads(dod_path.read_text(encoding='utf-8'))
routes = report.get('routes', {})


def where(url):
    """Path and query of a URL: /book?players=3 is not the page /book?players=2 asked for."""
    path, query = urlsplit(url)[2:4]
    return path.rstrip('/'), query


def shot_path(entry):
    rel = entry.get('screenshot') or ''
    for base in (dod_path.parent, dod_path.parent.parent, dod_path.parent.parent.parent):
        p = (base / rel).resolve()
        if rel and p.is_file():
            return p
    p = dod_path.parent / 'screens' / f'{entry.get("slug")}__{args.width}__{scheme}.png'
    return p if p.is_file() else None


def last_commit(files):
    if not args.app or not files:
        return None
    out = subprocess.run(['git', '-C', args.app, 'log', '-1', '--format=%ct', '--', *files], capture_output=True, text=True)
    return int(out.stdout.strip()) if out.returncode == 0 and out.stdout.strip() else None


accepted, rejected = [], []
for pair in args.pairs:
    if '=' not in pair:
        print(f'not name=/route: {pair}', file=sys.stderr)
        sys.exit(2)
    name, rest = pair.split('=', 1)
    route, _, files = rest.partition(':')
    files = [f for f in files.split(',') if f]
    entries = [e for e in (routes.get(route) or {}).get('entries', [])
               if (e.get('viewport') or {}).get('width') == args.width and e.get('scheme') == scheme]
    why = None
    if not entries:
        why = f'no DoD entry for {route} at {args.width} {scheme}'
    else:
        e = entries[0]
        status = e.get('status')
        if e.get('unreachable'):
            why = f'unreachable: {e.get("unreachable_reason")}'
        elif not isinstance(status, int) or not 200 <= status < 300:
            why = f'HTTP {status}'
        elif e.get('redirected_to') or e.get('redirected') or (e.get('landed') and where(e['landed']) != where(route)):
            why = f'redirected to {e.get("redirected_to") or e.get("landed") or "another page"}: the shot is another page'
        elif 'reached' not in e:
            why = 'the entry has no "reached" field (an older DoD): this screen falls through to source 2 (capture-today); updating the app\'s e2e/dod is setup or retro work, not this mode\'s'
        elif e.get('reached') is not True:
            why = f'not painted: {e.get("not_reached_reason")}'
        elif not files:
            why = 'freshness unknown: name the route files (name=/route:file,file)'
        else:
            src = shot_path(e)
            if not src:
                why = f'the screenshot {e.get("screenshot")} is missing'
            else:
                changed = last_commit(files)
                if changed is None:
                    why = f'no commit touches {", ".join(files)} in {args.app}: freshness unknown'
                elif src.stat().st_mtime < changed:
                    why = 'older than the last commit touching the route'
                else:
                    today.mkdir(parents=True, exist_ok=True)
                    dst = today / (f'{name}.png' if scheme == dflt else f'{name}-{scheme}.png')
                    shutil.copyfile(src, dst)
                    accepted.append({'name': name, 'route': route, 'shot': str(dst.relative_to(cfg_path.parent)),
                                     'status': status, 'read_and_check_expect': True})
    if why:
        rejected.append({'name': name, 'route': route, 'reason': why})

print(json.dumps({'accepted': accepted, 'rejected': rejected}, ensure_ascii=False, indent=1))
sys.exit(1 if rejected else 0)
