#!/bin/sh
# test_OFFICEFULL_sql.sh "<psql connection args>" — runs docs/office-full-access.sql on an EMPTY scratch Postgres (never
# Supabase, never production) after a minimal Supabase stand-in (roles anon / authenticated / service_role, auth.jwt())
# and the security files it builds on, then checks who reads / writes what as the office, a PM and an admin.
# Example (a throw-away local cluster): sh tools/tests/test_OFFICEFULL_sql.sh "-h /var/lib/postgresql/ofull -p 55432 -U postgres"
set -e
C="$1"; DB=gc_officefull_test_$$
H=$(cd "$(dirname "$0")/../.." && pwd)
psql $C -q -c "create database $DB"
P="psql $C -q -d $DB -v ON_ERROR_STOP=1"
$P -f "$H/tools/tests/officefull_sql/prelude.sql" >/dev/null 2>&1
for f in security-prepare security-data role-profiles google-tokens admin-data; do $P -f "$H/docs/$f.sql" >/dev/null 2>&1; done
psql $C -q -d $DB -f "$H/docs/training.sql" >/dev/null 2>&1 || true      # its last check needs Supabase storage; the rules are in
OUT=$($P -f "$H/docs/office-full-access.sql" 2>&1 | grep -v NOTICE)
echo "$OUT" | grep -q PROBLEM && { echo "$OUT"; echo "FAIL: the check list has a PROBLEM"; psql $C -q -c "drop database $DB"; exit 1; }
R=$($P -At -F'|' -f "$H/tools/tests/officefull_sql/sqlcheck.sql" 2>/dev/null | grep '@')
psql $C -q -c "drop database $DB"
fail=0
want(){ echo "$R" | grep -qF "$1|$2|$3" || { echo "FAIL: $1 $2 -> expected $3"; fail=1; }; }
want office@grayco-cs.com 'gc_my_access.office' true
want sbiffle@grayco-cs.com 'gc_my_access.office' false
want office@grayco-cs.com 'reads cash/commission/private (of 3)' 3
want sbiffle@grayco-cs.com 'reads cash/commission/private (of 3)' 0
want office@grayco-cs.com 'reads candidates' 0
want office@grayco-cs.com 'gc_admin_kv rows seen (of 2)' 1
want sbiffle@grayco-cs.com 'gc_admin_kv rows seen (of 2)' 0
want office@grayco-cs.com 'writes gc_admin_kv cash' ok
want sbiffle@grayco-cs.com 'writes gc_admin_kv cash' refused
want office@grayco-cs.com 'writes gc_admin_kv sam key' refused
want office@grayco-cs.com 'writes gc_overhead_manual' 'updated 1'
want sbiffle@grayco-cs.com 'writes gc_overhead_manual' 'updated 0'
want office@grayco-cs.com 'writes gc_team_settings' 'updated 0'
want office@grayco-cs.com 'writes users_private' 'updated 0'
want wjohnson@grayco-cs.com 'writes gc_team_settings' 'updated 1'
[ $fail = 0 ] && echo "OFFICEFULL sql: 15 checks passed" || exit 1
