#!/usr/bin/env python3
"""Check that every demo label the build plan cites exists in its section, and that every count it states matches.

usage: python3 check-anchors.py [--config redesign.json] [--plan path/to/plan.md]
exit 0 when no cited label is missing, no stated count is wrong, no cited screen is unknown and no unit id is stale;
1 otherwise. Missing input never reads as a pass: no sections folder, a configured screen without its section file,
or a missing plan is an error (exit 1); so is a `s-<id>` naming a screen the demo does not have (in backticks, or
bare and followed by a «…» quote on the same line), and a units table with rows but not one checked citation.

Labels. A citation is a «…» quote that follows a `s-<id>` token on the same plan line and starts with one of the
label words (the values of the config's "labels": today, after, new, state, proposal). It must match inside ONE
column label of that section (an element whose class list holds `col-label`, its <small> included), never merely
somewhere in the section's text: a changelog note that still quotes a renamed label would otherwise make a stale
citation read as found. A «…» inside a quote stands for omitted words; the pieces must appear in order.

Counts. After a `s-<id>` token these forms are checked against the section's column labels, in document order:
  the N «P» labels from «A» to «B»   labels starting with P, from the first containing A to the next containing B
  the N labels from «A» to «B»       every label, from the first starting with A to the next starting with B
  the N «P» labels up to «X»         labels starting with P, from the first to the one containing X
  the N «P» labels                   labels starting with P in the whole section
  N × «P»                            labels starting with P
The plan stops being read at its first heading that matches anchors.stop (default «## Round» or «## Changes»),
because change logs quote old labels on purpose.

Unit ids (only when anchors.unit_id, a regex, is set). Every id it matches in anchors.id_sources (globs, default
sections/*.html and FEATURES-PROPOSED.md) must be defined by the plan (the first cell of a table row), or listed in
anchors.retired; an id listed in anchors.split (id -> its halves) must name its half.
"""
import argparse
import html
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
Q = r'«((?:[^«»]|«[^«»]*»)*)»'
COUNT_FORMS = [
    ('range_p', re.compile(r'the (\d+) ' + Q + r' labels from ' + Q + r' to ' + Q)),
    ('range', re.compile(r'the (\d+) labels from ' + Q + r' to ' + Q)),
    ('upto_p', re.compile(r'the (\d+) ' + Q + r' labels up to ' + Q)),
    ('all_p', re.compile(r'the (\d+) ' + Q + r' labels(?! from| up to)')),
    ('times_p', re.compile(r'(\d+) × ' + Q)),
]


def norm(s):
    return re.sub(r'\s+', ' ', html.unescape(s).replace('‑', '-')).strip()


class LabelParser(HTMLParser):
    """Collects the text of every element whose class list holds col-label, nested markup included."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.labels, self.cur, self.depth, self.skip = [], None, 0, 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in VOID:
            return
        if self.cur is not None:
            self.depth += 1
        elif 'col-label' in (dict(attrs).get('class') or '').split():
            self.cur, self.depth = [], 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip -= 1
        if self.cur is not None and tag not in VOID:
            self.depth -= 1
            if self.depth == 0:
                self.labels.append(norm(' '.join(self.cur)))
                self.cur = None

    def handle_data(self, data):
        if self.cur is not None and not self.skip:
            self.cur.append(data)


def section_labels(raw):
    p = LabelParser()
    p.feed(raw)
    return p.labels


def quotes(line):
    out, depth, start = [], 0, None
    for i, ch in enumerate(line):
        if ch == '«':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '»' and depth:
            depth -= 1
            if depth == 0:
                out.append((start, line[start + 1:i]))
    return out


def piece(s):
    return norm(s.strip('…'))


def in_order(text, label):
    idx = 0
    for part in (norm(x) for x in label.split('…')):
        if not part:
            continue
        j = text.find(part, idx)
        if j < 0:
            return False
        idx = j + len(part)
    return True


def first_index(labels, pred, start=0):
    for i in range(start, len(labels)):
        if pred(labels[i]):
            return i
    return -1


def count(kind, labels, groups):
    if kind == 'range_p':
        p, a, b = (piece(x) for x in groups)
        pool = [l for l in labels if l.startswith(p)]
        i = first_index(pool, lambda l: a in l)
        j = first_index(pool, lambda l: b in l, max(i, 0))
        return None if i < 0 or j < 0 else j - i + 1
    if kind == 'range':
        a, b = (piece(x) for x in groups)
        i = first_index(labels, lambda l: l.startswith(a))
        j = first_index(labels, lambda l: l.startswith(b), max(i, 0))
        return None if i < 0 or j < 0 else j - i + 1
    if kind == 'upto_p':
        p, x = (piece(g) for g in groups)
        pool = [l for l in labels if l.startswith(p)]
        j = first_index(pool, lambda l: x in l)
        return None if j < 0 else j + 1
    p = piece(groups[0])
    return sum(1 for l in labels if l.startswith(p))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', default='redesign.json')
    ap.add_argument('--plan')
    args = ap.parse_args()
    cfg_path = pathlib.Path(args.config).resolve()
    C = json.loads(cfg_path.read_text(encoding='utf-8'))
    root = cfg_path.parent
    an = C.get('anchors', {})
    plan = pathlib.Path(args.plan).resolve() if args.plan else root / C.get('plan', 'plan/build-plan.md')
    sec_dir = root / C.get('dirs', {}).get('sections', 'sections')
    words = []
    for v in C.get('labels', {}).values():
        words.extend(v if isinstance(v, list) else [v])
    # a label word counts only as a whole word: «אחריות» is copy, not an «אחרי» label
    is_label = re.compile('(?:' + '|'.join(re.escape(w) for w in words) + r')(?=$|[\s·:])') if words else None
    stop = re.compile(an.get('stop', r'^## (Round|Changes)'))

    errors = []
    if not sec_dir.is_dir():
        errors.append(f'no sections folder at {sec_dir}')
    if not plan.is_file():
        errors.append(f'no plan at {plan}')
    if errors:
        for e in errors:
            print('error', e)
        return 1
    raw = {p.stem: p.read_text(encoding='utf-8') for p in sec_dir.glob('*.html')}
    errors += [f'screen {s["id"]} has no sections/{s["id"]}.html' for s in C.get('screens', []) if s['id'] not in raw]
    labels = {k: section_labels(v) for k, v in raw.items()}
    token = re.compile(r'(?<![\w-])`?s-([a-z0-9][a-z0-9-]*)`?')
    cited = re.compile(r'`s-([a-z0-9][a-z0-9-]*)`|(?<![\w-])s-([a-z0-9][a-z0-9-]*)(?=[^«\n]*«)')
    unit_rx = re.compile(r'\s*\|\s*`?(' + an['unit_id'] + r')`?\s*\|') if an.get('unit_id') else None
    unit_rows, in_units = 0, False
    checked, missing, counted, wrong, unknown = 0, [], 0, [], []
    text = plan.read_text(encoding='utf-8')
    for ln, line in enumerate(text.splitlines(), 1):
        if stop.match(line):
            break
        unknown += [(ln, m.group(1) or m.group(2)) for m in cited.finditer(line) if (m.group(1) or m.group(2)) not in labels]
        if line.startswith('#'):
            in_units = 'units' in line.lower()
        elif (unit_rx and unit_rx.match(line)) or (not unit_rx and in_units and line.startswith('|') and not re.match(r'\|\s*:?-', line) and 'Unit' not in line.split('|')[1]):
            unit_rows += 1
        tokens = [(m.start(), m.group(1)) for m in token.finditer(line) if m.group(1) in labels]
        if not tokens:
            continue
        for pos, label in quotes(line):
            before = [t for t in tokens if t[0] < pos]
            if not before or not is_label or not is_label.match(piece(label)):
                continue
            checked += 1
            sid = before[-1][1]
            if not any(in_order(l, label) for l in labels[sid]):
                missing.append((ln, sid, label))
        taken = []
        for kind, rx in COUNT_FORMS:
            for m in rx.finditer(line):
                if any(s <= m.start() < e for s, e in taken):
                    continue
                taken.append((m.start(), m.end()))
                before = [t for t in tokens if t[0] < m.start()]
                if not before:
                    continue
                sid = before[-1][1]
                stated, actual = int(m.group(1)), count(kind, labels[sid], m.groups()[1:])
                counted += 1
                if actual != stated:
                    wrong.append((ln, sid, m.group(0), stated, actual))
    print(f'{plan.name}: checked {checked} cited labels, {len(missing)} missing; {counted} stated counts, {len(wrong)} wrong; '
          f'{len(unknown)} unknown screens')
    if unit_rows and not checked:
        errors.append(f'the units table has {unit_rows} rows and cites no demo label: a plan that cites nothing is never "0 missing"')
    for e in errors:
        print('error', e)
    for ln, sid in unknown:
        print(f'  line {ln} · s-{sid} · no such screen in the demo')
    for ln, sid, label in missing:
        print(f'  line {ln} · s-{sid} · «{label}» is not inside any column label of the section')
    for ln, sid, phrase, stated, actual in wrong:
        print(f'  line {ln} · s-{sid} · {phrase} · the section has {actual}')

    stale = []
    if an.get('unit_id'):
        uid = re.compile(r'(?<![A-Za-z0-9-])(' + an['unit_id'] + r')(?![A-Za-z0-9])')
        defined = set()
        for line in text.splitlines():
            m = re.match(r'\s*\|\s*`?([^|`]+?)`?\s*\|', line)
            if m:
                defined.update(h.group(1) for part in re.split(r'[,\s]+', m.group(1)) for h in [uid.match(part.strip('`'))] if h)
        retired, split = set(an.get('retired', [])), an.get('split', {})
        for pattern in an.get('id_sources', ['sections/*.html', 'FEATURES-PROPOSED.md']):
            for path in sorted(root.glob(pattern)):
                body = path.read_text(encoding='utf-8')
                if path.suffix == '.html':
                    body = html.unescape(re.sub(r'<[^>]+>', ' ', body))
                for n, line in enumerate(body.splitlines(), 1):
                    for m in uid.finditer(line):
                        if m.group(1) in split:
                            stale.append((path.relative_to(root), n, m.group(1), 'split: name ' + split[m.group(1)]))
                        elif m.group(1) not in defined and m.group(1) not in retired:
                            stale.append((path.relative_to(root), n, m.group(1), 'not defined in the plan'))
        print(f'unit ids: {len(defined)} defined by the plan; {len(stale)} stale citations')
        for f, n, u, why in stale:
            print(f'  {f}:{n} · {u} · {why}')
    return 1 if errors or missing or wrong or unknown or stale else 0


if __name__ == '__main__':
    sys.exit(main())
