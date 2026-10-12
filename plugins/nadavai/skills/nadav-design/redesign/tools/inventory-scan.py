#!/usr/bin/env python3
"""Scan a Next.js app router app into INVENTORY.md rows: every route, its boundaries, its state signals, its controls.

usage: python3 -I inventory-scan.py <app-root>                    -> a markdown table of every route
       python3 -I inventory-scan.py <app-root> --controls /book   -> every control of one route, with file:line
Read-only on the app. The signals are grep-level, so they are leads, not facts: the table says where to look, and a
screen's per-control list (--controls) is written when the screen enters a lane, not up front for every route.
Looks for app/ or src/app/; a route is a page.tsx/jsx/ts/js whose folder path, without (group) segments, is the URL.
Vite or another router: list the routes from the router file by hand.
"""
import pathlib
import re
import sys

PAGE = ('page.tsx', 'page.jsx', 'page.ts', 'page.js')
SIGNALS = [
    ('ריק', re.compile(r"\bאין [א-ת]|ריק|\bNo [a-z]+ (yet|found)|empty", re.I)),
    ('שגיאה', re.compile(r'שגיאה|נכשל|ErrorState|error[-_ ]?(note|text|message)|\bfailed\b', re.I)),
    ('טוען', re.compile(r'aria-busy|Skeleton|Spinner|Loader|shimmer|טוען|isLoading|loading', re.I)),
    ('הצלחה', re.compile(r'הצלחה|נשמר|אושר|\bsuccess', re.I)),
    ('אין הרשאה', re.compile(r"redirect\(\s*['\"`][^'\"`]*(login|auth|sign-?in)|notFound\(\)|forbidden", re.I)),
]
CONTROL = re.compile(r'<(button|Button|Link|a|input|Input|select|Select|textarea|Textarea|Switch|Checkbox|RadioGroup|Dialog|Sheet|Drawer|DropdownMenu|Tabs)\b')


def app_dir(root):
    for d in (root / 'src' / 'app', root / 'app'):
        if d.is_dir():
            return d
    sys.exit(f'no app/ or src/app/ under {root}: not a Next app router app')


def route_of(page, appd):
    parts = [p for p in page.parent.relative_to(appd).parts if not (p.startswith('(') and p.endswith(')'))]
    return '/' + '/'.join(parts)


def nearest(page, names, appd):
    d = page.parent
    while True:
        for n in names:
            if (d / n).exists():
                return str((d / n).relative_to(appd))
        if d == appd:
            return '—'
        d = d.parent


def local_sources(page):
    files = [page]
    files += [f for f in page.parent.iterdir() if f.suffix in ('.tsx', '.jsx') and f.name not in PAGE and f.is_file()]
    for sub in ('_components', 'components'):
        if (page.parent / sub).is_dir():
            files += [p for p in (page.parent / sub).rglob('*') if p.suffix in ('.tsx', '.jsx') and '__tests__' not in p.parts]
    return files


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0 if args else 2)
    root = pathlib.Path(args[0]).resolve()
    appd = app_dir(root)
    pages = sorted(p for p in appd.rglob('*') if p.name in PAGE and '__tests__' not in p.parts and 'node_modules' not in p.parts)
    if '--controls' in args:
        want = args[args.index('--controls') + 1]
        hits = [p for p in pages if route_of(p, appd) == want]
        if not hits:
            sys.exit(f'no route {want}')
        for src in local_sources(hits[0]):
            for n, line in enumerate(src.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                for m in CONTROL.finditer(line):
                    print(f'{src.relative_to(root)}:{n} · {m.group(1)} · {line.strip()[:120]}')
        return
    print(f'<!-- inventory-scan: {len(pages)} routes under {appd.relative_to(root)}; signals are grep-level leads -->')
    print('| Route | Page | loading from | error from | not-found from | State signals | Controls (grep) | Files read |')
    print('|---|---|---|---|---|---|---|---|')
    for page in pages:
        srcs = local_sources(page)
        text = '\n'.join(p.read_text(encoding='utf-8', errors='replace') for p in srcs)
        states = ' · '.join(n for n, rx in SIGNALS if rx.search(text)) or '—'
        loading = nearest(page, ('loading.tsx', 'loading.jsx', 'loading.js'), appd)
        error = nearest(page, ('error.tsx', 'error.jsx', 'error.js'), appd)
        notfound = nearest(page, ('not-found.tsx', 'not-found.jsx', 'not-found.js'), appd)
        print(f'| `{route_of(page, appd)}` | {page.relative_to(appd)} | {loading} | {error} | {notfound} | {states} | '
              f'{len(CONTROL.findall(text))} | {len(srcs)} |')


if __name__ == '__main__':
    main()
