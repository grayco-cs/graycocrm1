#!/bin/sh
# test_TIMECLOCK_sql.sh "<psql connection args>" — runs docs/timeclock-access.sql on an EMPTY scratch Postgres (never Supabase,
# never production) after the Supabase stand-in and the security files (as test_OFFICEFULL_sql.sh), then checks that a
# crew member reads / writes only their own gc_timeclock_ key, the office and admins every one, other keys unchanged.
set -e
C="$1"; DB=gc_timeclock_test_$$
H=$(cd "$(dirname "$0")/../.." && pwd)
psql $C -q -c "create database $DB"
P="psql $C -q -d $DB -v ON_ERROR_STOP=1"
$P -f "$H/tools/tests/officefull_sql/prelude.sql" >/dev/null 2>&1
for f in security-prepare security-data role-profiles google-tokens admin-data; do $P -f "$H/docs/$f.sql" >/dev/null 2>&1; done
psql $C -q -d $DB -f "$H/docs/training.sql" >/dev/null 2>&1 || true
$P -f "$H/docs/office-full-access.sql" >/dev/null 2>&1
OUT=$($P -f "$H/docs/timeclock-access.sql" 2>&1 | grep -v NOTICE)
echo "$OUT" | grep -q PROBLEM && { echo "$OUT"; echo "FAIL: the check list has a PROBLEM"; psql $C -q -c "drop database $DB"; exit 1; }
$P -f "$H/docs/timeclock-access.sql" >/dev/null 2>&1   # a second run is fine
R=$($P -At -F'|' -f "$H/tools/tests/timeclock_sql/check.sql" 2>/dev/null | grep '@')
psql $C -q -c "drop database $DB"
fail=0; n=0
want(){ n=$((n+1)); echo "$R" | grep -qF "$1|$2|$3" || { echo "FAIL: $1 $2 -> expected $3 (got: $(echo "$R" | grep -F "$1|$2|" | cut -d'|' -f3))"; fail=1; }; }
want carl.crew@grayco-cs.com 'reads timeclock keys (of 2)' 1
want carl.crew@grayco-cs.com 'writes carl'"'"'s key' 'updated 1'
want carl.crew@grayco-cs.com 'upserts own key' ok
want carl.crew@grayco-cs.com 'adds someone else'"'"'s key' refused
want carl.crew@grayco-cs.com 'reads projects' 1
want carl.crew@grayco-cs.com 'writes projects' 'updated 1'
want sbiffle@grayco-cs.com 'reads timeclock keys (of 2)' 1
want sbiffle@grayco-cs.com 'writes carl'"'"'s key' 'updated 0'
want sbiffle@grayco-cs.com 'adds someone else'"'"'s key' refused
want office@grayco-cs.com 'reads timeclock keys (of 2)' 2
want office@grayco-cs.com 'writes carl'"'"'s key' 'updated 1'
want wjohnson@grayco-cs.com 'reads timeclock keys (of 2)' 3   # + the office's own key, added just before
want wjohnson@grayco-cs.com 'adds someone else'"'"'s key' ok
[ $fail = 0 ] && echo "TIMECLOCK sql: $n checks passed" || { echo "$R"; exit 1; }
