#!/usr/bin/env python3
"""Count the open rows of DECISIONS-OPEN.md: every table row whose «מצב» cell is not exactly «הוכרע · תשובה N».

usage: python3 tools/decisions-open.py DECISIONS-OPEN.md   -> {"open": n, "rows": ["Q-1", ...]}; exit 0
A row closed in any other words (by hand, «נסגר», empty) counts as open: only a run that applied the answer closes one.
"""
import json, pathlib, re, sys
if len(sys.argv) != 2 or sys.argv[1] in ('-h', '--help') or not pathlib.Path(sys.argv[1]).is_file():
    print(__doc__, file=sys.stderr if len(sys.argv) != 2 or sys.argv[1] not in ('-h', '--help') else sys.stdout)
    sys.exit(0 if len(sys.argv) == 2 and sys.argv[1] in ('-h', '--help') else 2)
CLOSED = re.compile(r'^הוכרע · תשובה \d+$')
col, rows = None, []
for line in pathlib.Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    if not line.strip().startswith('|'):
        col = None
        continue
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if col is None:
        col = cells.index('מצב') if 'מצב' in cells else None
        continue
    if set(''.join(cells)) <= set('-: ') or col >= len(cells):
        continue
    if not CLOSED.match(cells[col]):
        rows.append(cells[0])
print(json.dumps({'open': len(rows), 'rows': rows}, ensure_ascii=False))
