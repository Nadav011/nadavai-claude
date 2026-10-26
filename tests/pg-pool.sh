#!/usr/bin/env bash
# Tests for bin/pg-pool against a container of its own (nadavai-pg-pool-test-<pid>), removed at
# the end, and a temp state dir: the machine's pg-pool servers and TherapyFlow's
# supabase_db_tf-test-db-pool are never touched. Needs docker. Not under bin/, which setup links
# into ~/.local/bin file by file.
#   tests/pg-pool.sh [path to pg-pool]      PG_POOL_TEST_IMAGE picks the image (default postgres:17-alpine)
set -u
pp=$(realpath "${1:-$(dirname "$0")/../bin/pg-pool}")
docker ps >/dev/null 2>&1 || { echo "SKIP: docker is not available"; exit 0; }
t=$(mktemp -d) || exit 1
export PG_POOL_HOME=$t/home PG_POOL_CONTAINER=nadavai-pg-pool-test-$$ XDG_CONFIG_HOME=$t/config
img=${PG_POOL_TEST_IMAGE:-postgres:17-alpine}
kids=()
cleanup() { for k in "${kids[@]}"; do kill "$k" 2>/dev/null; done; docker rm -fv "$PG_POOL_CONTAINER" >/dev/null 2>&1; rm -rf -- "$t"; }
trap cleanup EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
q() { docker exec -i "$PG_POOL_CONTAINER" psql -X -At -U postgres -d "$1" -c "$2" 2>&1; }
su_q() { docker exec -i "$PG_POOL_CONTAINER" sh -c 'psql -X -At -U "${POSTGRES_USER:-postgres}" -d postgres -c "$1"' _ "$1" 2>&1; }
has_db() { [ "$(q postgres "select count(*) from pg_database where datname = '$1'")" = 1 ]; }
repo=$t/repo
pdrop() { (cd "$repo" && "$pp" drop "$@"); }   # a drop from the repo that leased the clone

mkdir -p "$repo/supabase/migrations"
printf 'create table a (id int);\ninsert into a values (1);\n' >"$repo/supabase/migrations/001_a.sql"
printf "select 'see https://example.invalid/hook';\n" >"$repo/supabase/migrations/002_note.sql"

dsn=$("$pp" --image "$img" get "$repo" 2>"$t/err") || { bad "first get: $(tail -3 "$t/err")"; exit 1; }
[[ $dsn =~ ^postgresql://postgres:[0-9a-f]+@127\.0\.0\.1:[0-9]+/run_run_[0-9]{10}_[0-9a-f]{6}$ ]] && ok "get prints a DSN" || bad "DSN: $dsn"
db=${dsn##*/}
[ "$(q "$db" 'select count(*) from a')" = 1 ] && ok "the clone carries the migrations" || bad "clone: $(q "$db" 'select count(*) from a')"
q "$db" 'insert into a values (2)' >/dev/null
[ "$(docker exec "$PG_POOL_CONTAINER" getent hosts example.invalid | awk '{print $1}')" = 127.0.0.1 ] &&
  ok "a host named in the chain resolves to 127.0.0.1" || bad "example.invalid is not pinned"
[ "$(docker exec "$PG_POOL_CONTAINER" psql -At -U postgres -c 'show fsync')" = off ] && ok "fsync is off" || bad "fsync is on"
docker port "$PG_POOL_CONTAINER" 5432/tcp | grep -qv '^127\.0\.0\.1:' && bad "published beyond 127.0.0.1" || ok "published on 127.0.0.1 only"
# L10: only the leasing repo drops a clone, unless --force.
if (cd "$t" && "$pp" drop "$db" 2>"$t/err"); then bad "L10 a drop from another dir was accepted"
else grep -q 'is leased by' "$t/err" && ok "L10 a drop from another repo is refused" || bad "L10: $(cat "$t/err")"; fi
pdrop "$db" && ! has_db "$db" && ok "drop removes the clone" || bad "drop"
d=$("$pp" --image "$img" get "$repo" 2>/dev/null)
(cd "$t" && "$pp" drop "${d##*/}" --force) && ! has_db "${d##*/}" && ok "L10 drop --force from anywhere" || bad "L10 --force"
# L9: names that are not plain identifiers never reach SQL.
"$pp" drop 'run_x"; select 1; --' 2>/dev/null && bad "L9 a quoted name was accepted" || ok "L9 a malformed clone name is refused"
"$pp" --image "$img" --extensions 'pgcrypto";select 1;--' get "$repo" >/dev/null 2>&1 && bad "L9 a malformed extension was accepted" ||
  ok "L9 a malformed extension name is refused"

# Five parallel get + drop: every clone fresh (one row), every one dropped, one template.
for i in 1 2 3 4 5; do
  ( d=$("$pp" --image "$img" --label "p$i" get "$repo" 2>/dev/null) || exit 1
    n=$(q "${d##*/}" 'select count(*) from a'); q "${d##*/}" 'insert into a values (9)' >/dev/null
    pdrop "${d##*/}" || exit 1
    [ "$n" = 1 ] ) &
done
pf=0; for j in $(jobs -p); do wait "$j" || pf=1; done
left=$(q postgres "select count(*) from pg_database where datname ~ '^run_'")
tpls=$(q postgres "select count(*) from pg_database where datname ~ '^tpl_'")
[ "$pf" = 0 ] && [ "$left" = 0 ] && [ "$tpls" = 1 ] && ok "5 parallel get+drop: fresh clones, none left, one template" ||
  bad "parallel: failed=$pf left=$left templates=$tpls"

# The lease cap: with pg_pool_leases=1 a second get waits until the first lease expires.
mkdir -p "$t/config/nadavai"; echo 'pg_pool_leases=1' >"$t/config/nadavai/capacity"
d1=$("$pp" --image "$img" --lease 15s get "$repo" 2>/dev/null)
exp1=$(sed -n 's/^expires=//p' "$PG_POOL_HOME/$PG_POOL_CONTAINER/leases/${d1##*/}")
d2=$("$pp" --image "$img" get "$repo" 2>/dev/null); got=$(date +%s)
[ -n "$d2" ] && [ -n "$exp1" ] && [ "$got" -ge "$exp1" ] && ok "#9 the lease cap holds a get until the first lease expires" ||
  bad "#9 cap: second get at $got, first lease expires at ${exp1:-?}, got '$d2'"
has_db "${d1##*/}" && bad "expired clone still there" || ok "the expired clone was dropped to make room"
pdrop "${d2##*/}"
rm -f "$t/config/nadavai/capacity"

# Lease expiry, then gc.
# (8 s: a get on a supabase image takes a few seconds after its lease is written.)
d=$("$pp" --image "$img" --lease 8s get "$repo" 2>/dev/null)
"$pp" gc >/dev/null
has_db "${d##*/}" && ok "gc keeps a live lease" || bad "gc dropped a live lease"
sleep 9
"$pp" gc >/dev/null
has_db "${d##*/}" && bad "gc kept an expired lease" || ok "gc drops an expired lease"

# H9: an expired clone someone is connected to is kept and its lease extended, up to 4 lengths.
d=$("$pp" --image "$img" --lease 3s get "$repo" 2>/dev/null); db=${d##*/}
q "$db" 'select pg_sleep(30)' >/dev/null 2>&1 & kids+=($!)
sleep 4
"$pp" gc >"$t/gc"
has_db "$db" && grep -q "kept $db" "$t/gc" && ok "H9 gc keeps an expired clone that has a session" || bad "H9 dropped a connected clone"
sleep 9
"$pp" gc >/dev/null
has_db "$db" && bad "H9 a connected clone outlived 4 lease lengths" || ok "H9 past 4 lease lengths it is dropped anyway"

# run: the clone lives while its process does; SIGKILL leaves it, gc reclaims it.
out=$("$pp" --image "$img" run "$repo" -- sh -c 'psql "$DATABASE_URL" -At -c "select 1" 2>/dev/null || echo "$PGDATABASE"')
[ -n "$out" ] && [ "$(q postgres "select count(*) from pg_database where datname ~ '^run_'")" = 0 ] && ok "run exports the database and drops it on exit" || bad "run: '$out'"
"$pp" --image "$img" --lease 1s run "$repo" -- sh -c "echo \$PGDATABASE >'$t/rundb'; echo \$\$ >'$t/runchild'; exec sleep 60" & rp=$!; kids+=("$rp")
for _ in $(seq 1 60); do [ -s "$t/rundb" ] && break; sleep 0.5; done
rdb=$(cat "$t/rundb")
sleep 2
"$pp" gc >/dev/null
has_db "$rdb" && ok "gc keeps a clone whose run process lives, past its lease" || bad "gc dropped a live run"
pdrop "$rdb" 2>"$t/err" && bad "L10 dropped a live run's clone" || { grep -q 'live run' "$t/err" && ok "L10 a live run's clone is not dropped" || bad "L10 run: $(cat "$t/err")"; }
kill -9 "$rp"; wait "$rp" 2>/dev/null; kill "$(cat "$t/runchild")" 2>/dev/null
"$pp" gc >/dev/null
has_db "$rdb" && bad "SIGKILL: clone left" || ok "after SIGKILL of run, gc drops its clone"

# A new migration: a new template, and the clone has it.
printf 'create table b (id int);\n' >"$repo/supabase/migrations/003_b.sql"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err")
tpls=$(q postgres "select count(*) from pg_database where datname ~ '^tpl_'")
[ "$tpls" = 2 ] && [ "$(q "${d##*/}" 'select count(*) from b')" = 0 ] && grep -q 'building tpl_' "$t/err" &&
  ok "a changed migration chain builds a new template" || bad "rebuild: templates=$tpls"
pdrop "${d##*/}"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err"); pdrop "${d##*/}"
grep -q building "$t/err" && bad "an unchanged chain was built again" || ok "an unchanged chain reuses its template"

# pg_cron (supabase images): a chain's job lands switched off, in a database the launcher never reads.
if [ "$(q postgres "select count(*) from pg_extension where extname = 'pg_cron'")" = 1 ]; then
  mkdir -p "$t/repo3/migrations"
  printf "create extension if not exists pg_cron;\nselect cron.schedule('j', '* * * * *', 'select 1');\n" >"$t/repo3/migrations/001.sql"
  d=$("$pp" --image "$img" get "$t/repo3" 2>"$t/err")
  [ "$(q "${d##*/}" 'select count(*) from cron.job where active')" = 0 ] && [ "$(q "${d##*/}" 'select count(*) from cron.job')" = 1 ] &&
    ok "a chain's cron job is switched off in the clone" || bad "cron: $(tail -2 "$t/err")"
  [ "$(q postgres 'select count(*) from cron.job')" = 0 ] && ok "no job reached the postgres database" || bad "a job reached postgres"
  (cd "$t/repo3" && "$pp" drop "${d##*/}")
fi

# H8: a chain that names a role or server statement is refused before anything runs.
mkdir -p "$t/repo2/migrations"
printf 'create table r (id int);\n-- create role in a comment is fine\ncreate role pool_test_role;\n' >"$t/repo2/migrations/001.sql"
if "$pp" --image "$img" get "$t/repo2" >/dev/null 2>"$t/err"; then bad "H8 a role-creating chain was accepted"
else grep -q 'does not run here' "$t/err" && ok "H8 a role-creating chain is refused by the scan" || bad "H8 refusal: $(tail -2 "$t/err")"; fi
[ "$(su_q "select count(*) from pg_roles where rolname = 'pool_test_role'")" = 0 ] && ok "H8 ...and nothing of it ran" || bad "H8 the role was created"
printf 'alter system set work_mem = 1234;\n' >"$t/repo2/migrations/001.sql"
"$pp" --image "$img" get "$t/repo2" >/dev/null 2>"$t/err" && bad "H8 ALTER SYSTEM accepted" || { grep -q 'does not run here' "$t/err" && ok "H8 ALTER SYSTEM is refused" || bad "H8 system: $(tail -1 "$t/err")"; }
# H8: what gets past the scan (a role GRANT) is reverted, and the server stays usable.
printf 'grant pg_read_all_data to postgres;\n' >"$t/repo2/migrations/001.sql"
grants() { su_q "select count(*) from pg_auth_members where roleid = 'pg_read_all_data'::regrole and member = 'postgres'::regrole"; }
g0=$(grants)   # 0 on plain postgres; a supabase image may grant it already
"$pp" --image "$img" get "$t/repo2" >/dev/null 2>"$t/err" && bad "H8 a membership-changing chain was accepted"
[ "$(grants)" = "$g0" ] && ok "H8 the membership grants are back to the baseline ($g0) after the chain" || bad "H8 membership: $(grants) grants, want $g0: $(tail -2 "$t/err")"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") && ok "H8 the server stays usable after a bad chain" || bad "H8 server unusable: $(tail -2 "$t/err")"
pdrop "${d##*/}" 2>/dev/null
# H8: a role that slips past the scan and that the template depends on: no template; the role
# stays (only reset removes roles made after the baseline) and status lists it.
printf "do \$\$ begin execute 'CREATE ' || 'ROLE chain_role'; end \$\$;\ncreate table c (id int);\ngrant select on c to chain_role;\n" >"$t/repo2/migrations/001.sql"
"$pp" --image "$img" get "$t/repo2" >/dev/null 2>"$t/err" && bad "H8 a chain-made role was accepted" ||
  { grep -q 'made roles its template depends on' "$t/err" && ok "H8 a chain-made role the template depends on fails the build" || bad "H8 chain role: $(tail -2 "$t/err")"; }
"$pp" gc >/dev/null
[ "$(su_q "select count(*) from pg_roles where rolname = 'chain_role'")" = 1 ] && "$pp" status | grep -q 'after the baseline.*chain_role' &&
  ok "#1 gc leaves the chain's role and status lists it" || bad "#1 chain_role: $("$pp" status | tail -2)"

# (4)/#1 Agent X makes a role and a grant inside its clone; agent W's get still succeeds; gc
# never drops X's role (X may SET ROLE to it where no catalog shows it), even after X's clone is gone.
dx=$("$pp" --image "$img" get "$repo" 2>/dev/null); xdb=${dx##*/}
q "$xdb" 'create role x_role; grant select on a to x_role;' >/dev/null
dw=$("$pp" --image "$img" get "$repo" 2>"$t/err") && ok "(4) W's get succeeds while X's role exists" || bad "(4) W's get failed: $(tail -2 "$t/err")"
xroles() { su_q "select count(*) from pg_roles where rolname = 'x_role'"; }
[ "$(xroles)" = 1 ] && ok "(4) get leaves X's role alone" || bad "(4) get dropped X's role"
"$pp" gc >/dev/null
[ "$(xroles)" = 1 ] && ok "#1 gc leaves X's role while X's clone exists" || bad "#1 gc dropped x_role"
pdrop "$xdb"; pdrop "${dw##*/}"
"$pp" gc >/dev/null
[ "$(xroles)" = 1 ] && ok "#1 gc leaves X's role after X's clone is gone" || bad "#1 gc dropped x_role after the clone"
su_q 'create role stray_role' >/dev/null
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") && [ "$(su_q "select count(*) from pg_roles where rolname = 'stray_role'")" = 1 ] &&
  ok "(4) a role made by hand does not fail a get, and stays" || bad "(4) stray role: $(tail -2 "$t/err")"
pdrop "${d##*/}" 2>/dev/null
"$pp" status | grep -q 'after the baseline.*stray_role.*x_role' && ok "#1 status lists the roles made after the baseline" || bad "#1 status: $("$pp" status | tail -2)"

# (5) A second grant of a baseline membership (another grantor) is revoked without losing the
# baseline grant itself.
pair=$(su_q "select r.rolname || ' ' || m.rolname from pg_auth_members a join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member
  where r.rolname like 'pg\_%' and m.rolname like 'pg\_%' order by 1 limit 1")
role=${pair% *}; member=${pair#* }
su_q "create role grantor_x; grant $role to grantor_x with admin option; set role grantor_x; grant $role to $member" >/dev/null
[ "$(su_q "select count(*) from pg_auth_members where roleid = '$role'::regrole and member = '$member'::regrole")" = 2 ] || bad "(5) setup: no second grant of $role to $member"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") || bad "(5) get failed: $(tail -2 "$t/err")"
n=$(su_q "select count(*) from pg_auth_members where roleid = '$role'::regrole and member = '$member'::regrole")
[ "$n" = 1 ] && ok "(5) the extra grant of $role to $member is gone and the baseline grant stays" || bad "(5) $role to $member: $n grants"
pdrop "${d##*/}" 2>/dev/null

# #6 A baseline membership whose INHERIT option was changed gets its options back.
p6=$(su_q "select r.rolname || ' ' || m.rolname from pg_auth_members a join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member
  where r.rolname like 'pg\_%' and m.rolname like 'pg\_%' and a.inherit_option order by 1 limit 1")
r6=${p6% *}; m6=${p6#* }
opts() { su_q "select string_agg(admin_option || ' ' || inherit_option || ' ' || set_option, ',') from pg_auth_members where roleid = '$r6'::regrole and member = '$m6'::regrole"; }
o0=$(opts)
su_q "grant $r6 to $m6 with inherit false" >/dev/null
[ "$(opts)" != "$o0" ] || bad "#6 setup: the INHERIT option of $r6 to $m6 did not change"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") || bad "#6 get failed: $(tail -2 "$t/err")"
[ "$(opts)" = "$o0" ] && ok "#6 $r6 to $m6 has its baseline ADMIN/INHERIT/SET options again ($o0)" || bad "#6 options: $(opts), want $o0"
pdrop "${d##*/}" 2>/dev/null

# #3 A changed ACL of template1 is put back.
acl() { su_q "select coalesce(datacl::text, '-') from pg_database where datname = 'template1'"; }
a0=$(acl)
su_q "grant create on database template1 to pg_monitor; revoke connect on database template1 from public" >/dev/null
[ "$(acl)" != "$a0" ] || bad "#3 setup: the ACL of template1 did not change"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") || bad "#3 get failed: $(tail -2 "$t/err")"
[ "$(acl)" = "$a0" ] && ok "#3 the ACL of template1 is back to the baseline ($a0)" || bad "#3 acl: $(acl), want $a0"
pdrop "${d##*/}" 2>/dev/null

# A changed attribute of a baseline role with no expiry (NULL, not 'infinity') is put back.
rattr() { su_q "select rolconnlimit || ' ' || coalesce(rolvaliduntil::text, '-') from pg_roles where rolname = 'postgres'"; }
r0=$(rattr)
su_q "alter role postgres connection limit 7 valid until '2100-01-01'" >/dev/null
[ "$(rattr)" != "$r0" ] || bad "role attrs setup: postgres did not change"
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") || bad "role attrs: get failed: $(tail -2 "$t/err")"
[ "$(rattr)" = "$r0" ] && ok "a baseline role's changed attributes and NULL expiry are put back ($r0)" || bad "role attrs: $(rattr), want $r0"
pdrop "${d##*/}" 2>/dev/null
d=$("$pp" --image "$img" get "$repo" 2>"$t/err") && ok "the next get works after a role revert" || bad "get after role revert: $(tail -2 "$t/err")"
pdrop "${d##*/}" 2>/dev/null

# Extensions that make roles (pgsodium, pg_tle on supabase images) do not fail a template build.
for e in pg_tle pgsodium; do
  [ "$(su_q "select count(*) from pg_available_extensions where name = '$e'")" = 1 ] || continue
  mkdir -p "$t/ext-$e/migrations"; printf 'create extension if not exists %s;\n' "$e" >"$t/ext-$e/migrations/001.sql"
  d=$("$pp" --image "$img" get "$t/ext-$e" 2>"$t/err") && ok "a chain that creates $e builds" || bad "$e: $(tail -2 "$t/err")"
  (cd "$t/ext-$e" && "$pp" drop "${d##*/}") 2>/dev/null
done

"$pp" status >"$t/status" && grep -q "$PG_POOL_CONTAINER" "$t/status" && ok "status lists the server" || bad "status"

# L8: reset waits for builds and clones (the lifecycle lock, held shared here) and gives up.
flock -s "$PG_POOL_HOME/$PG_POOL_CONTAINER/locks/lifecycle.lock" sleep 6 & kids+=($!)
sleep 0.5
PG_POOL_LOCK_WAIT=1 "$pp" --image "$img" reset --yes >/dev/null 2>&1 && bad "L8 reset ran under a clone" ||
  { docker inspect "$PG_POOL_CONTAINER" >/dev/null 2>&1 && ok "L8 reset refuses while the lifecycle lock is held" || bad "L8 the server was removed"; }
wait "${kids[-1]}" 2>/dev/null
"$pp" --image "$img" reset --yes >/dev/null && ! docker inspect "$PG_POOL_CONTAINER" >/dev/null 2>&1 &&
  ok "#1 reset removes the server, and the roles made after the baseline with it" || bad "#1 reset"
[ "$fail" = 0 ] && echo "all passed"
exit "$fail"
