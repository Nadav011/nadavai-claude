#!/usr/bin/env python3
"""Check that a REFERENCE.md leaves no part of the reference without a row.

usage: python3 tools/reference-coverage.py REFERENCE.md --total 16.47 [--tolerance 0.05] [--frames-dir .]
  -> {"rows": n, "unit": "s", "covered_to": x, "problems": [...]}; exit 0 when there are none, 1 otherwise, 2 on usage

Every R-n row states, at the start of its «what» cell, the stretch of the reference it covers:
  [t0–t1 s]   for a video (seconds from its start)
  [y0–y1 px]  for a page (pixels from its top, at the width the ledger states)
The stretches must start at 0, follow one another with no gap and no overlap, and end at --total.
A recording that scrolls back shows a section twice: both showings are rows, in the order they are seen.
With --frames-dir, every row's reference/R-n.png must exist under it.

--total is the real length of the reference, never a number taken from the ledger: the duration `ffprobe` prints
for a video, or the page's scroll height at the stated width.

What this does not catch: a section swallowed into a neighbour's stretch (the fresh reviewer's job,
shared/reference.md, «The rule», step 2); the «always there» K rows; whether a built/ frame exists.
"""
import math
import argparse
import json
import os
import re
import sys

ROW = re.compile(r'^\|\s*(R-\d+)\s*\|(.*)$')
SPAN = re.compile(r'^\s*\[\s*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(s|px)\s*\]')


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('ledger')
    ap.add_argument('--total', type=float, required=True)
    ap.add_argument('--tolerance', type=float, default=0.05)
    ap.add_argument('--frames-dir')
    try:
        a = ap.parse_args()
    except SystemExit as e:
        sys.exit(0 if e.code == 0 else 2)
    try:
        text = open(a.ledger, encoding='utf-8').read()
    except OSError as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        sys.exit(2)

    if not math.isfinite(a.total) or a.total <= 0:
        print(json.dumps({'error': f'--total must be a positive number, got {a.total}'}, ensure_ascii=False))
        sys.exit(2)

    problems, rows, units, seen = [], [], set(), set()
    for line in text.splitlines():
        m = ROW.match(line)
        if not m:
            continue
        rid, rest = m.group(1), m.group(2)
        if rest.count('|') < 6:
            # a row of the «Differences on purpose» table (4 cells) repeats an id and carries no stretch;
            # a section row that lost cells still starts with one
            if SPAN.match(rest.split('|')[0]):
                problems.append(f'{rid}: the row has fewer than 7 cells')
                seen.add(rid)
            continue
        if rid in seen:
            problems.append(f'{rid}: the id appears on two rows')
            continue
        seen.add(rid)
        what = rest.split('|')[0]
        s = SPAN.match(what)
        if not s:
            problems.append(f'{rid}: no [a–b s] or [a–b px] stretch at the start of its «what» cell '
                            '(numbers, an en dash or a hyphen between them, then s or px)')
            continue
        t0, t1, unit = float(s.group(1)), float(s.group(2)), s.group(3)
        units.add(unit)
        if t1 <= t0:
            problems.append(f'{rid}: stretch ends ({t1:g}) at or before it starts ({t0:g})')
        rows.append((rid, t0, t1))
        if a.frames_dir and not os.path.isfile(os.path.join(a.frames_dir, 'reference', f'{rid}.png')):
            problems.append(f'{rid}: reference/{rid}.png is missing')

    if not seen:
        problems.append('no R-n row found')
    if len(units) > 1:
        problems.append('rows mix seconds and pixels')
    prev = 0.0
    for rid, t0, t1 in rows:
        gap = t0 - prev
        if gap > a.tolerance:
            problems.append(f'no row covers {prev:g} to {t0:g} (before {rid})')
        elif gap < -a.tolerance:
            problems.append(f'{rid} overlaps the row before it by {-gap:g}')
        prev = max(prev, t1)
    if rows and a.total - prev > a.tolerance:
        problems.append(f'no row covers {prev:g} to {a.total:g} (the end)')
    if rows and prev - a.total > a.tolerance:
        problems.append(f'the rows run to {prev:g}, past the total {a.total:g}')

    print(json.dumps({'rows': len(seen), 'unit': (units.pop() if len(units) == 1 else None),
                      'covered_to': prev, 'problems': problems}, ensure_ascii=False))
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
