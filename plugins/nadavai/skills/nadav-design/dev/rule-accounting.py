#!/usr/bin/env python3
"""Prove that splitting SKILL.md lost no rule.

usage: python3 dev/rule-accounting.py <old SKILL.md> [--skill-dir <dir>] [--allow <file>]
  -> {"old_lines": n, "found": n, "allowed": n, "missing": [...], "weak": n, "twice": [...],
      "where": {"SKILL.md": n, "modes/setup.md": n, ...}}
  exit 0 when nothing is missing, 1 otherwise, 2 on usage

Every non-empty line of the old file (a rule, a step, a heading) must appear, as written, in the new SKILL.md or in
one of modes/*.md, shared/*.md of the skill folder. A line that was changed on purpose is listed, as written in the
old file, in the --allow file (one line per line, `#` starts a comment), and the count of those is printed, so a
reader sees exactly what was not a verbatim move.

What it does not prove: the order of the lines, or that a list kept its neighbours. `weak` counts the old lines
too short to prove anything alone (under 25 characters: a table separator, a bare heading); `twice` lists longer
lines that now sit in more than one file. For a first split, also diff each old section against its new file.
Get the old file with:
  git show <commit before the split>:plugins/nadavai/skills/nadav-design/SKILL.md > /tmp/old-SKILL.md
"""
import argparse
import glob
import json
import os
import sys


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument('old')
    ap.add_argument('--skill-dir', default=here)
    ap.add_argument('--allow')
    try:
        a = ap.parse_args()
    except SystemExit as e:
        sys.exit(0 if e.code == 0 else 2)
    try:
        old = open(a.old, encoding='utf-8').read().split('\n')
        allow = set()
        if a.allow:
            allow = {l.rstrip('\n').strip() for l in open(a.allow, encoding='utf-8')
                     if l.strip() and not l.lstrip().startswith('#')}
    except OSError as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        sys.exit(2)

    files = [os.path.join(a.skill_dir, 'SKILL.md')]
    files += sorted(glob.glob(os.path.join(a.skill_dir, 'modes', '*.md')))
    files += sorted(glob.glob(os.path.join(a.skill_dir, 'shared', '*.md')))
    lines_of = {}
    for f in files:
        try:
            lines_of[os.path.relpath(f, a.skill_dir)] = {l.strip() for l in open(f, encoding='utf-8').read().split('\n')}
        except OSError as e:
            print(json.dumps({'error': str(e)}, ensure_ascii=False))
            sys.exit(2)

    where, missing, found, allowed, total, weak, twice = {}, [], 0, 0, 0, 0, []
    for n, line in enumerate(old, 1):
        s = line.strip()
        if not s:
            continue
        total += 1
        homes = [name for name, ls in lines_of.items() if s in ls]
        home = homes[0] if homes else None
        if len(s) < 25:
            weak += 1
        elif len(homes) > 1:
            twice.append({'line': n, 'files': homes, 'text': s[:80]})
        if home:
            found += 1
            where[home] = where.get(home, 0) + 1
        elif s in allow:
            allowed += 1
        else:
            missing.append({'line': n, 'text': s[:160]})
    print(json.dumps({'old_lines': total, 'found': found, 'allowed': allowed, 'missing': missing, 'weak': weak,
                      'twice': twice, 'where': where},
                     ensure_ascii=False, indent=1))
    sys.exit(1 if missing else 0)


if __name__ == '__main__':
    main()
