#!/usr/bin/env bash
# Runs the real pre-push hook with the real trivy on feature-branch pushes in throwaway repos
# (a feature branch stops after the trivy layer) and checks that it scans what the push carries:
# a pushed secret blocks, a secret in an ignored or untracked file does not, a vulnerable
# lockfile blocks only when the push changes dependencies, a new branch is scanned from where it
# leaves main (not from the root), and a stale working folder does not decide the outcome.
#
#   tests/pre-push-trivy.sh        needs trivy and its vulnerability database (first run downloads it)
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
HOOK=${HOOK:-$here/git/hooks/pre-push}
command -v trivy >/dev/null || { echo "skip: trivy is not installed"; exit 0; }
t=$(mktemp -d) || exit 1
trap 'rm -rf -- "$t"' EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
key() { printf 'aws_access_key_id = AKIA%s\naws_secret_access_key = %s\n' Q3EGRVVHYZXNBWUH wJalrXUtnFEMI/K7MDENG/bPxRfiCYzExampleKeyZ; }
# A lockfile with lodash 4.17.4 (CVE-2019-10744, CRITICAL).
lock() { cat <<'EOF'
{"name":"p","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"p","version":"1.0.0","dependencies":{"lodash":"4.17.4"}},"node_modules/lodash":{"version":"4.17.4","resolved":"https://registry.npmjs.org/lodash/-/lodash-4.17.4.tgz"}}}
EOF
}
# push <dir> <local sha> <remote sha>: the hook's exit code, its output in $t/out
push() {
  (cd "$1" && printf 'refs/heads/feat %s refs/heads/feat %s\n' "$2" "$3" |
    TRIVY_CACHE_DIR=$cache HOME=$t/home GIT_DIR=.git bash "$HOOK" origin https://example.invalid/r.git) >"$t/out" 2>&1
}
z=0000000000000000000000000000000000000000
mkdir -p "$t/home"; cache=${TRIVY_CACHE_DIR:-$HOME/.cache/trivy}
r=$t/repo; git init -q -b main "$r" && cd "$r" || exit 1
git config user.email t@t.invalid; git config user.name t; git config core.hooksPath /dev/null
echo '# r' >README.md; printf 'ignored.env\n' >.gitignore; lock >package-lock.json
git add -A && git commit -qm base && base=$(git rev-parse HEAD)
git update-ref refs/remotes/origin/main "$base"

echo 'more' >>README.md; git commit -qam docs; c1=$(git rev-parse HEAD)
key >ignored.env; key >untracked.txt
push "$r" "$c1" "$base"; rc=$?
[ "$rc" = 0 ] && ok "a docs push passes while ignored and untracked files hold secrets" || bad "docs push blocked ($rc): $(tail -4 "$t/out")"
grep -q 'for secrets, ' "$t/out" && ok "a push that changes no dependency file scans secrets only" || bad "scanners: $(grep scanned "$t/out")"
grep -q 'vuln' "$t/out" && bad "the vulnerable lockfile was scanned though the push did not change it" || ok "the unchanged vulnerable lockfile does not block"

key >config.env; git add config.env; git commit -qm secret; c2=$(git rev-parse HEAD)
push "$r" "$c2" "$c1"; rc=$?
[ "$rc" = 1 ] && grep -q 'config.env' "$t/out" && ok "a pushed secret blocks and is named" || bad "pushed secret: rc=$rc $(grep -E 'scanned|config' "$t/out")"
git rm -q config.env; git commit -qm unsecret; c3=$(git rev-parse HEAD)

sed -i 's/"p"/"q"/g' package-lock.json; git commit -qam deps; c4=$(git rev-parse HEAD)
push "$r" "$c4" "$c3"; rc=$?
[ "$rc" = 1 ] && grep -q 'lodash' "$t/out" && ok "a push that changes the lockfile scans it and blocks on lodash" || bad "lockfile: rc=$rc $(grep -E 'scanned|lodash|failed' "$t/out")"

git update-ref refs/remotes/origin/main "$c3"   # the remote already has main up to c3
git checkout -q -b feat "$c3"; echo x >a.txt; git add a.txt; git commit -qm a; c5=$(git rev-parse HEAD)
push "$r" "$c5" "$z"; rc=$?
grep -qE 'scanned 1 pushed' "$t/out" && ok "a new branch is scanned from what origin already has, not from the root" || bad "new branch range: $(grep scanned "$t/out")"
[ "$rc" = 0 ] && grep -q 'for secrets, ' "$t/out" && ok "...and its range changes no dependency file, so secrets only, and it passes" || bad "new branch rc=$rc $(grep scanned "$t/out")"

# The working folder is behind the pushed commit and holds a secret the commit does not.
git checkout -q main; git checkout -q "$c1"; key >README.md
push "$r" "$c3" "$c2"; rc=$?
[ "$rc" = 0 ] && ok "the pushed commit decides, not a stale or dirty working folder" || bad "stale folder decided: rc=$rc $(tail -3 "$t/out")"
git checkout -q -- README.md

push "$r" "$z" "$c3"; rc=$?
[ "$rc" = 0 ] && ok "a branch deletion scans nothing" || bad "deletion rc=$rc"

# A key committed and removed again inside one push still reaches the remote's history.
git checkout -q main; key >c.env; git add c.env; git commit -qm add-key; git rm -q c.env; git commit -qm drop-key; c6=$(git rev-parse HEAD)
push "$r" "$c6" "$c4"; rc=$?
[ "$rc" = 1 ] && grep -q 'c.env' "$t/out" && ok "a key added and removed inside one push blocks" || bad "add-then-remove: rc=$rc $(grep scanned "$t/out")"
git reset -q --hard "$c4"
key >d.env; git add d.env; git commit -qm add-key; echo clean >d.env; git commit -qam edit-key-out; c7=$(git rev-parse HEAD)
push "$r" "$c7" "$c4"; rc=$?
[ "$rc" = 1 ] && ok "a key edited out later in the same push blocks" || bad "edit-out: rc=$rc"
git reset -q --hard "$c4"
# A smudge filter must not decide: the stored blob is what the push carries.
printf '*.dec filter=dec\n' >.gitattributes; git add .gitattributes; git commit -qm attrs; c8=$(git rev-parse HEAD)
git config filter.dec.smudge "sh -c 'cat >/dev/null; printf \"aws_access_key_id = AKIAQ3EGRVVHYZXNBWUH\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYzExampleKeyZ\n\"'"
git config filter.dec.clean cat
echo ciphertext >x.dec; git add x.dec; git commit -qm enc; c9=$(git rev-parse HEAD)
push "$r" "$c9" "$c8"; rc=$?
[ "$rc" = 0 ] && ok "a smudge filter's output is not scanned, only the stored blob" || bad "smudge decided: rc=$rc"
git config --unset filter.dec.smudge; git reset -q --hard "$c4"
# Several refs in one push: a secret on a ref that is not the last one still blocks.
git checkout -q -b a "$c4"; key >e.env; git add e.env; git commit -qm a-key; ca=$(git rev-parse HEAD)
git checkout -q -b b "$c4"; echo ok >b.txt; git add b.txt; git commit -qm b; cb=$(git rev-parse HEAD)
(cd "$r" && printf 'refs/heads/a %s refs/heads/a %s\nrefs/heads/b %s refs/heads/b %s\nrefs/heads/old %s refs/heads/old %s\n' "$ca" "$z" "$cb" "$z" "$z" "$c4" |
  TRIVY_CACHE_DIR=$cache HOME=$t/home GIT_DIR=.git bash "$HOOK" origin https://example.invalid/r.git) >"$t/out" 2>&1; rc=$?
[ "$rc" = 1 ] && grep -q 'e.env' "$t/out" && ok "a secret on the first of three refs (the last a deletion) blocks" || bad "multi-ref: rc=$rc $(grep scanned "$t/out")"

# A first push (no remote-tracking refs at all) scans the pushed history, not only the tree.
f=$t/first; git init -q -b main "$f"; git -C "$f" config user.email t@t.invalid; git -C "$f" config user.name t; git -C "$f" config core.hooksPath /dev/null
key >"$f/c.env"; git -C "$f" add c.env; git -C "$f" commit -qm add; git -C "$f" rm -q c.env; git -C "$f" commit -qm drop
mkdir -p "$f/פרויקט"; lock >"$f/פרויקט/package-lock.json"; git -C "$f" add -A; git -C "$f" commit -qm deps; fh=$(git -C "$f" rev-parse HEAD)
push "$f" "$fh" "$z"; rc=$?
[ "$rc" = 1 ] && grep -q 'c.env' "$t/out" && ok "a first push blocks on a key it added and removed" || bad "first push key: rc=$rc $(grep scanned "$t/out")"
grep -q 'lodash' "$t/out" && ok "a first push scans a lockfile under a non-ASCII path" || bad "first push hebrew lockfile: $(grep -E 'scanned|lodash' "$t/out")"
grep -qE 'scan=block$' "$t/home/.cache/nadavai/pre-push.log" && ok "the log records the trivy outcome (scan=block)" || bad "log: $(tail -1 "$t/home/.cache/nadavai/pre-push.log")"

# A push to a URL compares against the remote whose url that is: a key it already has does not block.
bare=$t/bare.git; git init -q --bare -b main "$bare"
u=$t/urlrepo; git init -q -b main "$u"; git -C "$u" config user.email t@t.invalid; git -C "$u" config user.name t; git -C "$u" config core.hooksPath /dev/null
key >"$u/fixture.env"; git -C "$u" add -A; git -C "$u" commit -qm fixture; git -C "$u" remote add origin "$bare"; git -C "$u" push -q origin main
uo=$(git -C "$u" rev-parse HEAD); echo x >"$u/x.txt"; git -C "$u" add x.txt; git -C "$u" commit -qm x; uh=$(git -C "$u" rev-parse HEAD)
(cd "$u" && printf 'refs/heads/f %s refs/heads/f %s\n' "$uh" "$z" | TRIVY_CACHE_DIR=$cache HOME=$t/home GIT_DIR=.git bash "$HOOK" "$bare" "$bare") >"$t/out" 2>&1; rc=$?
[ "$rc" = 0 ] && grep -q 'scanned 1 pushed' "$t/out" && ok "a push to a URL excludes what that remote already has" || bad "url push: rc=$rc $(grep scanned "$t/out")"
: "$uo"

[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
