#!/usr/bin/env bash
# Tests for machine-checkup's scripts/archive.sh with a fake ssh that runs the remote command
# locally (as a fish login shell would refuse bash syntax, the fake runs only what it is given:
# `bash -s` / `bash -c` / rsync's server), HOME in a temp dir and a fake hostname for the "other
# machine". No real host is contacted.
#   tests/archive-sh.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
arch=$here/../plugins/nadavai/skills/machine-checkup/scripts/archive.sh
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
export HOME=$t/home
mkdir -p "$HOME" "$t/fakebin" "$t/remote"
# Fake ssh: drop ssh options and the host, refuse anything that is not bash, rsync or hostname
# (a bare `if ...; then` line would fail under the MSI's fish), and run it here.
cat >"$t/fakebin/ssh" <<'EOF'
#!/bin/bash
while [[ ${1:-} == -* ]]; do case "$1" in -o|-p|-l|-i) shift 2 ;; *) shift ;; esac; done
shift   # the host
# ssh joins its arguments into one line that the remote login shell parses: do the same.
eval "set -- $*"
case "${1:-}" in
  hostname) echo otherhost ;;
  bash|rsync) exec "$@" ;;
  *) echo "fake fish: cannot run: $*" >&2; exit 127 ;;
esac
EOF
chmod +x "$t/fakebin/ssh"
export PATH=$t/fakebin:$PATH
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

src=$HOME/old-stuff
mkdir -p "$src/sub"; echo hello >"$src/sub/a.txt"; ln -s sub/a.txt "$src/link"
# The remote archive sits on the fake remote's root filesystem, as on the MSI.
mnt=$(findmnt -no TARGET -T "$t/remote")
export ARCHIVE_HOST=fake ARCHIVE_MNT=$mnt ARCHIVE_DIR=$t/remote/archive CHECKUP_DIR=$t/audit
out=$(bash "$arch" run1 "$src" 2>&1); rc=$?
[ "$rc" = 0 ] && ok "archive to a host whose login shell runs no bash syntax" || bad "archive exit $rc: $out $(cat "$t"/audit/*.log 2>/dev/null)"
[ -f "$t/remote/archive/run1/old-stuff/sub/a.txt" ] && [ -L "$t/remote/archive/run1/old-stuff/link" ] && ok "files and symlinks land under ARCHIVE_DIR" || bad "copy missing: $(find "$t/remote" | head)"
r=$(ls "$t"/audit/*.receipt 2>/dev/null | head -n1)
[ -n "$r" ] && bash "$arch" --check "$r" | grep -q "^OK $src$" && ok "--check says OK for an unchanged source" || bad "--check: $(bash "$arch" --check "$r" 2>&1)"
echo changed >"$src/sub/a.txt"
bash "$arch" --check "$r" | grep -q "^CHANGED $src" && ok "--check says CHANGED after an edit" || bad "--check after edit"
bash "$arch" run1 "$src" >/dev/null 2>&1 && bad "the same archive name twice fails" || ok "the same archive name twice fails"
ARCHIVE_MNT=/nonexistent-mnt bash "$arch" run2 "$src" >/dev/null 2>&1 && bad "an archive dir off the named disk is refused" || ok "an archive dir off the named disk is refused"
exit $fail
