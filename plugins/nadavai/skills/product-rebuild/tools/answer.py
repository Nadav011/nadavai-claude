#!/usr/bin/env python3
"""Append numbered owner decisions to DECISIONS-ANSWERED.md and mark the question bank.

usage: answer.py [output-repo]   (default: the current directory)
stdin, one per line: <Qid>|<date>|<short question>|<answer>
"""
import pathlib, re, sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
ans = root / "DECISIONS-ANSWERED.md"
bank = root / "DECISIONS-OPEN.md"
text = ans.read_text(encoding="utf-8")
nums = [int(m) for m in re.findall(r"^\| (\d+) \|", text, re.M)]
n = max(nums) if nums else 0
b = bank.read_text(encoding="utf-8") if bank.exists() else ""
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    qid, date, q, a = line.split("|", 3)
    n += 1
    if not text.endswith("\n"):
        text += "\n"
    text += f"| {n} | {date} | {qid}: {q} | {a} |\n"
    if b:
        b, c = re.subn(rf"^(\| {re.escape(qid)} \|.*\| )פתוח( \|)$", rf"\g<1>נענה #{n}\g<2>", b, flags=re.M)
        if c > 1:
            print(f"WARNING: {qid} matched {c} open rows", file=sys.stderr)
    print(f"{qid} -> #{n}")
ans.write_text(text, encoding="utf-8")
if b:
    bank.write_text(b, encoding="utf-8")
