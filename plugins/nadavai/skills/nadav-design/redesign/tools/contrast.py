#!/usr/bin/env python3
"""WCAG 2 contrast of colour pairs, for BRIEF.md's «Measured contrast» column.

usage: python3 contrast.py '#eef1f4/#111418' '#a9b1bbcc/#1b2027' ...
Each pair is foreground/background in hex (#rgb, #rrggbb or #rrggbbaa); a translucent foreground is composited over the
background first. Prints the ratio and whether it meets 4.5:1 (body text) and 3:1 (large text, icons, borders).
The rendered demo is checked by shoot.mjs (`advisory.contrast`); this is for the palette before any phone exists.
"""
import sys


def rgb(h):
    h = h.strip().lstrip('#')
    if len(h) in (3, 4):
        h = ''.join(c * 2 for c in h)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)], a


def lum(c):
    c = [x / 255 for x in c]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(fg, bg):
    (f, a), (b, _) = rgb(fg), rgb(bg)
    mixed = [a * x + (1 - a) * y for x, y in zip(f, b)]
    l1, l2 = lum(mixed), lum(b)
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0 if len(sys.argv) > 1 else 2)
    for pair in sys.argv[1:]:
        fg, bg = pair.split('/')
        r = ratio(fg, bg)
        print(f'{fg} on {bg}: {r:.2f}:1 · body {"ok" if r >= 4.5 else "FAIL"} · large {"ok" if r >= 3 else "FAIL"}')
