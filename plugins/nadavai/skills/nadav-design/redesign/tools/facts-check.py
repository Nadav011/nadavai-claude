#!/usr/bin/env python3
"""Check a client demo's pages against its one facts file.

usage: python3 tools/facts-check.py --facts content/facts.json <page.html|page.md|dir> [...]
  -> {"pages": n, "numbers_checked": n, "problems": [...]}; exit 0 when there are none, 1 otherwise, 2 on usage

Ported from the general half of the Kfir Bar demo's `_tools/check_facts.py`. What it checks:
1. No open value in the facts: a text value that is empty or starts with TBD or TODO.
2. Every figure in a page that a reader takes as a fact (a number with a thousands separator, or an amount next to
   a currency sign or the words ש"ח / שקל) is a number that exists in the facts file. A figure typed by hand into
   a page fails. Years, phone numbers and small counts are not checked this way.
3. No placeholder left in a page: a bracketed fill-in ([שם], [name]), TODO, TBD, XXX, lorem ipsum.
Text is read as a reader meets it: tags stripped, entities decoded, and the alt, title, placeholder, aria-label,
content and value attributes included.

What it does not check, and stays with the fresh reviewer: that names, dates and button labels agree between pages
and e-mails, and anything arithmetic about this demo's own story (totals that must add up, ages against years),
which belongs in a small check written for that demo.
"""
import argparse
import html
import json
import os
import re
import sys

PAGE_EXT = ('.html', '.htm', '.md', '.txt', '.mjml')
THOUSANDS = re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])')
MONEY = re.compile(r'(?:[₪$€]\s?(\d[\d,]*(?:\.\d+)?))|(?:(\d[\d,]*(?:\.\d+)?)\s?(?:₪|\$|€|ש"ח|ש״ח|שקלים|שקל)(?![\w]))')
PLACEHOLDER = re.compile(r'(?<![\w)\]])\[(?=[^\]\[\n]*[A-Za-z\u0590-\u05FF]{2})[^\]\[\n]{1,40}\](?![(\[:])|\bTODO\b|\bTBD\b|\bXXX+\b|lorem ipsum', re.IGNORECASE)
# a bracket that is ordinary writing, not a fill-in: a footnote number, a checkbox, a markdown link label
NOT_PLACEHOLDER = re.compile(r'^\[(?:\d+|x| )\]$', re.IGNORECASE)


def norm(num):
    """'12,500.0' -> '12500', '3.50' -> '3.5'"""
    s = num.replace(',', '')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return s


def collect(node, path, allowed, problems):
    if isinstance(node, dict):
        for k, v in node.items():
            collect(v, f'{path}.{k}' if path else str(k), allowed, problems)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            collect(v, f'{path}[{i}]', allowed, problems)
    elif isinstance(node, bool) or node is None:
        return
    elif isinstance(node, (int, float)):
        allowed.add(norm(repr(node) if isinstance(node, float) else str(node)))
    elif isinstance(node, str):
        if not path.split('.')[-1].startswith('_'):
            if not node.strip() or re.match(r'\s*(TBD|TODO)\b', node):
                problems.append(f'facts: open value {path} = {node!r}')
        for m in re.finditer(r'\d[\d,]*(?:\.\d+)?', node):
            allowed.add(norm(m.group(0)))


def text_of(path):
    raw = open(path, encoding='utf-8', errors='replace').read()
    if path.lower().endswith(('.html', '.htm', '.mjml')):
        raw = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', raw)
        raw = re.sub(r'(?s)<!--.*?-->', ' ', raw)
        # text a reader meets that lives in attributes
        attrs = re.findall(r'(?is)\b(?:alt|title|placeholder|aria-label|content|value)\s*=\s*"([^"]*)"', raw)
        raw = re.sub(r'<[^>]+>', ' ', raw) + ' ' + ' '.join(attrs)
        raw = html.unescape(raw)
    return raw


def pages_of(args):
    out = []
    for a in args:
        if os.path.isdir(a):
            for root, dirs, files in os.walk(a):
                dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '_tools', '_qa')]
                out += [os.path.join(root, f) for f in sorted(files) if f.lower().endswith(PAGE_EXT)]
        else:
            out.append(a)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--facts', required=True)
    ap.add_argument('pages', nargs='+')
    try:
        a = ap.parse_args()
    except SystemExit as e:
        sys.exit(0 if e.code == 0 else 2)
    try:
        facts = json.load(open(a.facts, encoding='utf-8'))
    except (OSError, ValueError) as e:
        print(json.dumps({'error': f'{a.facts}: {e}'}, ensure_ascii=False))
        sys.exit(2)

    problems, allowed = [], set()
    collect(facts, '', allowed, problems)
    missing = [p for p in a.pages if not os.path.exists(p)]
    if missing:
        print(json.dumps({'error': 'no such page or folder: ' + ', '.join(missing)}, ensure_ascii=False))
        sys.exit(2)
    pages = pages_of(a.pages)
    if not pages:
        problems.append('no page found to check')
    checked = 0
    for page in pages:
        try:
            text = text_of(page)
        except OSError as e:
            problems.append(f'{page}: {e}')
            continue
        name = os.path.relpath(page)
        figures = set(m.group(0) for m in THOUSANDS.finditer(text))
        figures |= set(g for m in MONEY.finditer(text) for g in m.groups() if g)
        for fig in sorted(figures):
            checked += 1
            if norm(fig) not in allowed:
                problems.append(f'{name}: the figure {fig} is not in the facts file')
        for m in PLACEHOLDER.finditer(text):
            if not NOT_PLACEHOLDER.match(m.group(0)):
                problems.append(f'{name}: placeholder left in the page: {m.group(0)}')

    print(json.dumps({'pages': len(pages), 'numbers_checked': checked, 'problems': problems}, ensure_ascii=False))
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
