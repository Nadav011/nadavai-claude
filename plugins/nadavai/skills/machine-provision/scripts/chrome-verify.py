#!/usr/bin/env python3
"""Prove that Chrome on this machine can decrypt the copied profiles, without printing any secret.

usage: python3 -I chrome-verify.py [USER_DATA_DIR]   (default ~/.config/google-chrome)
Reads the "Chrome Safe Storage" key from the Secret Service (secret-tool), and for every profile
(Default, Profile N) decrypts up to 200 v11 cookies and saved passwords on a copy of each
database, counting valid PKCS7 padding. All-valid means the key matches; zero valid means Chrome
will drop logins and passwords. Exit 1 if any profile fails.
Over ssh, set DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus first.
"""
import glob, hashlib, os, shutil, sqlite3, subprocess, sys, tempfile

try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
except ImportError:
    sys.exit("python-cryptography is missing (pacman -S python-cryptography)")

root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.config/google-chrome")
pw = subprocess.run(["secret-tool", "lookup", "application", "chrome"], capture_output=True).stdout.strip()
if not pw:
    sys.exit("no 'Chrome Safe Storage' secret in this keyring (application=chrome)")
key = hashlib.pbkdf2_hmac("sha1", pw, b"saltysalt", 1, 16)
del pw
profiles = [p for p in [os.path.join(root, "Default")] + sorted(glob.glob(os.path.join(root, "Profile *"))) if os.path.isdir(p)]
if not profiles:
    sys.exit(f"no profiles under {root}")
bad = False
for prof in profiles:
    for db, table, col in (("Cookies", "cookies", "encrypted_value"), ("Login Data", "logins", "password_value")):
        src = os.path.join(prof, db)
        if not os.path.exists(src):
            continue
        with tempfile.TemporaryDirectory() as t:   # the copy holds ciphertext only and is removed here
            dst = os.path.join(t, "db"); shutil.copy(src, dst)
            rows = [v for (v,) in sqlite3.connect(dst).execute(f"select {col} from {table}") if bytes(v[:3]) == b"v11"][:200]
        ok = 0
        for v in rows:
            d = Cipher(algorithms.AES(key), modes.CBC(b" " * 16)).decryptor()
            p = d.update(bytes(v[3:])) + d.finalize()
            ok += 1 <= p[-1] <= 16 and p[-p[-1]:] == bytes([p[-1]]) * p[-1]
        print(f"{os.path.basename(prof)}/{db}: tested={len(rows)} decrypt_ok={ok}")
        bad |= bool(rows) and ok < len(rows) * 0.95
sys.exit(1 if bad else 0)
