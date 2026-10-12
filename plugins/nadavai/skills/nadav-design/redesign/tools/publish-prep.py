#!/usr/bin/env python3
"""Prepare the built demo for publishing (claude.ai artifacts refuse pages over 16 MB; any host loads it faster).

usage: python3 publish-prep.py [--config redesign.json] [in.html] [outdir]
  defaults: in = the config's "output", outdir = pub/ next to the config.
Every inline data: URI of 2000 characters or more (images, today's screenshots) moves to <outdir>/a/<sha1>.<ext>,
deduplicated, and the page references it by relative path. Tiny icons stay inline.
Prints the page size, the file count and the asset total; exit 1 when the page is still over the limit
(config "publish_limit_mb", default 16, the artifact page limit). Check the result with
  node shoot.mjs --config redesign.json --in pub/index.html --dir work/shots/pub
(it loads the page from disk, so a missing asset shows up as a failed request).
"""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import sys

ap = argparse.ArgumentParser()
ap.add_argument('--config', default='redesign.json')
ap.add_argument('src', nargs='?')
ap.add_argument('out', nargs='?')
args = ap.parse_args()
cfg_path = pathlib.Path(args.config).resolve()
C = json.loads(cfg_path.read_text(encoding='utf-8'))
src = pathlib.Path(args.src).resolve() if args.src else cfg_path.parent / C.get('output', 'demo.html')
out = pathlib.Path(args.out).resolve() if args.out else cfg_path.parent / 'pub'
(out / 'a').mkdir(parents=True, exist_ok=True)
EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif',
       'image/avif': 'avif'}
seen = {}


def repl(m):
    mime, data = m.group(1), m.group(2)
    if mime not in EXT or len(data) < 2000:
        return m.group(0)
    raw = base64.b64decode(data)
    h = hashlib.sha1(raw).hexdigest()[:16]
    name = f'a/{h}.{EXT[mime]}'
    if h not in seen:
        (out / name).write_bytes(raw)
        seen[h] = len(raw)
    return name


html = re.sub(r'data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)', repl, src.read_text(encoding='utf-8'))
(out / 'index.html').write_text(html, encoding='utf-8')
size = len(html.encode())
limit = C.get('publish_limit_mb', 16)
print(f'page {size / 1e6:.2f} MB, {len(seen)} files, {sum(seen.values()) / 1e6:.2f} MB of assets -> {out}')
if size > limit * 1e6:
    print(f'error: the page is {size / 1e6:.2f} MB, over the {limit} MB publishing limit; move more out of it')
    sys.exit(1)
