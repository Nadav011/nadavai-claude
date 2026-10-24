#!/bin/bash
# Copy paths under $HOME to <host>:/mnt/data/archive/<name>/<same relative path> and verify the copy.
# It never deletes. Each verified path is written to a per-run receipt; the caller deletes from that
# receipt with literal-path rm, after checking nothing changed since (see SKILL.md step 4).
#
# usage: archive.sh <archive-name> <path under $HOME>...
# env:   ARCHIVE_HOST (default omarchy)  CHECKUP_DIR (default ~/cleanup-audit-<date>)
#        ARCH_IONICE (default "-c2 -n7"; "-c3" while another session is measuring the disk)
#
# Verification is fail-closed: every step's exit status is checked, and the manifest covers type,
# relative path, size, symlink target and sha256 of regular files, so missing empty dirs, broken or
# changed symlinks and special files all count as a mismatch. Exit status is 1 if any path failed.
set -uo pipefail
name=${1:?archive name}; shift
[[ $name =~ ^[A-Za-z0-9._-]+$ && $name != .* ]] || { echo "bad archive name: $name" >&2; exit 2; }
host=${ARCHIVE_HOST:-omarchy}; root=/mnt/data/archive; dst=$root/$name
dir=${CHECKUP_DIR:-$HOME/cleanup-audit-$(date +%F)}; mkdir -p "$dir"
run=$(date +%Y%m%dT%H%M%S)-$$; receipt=$dir/archive-$run.receipt; log=$dir/archive-$run.log
io=${ARCH_IONICE:--c2 -n7}; fail=0
q() { printf '%q' "$1"; }                       # quote one argument for the remote shell

# The archive must be another machine with the archive disk mounted.
[ "$(ssh "$host" hostname 2>/dev/null)" != "$(hostname)" ] || { echo "archive host is this machine" >&2; exit 2; }
ssh "$host" "mountpoint -q $(q "$(dirname "$root")") && mkdir -p $(q "$dst")" || { echo "archive disk not mounted on $host" >&2; exit 2; }

# Manifest: one line per entry (type, path, size, link target), plus content hashes of regular files.
manifest() {  # run inside the parent dir; $1 = basename
  { find ./"$1" -printf '%y %P %l\n' | LC_ALL=C sort &&
    find ./"$1" -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum; } | sha256sum | cut -c1-64
}
remote_manifest() {  # $1 = remote parent dir, $2 = basename; same function, run over ssh
  ssh "$host" "set -o pipefail; cd $(q "$1") && { find ./$(q "$2") -printf '%y %P %l\n' | LC_ALL=C sort && find ./$(q "$2") -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum; } | sha256sum | cut -c1-64"
}

for arg in "$@"; do
  src=$(realpath -e -- "${arg%/}" 2>/dev/null) || { echo "FAILED missing $arg" >> "$log"; fail=1; continue; }
  case "$src" in "$HOME"/?*) ;; *) echo "FAILED outside \$HOME after resolving: $arg -> $src" >> "$log"; fail=1; continue ;; esac
  [ "$src" = "${arg%/}" ] || { echo "FAILED path is or passes through a symlink: $arg -> $src" >> "$log"; fail=1; continue; }
  rel=${src#$HOME/}; parent=$(dirname "$rel"); base=$(basename "$src")
  if ssh "$host" "test -e $(q "$dst/$rel")"; then echo "FAILED already in archive (use a new archive name): $rel" >> "$log"; fail=1; continue; fi
  size=$(du -sk -- "$src" | cut -f1); free=$(ssh "$host" "df -Pk $(q "$dst") | awk 'NR==2{print \$4}'")
  [ "${free:-0}" -gt $((size * 12 / 10)) ] || { echo "FAILED not enough space on $host for $rel" >> "$log"; fail=1; continue; }
  # Outside symlinks still point at the original location after deletion: record them for the caller.
  find "$src" -type l -lname '/*' -printf "NOTE absolute symlink %p -> %l\n" >> "$log"
  echo "$(date +%T) copy $rel -> $host:$dst/$rel" >> "$log"
  ssh "$host" "mkdir -p $(q "$dst/$parent")" || { echo "FAILED mkdir $rel" >> "$log"; fail=1; continue; }
  ionice $io rsync -aHAX -- "$src" "$host:$(q "$dst/$parent")/" >> "$log" 2>&1 || { echo "FAILED rsync $rel" >> "$log"; fail=1; continue; }
  l=$(cd "$(dirname "$src")" && ionice $io nice -n 19 bash -c "$(declare -f manifest); set -o pipefail; manifest $(q "$base")") || l=""
  r=$(remote_manifest "$dst/$parent" "$base") || r=""
  if [[ ${#l} -eq 64 && $l == "$r" ]]; then
    printf '%s\t%s\t%s\n' "$src" "$l" "$(date +%s)" >> "$receipt"
    echo "$(date +%T) VERIFIED $rel ($l)" >> "$log"
  else echo "FAILED verify $rel local=$l remote=$r (kept)" >> "$log"; fail=1; fi
done
echo "receipt: $receipt"; echo "log: $log"
exit $fail
