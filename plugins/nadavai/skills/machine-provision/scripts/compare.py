#!/usr/bin/env python3
"""Compare two inventory.sh outputs and print what the target lacks, per section.

usage: python3 -I compare.py SRC.txt DST.txt [--ignore FILE]
  --ignore FILE  lines "section item" (or "section *") that are known, intended differences
                 (hardware-specific drivers, host tuning, the environment Nadav excluded).
Exit 0 when nothing unexplained is missing, 1 otherwise.
"""
import sys, collections

NOISE = ("fish:", "fnm env", "from sourcing", "called on", "called during", "Unknown command")
# user-commands on the source are looked up in the target's whole PATH, because the target
# often gets the same command from a pacman package in /usr/bin instead of ~/.local/bin.
CROSS = {"user-binaries": "path-commands", "user-scripts": "path-commands"}
SKIP = {"path-commands", "pkg-all"}   # reference sections, not compared on their own


def parse(path):
    d, cur = collections.defaultdict(set), None
    for raw in open(path, errors="replace"):
        line = raw.rstrip("\n")
        if line.startswith("##"):
            cur = line[2:].split()[0]; d[cur]; continue
        if cur and line.strip() and not any(n in line for n in NOISE):
            d[cur].add(line.strip())
    return d


def main():
    args = sys.argv[1:]
    ign = collections.defaultdict(set)
    if "--ignore" in args:
        i = args.index("--ignore"); f = args[i + 1]; del args[i:i + 2]
        for l in open(f):
            l = l.split("#", 1)[0].strip()
            if l:
                s, _, item = l.partition(" "); ign[s].add(item.strip())
    if len(args) != 2:
        sys.exit(__doc__)
    src, dst = parse(args[0]), parse(args[1])
    missing_any = False
    for sec, items in src.items():
        if sec in SKIP:
            continue
        have = dst.get(CROSS.get(sec, sec), set())
        miss = sorted(x for x in items - have if "*" not in ign[sec] and x not in ign[sec])
        if sec == "pkg-explicit-native":   # installed as a dependency on the target still counts
            miss = [x for x in miss if x not in dst.get("pkg-all", set())]
        if miss:
            missing_any = True
            print(f"== {sec}: {len(miss)} missing on target\n   " + " ".join(miss))
        else:
            print(f"== {sec}: ok")
    sys.exit(1 if missing_any else 0)


if __name__ == "__main__":
    main()
