# Print one sha256 that covers a tree: for every entry its type, relative path and symlink target
# (JSON-encoded, so spaces and newlines in names cannot make two different trees look the same),
# plus the content hash of every regular file. Exits non-zero on any read error.
# usage: python3 -I manifest.py <path>     (also run over ssh as: python3 -I - <path> < manifest.py)
import hashlib, json, os, stat, sys
root = sys.argv[1]
if not os.path.lexists(root): sys.exit(f"missing: {root}")
records = []
def entry(path, rel):
    st = os.lstat(path); m = st.st_mode
    if stat.S_ISLNK(m): records.append(["l", rel, os.readlink(path), ""])
    elif stat.S_ISDIR(m): records.append(["d", rel, "", ""])
    elif stat.S_ISREG(m):
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
        records.append(["f", rel, "", h.hexdigest()])
    else: records.append(["s", rel, oct(stat.S_IFMT(m)), ""])   # fifo, socket, device
def onerror(e): raise e
entry(root, ".")
if os.path.isdir(root) and not os.path.islink(root):
    for dirpath, dirnames, filenames in os.walk(root, onerror=onerror):
        for n in dirnames + filenames:
            p = os.path.join(dirpath, n); entry(p, os.path.relpath(p, root))
records.sort()
print(hashlib.sha256("\n".join(json.dumps(r) for r in records).encode()).hexdigest())
