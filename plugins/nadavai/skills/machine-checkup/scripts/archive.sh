#!/bin/bash
# Copy paths under $HOME to <host>:/mnt/data/archive/<name>/<same relative path> and verify the copy.
# It never deletes. Each verified path goes into a per-run receipt; before deleting, re-run with
# --check <receipt> (recomputes the local manifest now) and rm only the lines it prints as OK.
#
# usage: archive.sh <archive-name> <path under $HOME>...
#        archive.sh --check <receipt>
# env:   ARCHIVE_HOST (default omarchy)  CHECKUP_DIR (default ~/cleanup-audit-<date>)
#        ARCH_IONICE (default "-c2 -n7"; "-c3" while another session is measuring the disk)
#
# Fail-closed: every step's exit status is checked; the manifest (manifest.py) covers type, path,
# symlink target and content of every entry. Exit status 1 if any path failed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd); mf=$here/manifest.py
io=${ARCH_IONICE:--c2 -n7}
local_manifest() { ionice $io nice -n 19 python3 -I "$mf" "$1"; }

if [ "${1:-}" = --check ]; then          # re-verify a receipt against the sources as they are now
  rc=0
  while IFS=$'\t' read -r src sum _; do
    now=$(local_manifest "$src" 2>/dev/null) || now=""
    if [ "$now" = "$sum" ]; then echo "OK $src"; else echo "CHANGED $src (keep it, archive again)"; rc=1; fi
  done < "${2:?receipt}"
  exit $rc
fi

name=${1:?archive name}; shift
[[ $name =~ ^[A-Za-z0-9._-]+$ && $name != .* ]] || { echo "bad archive name: $name" >&2; exit 2; }
host=${ARCHIVE_HOST:-omarchy}; mnt=/mnt/data; dst=$mnt/archive/$name
dir=${CHECKUP_DIR:-$HOME/cleanup-audit-$(date +%F)}; mkdir -p "$dir"
run=$(date +%Y%m%dT%H%M%S)-$$; receipt=$dir/archive-$run.receipt; log=$dir/archive-$run.log; fail=0
q() { printf '%q' "$1"; }                # quote one argument for the remote shell (bash on omarchy)
remote_manifest() { ssh "$host" "python3 -I - $(q "$1")" < "$mf"; }
remote_exists() {                        # prints yes / no; any other outcome is a failure
  local out; out=$(ssh "$host" "if test -e $(q "$1") || test -L $(q "$1"); then echo yes; else echo no; fi") || return 1
  [[ $out == yes || $out == no ]] && echo "$out"
}

# The archive must be another machine, and the archive dir must really sit on its archive disk.
[ "$(ssh "$host" hostname 2>/dev/null)" != "$(hostname)" ] || { echo "archive host is this machine" >&2; exit 2; }
ssh "$host" "mountpoint -q $mnt && mkdir -p $(q "$dst") && [ \"\$(realpath -e $(q "$dst"))\" = $(q "$dst") ] && [ \"\$(findmnt -no TARGET -T $(q "$dst"))\" = $mnt ]" \
  || { echo "archive dir $dst on $host is not a plain directory on the $mnt disk" >&2; exit 2; }

for arg in "$@"; do
  src=$(realpath -e -- "${arg%/}" 2>/dev/null) || { echo "FAILED missing $arg" >> "$log"; fail=1; continue; }
  case "$src" in "$HOME"/?*) ;; *) echo "FAILED outside \$HOME after resolving: $arg -> $src" >> "$log"; fail=1; continue ;; esac
  [ "$src" = "${arg%/}" ] || { echo "FAILED path is or passes through a symlink: $arg -> $src" >> "$log"; fail=1; continue; }
  rel=${src#$HOME/}; parent=$(dirname "$rel")
  ex=$(remote_exists "$dst/$rel") || { echo "FAILED could not check the archive for $rel" >> "$log"; fail=1; continue; }
  [ "$ex" = no ] || { echo "FAILED already in archive (use a new archive name): $rel" >> "$log"; fail=1; continue; }
  size=$(du -sk -- "$src" | cut -f1)
  free=$(ssh "$host" "df -Pk $(q "$dst") | awk 'NR==2{print \$4}'") || free=0
  [ "${free:-0}" -gt $((size * 12 / 10)) ] || { echo "FAILED not enough space on $host for $rel" >> "$log"; fail=1; continue; }
  # Absolute symlinks still point at the original location after deletion: listed for the caller.
  find "$src" -type l -lname '/*' -printf "NOTE absolute symlink %p -> %l\n" >> "$log"
  echo "$(date +%T) copy $rel -> $host:$dst/$rel" >> "$log"
  ssh "$host" "mkdir -p $(q "$dst/$parent")" || { echo "FAILED mkdir $rel" >> "$log"; fail=1; continue; }
  # -s (protect args): rsync passes the remote path itself, so it must not be shell-quoted here.
  ionice $io rsync -aHAX -s -- "$src" "$host:$dst/$parent/" >> "$log" 2>&1 || { echo "FAILED rsync $rel" >> "$log"; fail=1; continue; }
  t0=$(date +%s)                         # before hashing: a write during verification is newer than t0
  l=$(local_manifest "$src") || l=""
  r=$(remote_manifest "$dst/$rel") || r=""
  if [[ ${#l} -eq 64 && $l == "$r" ]]; then
    printf '%s\t%s\t%s\n' "$src" "$l" "$t0" >> "$receipt"; echo "$(date +%T) VERIFIED $rel ($l)" >> "$log"
  else echo "FAILED verify $rel local=$l remote=$r (kept)" >> "$log"; fail=1; fi
done
echo "receipt: $receipt"; echo "log: $log"
exit $fail
