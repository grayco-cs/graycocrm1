-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — EACH PERSON'S OWN TIME-CLOCK KEY   (patch FIELDFIX7, release r17)           safe to run any number of times
-- Supabase → SQL Editor → New query → paste ALL of this → Run. Every line of the check list at the end must say OK.
--
-- Why: since patch SEC2 the company "timesheets" list is payroll-only (admins and the office), so a crew member's
-- automatic clock-in was dropped. FIELDFIX7 (r17) keeps each person's own punches in their OWN small key
--   gc_timeclock_<their e-mail, every character that is not a-z or 0-9 written as _>
--   (carl.crew@grayco-cs.com → gc_timeclock_carl_crew_grayco_cs_com)
-- and an admin / office computer adds them to Timesheets.
--
-- Without this file the database lock (security-data.sql) already lets every active staff member write such a key —
-- but ANY such key, so one person could write (or read) another person's punches. This file narrows it:
--   • a staff member reads and writes ONLY their own gc_timeclock_ key;
--   • admins and the payroll people (gc_staff.payroll: the office) read and write every one (they merge them);
--   • every other key is untouched (the rule says "yes" for any key that does not start with gc_timeclock_).
-- It only ADDS a narrowing rule (RESTRICTIVE, like the SEC2 rules); it never opens anything.
--
-- Run it AFTER docs/security-data.sql (it uses gc_can_payroll()). Running security-data.sql again later does not undo it
-- (it has its own rule names, gc_tc_*). UNDO: drop policy gc_tc_read / gc_tc_insert / gc_tc_update on gc_kv and app_data.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.gc_can_payroll()') is null then
    raise exception 'Run docs/security-data.sql first (gc_can_payroll is missing), then this file again.';
  end if;
end $$;

-- 1. "Is this key someone else's time clock?" -------------------------------------------------------------------
create or replace function public.gc_tc_ok(k text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select k is null
      or left(k, 13) <> 'gc_timeclock_'
      or k = 'gc_timeclock_' || regexp_replace(lower(coalesce(auth.jwt() ->> 'email', '')), '[^a-z0-9]', '_', 'g')
      or public.gc_can_payroll()
$$;
revoke all on function public.gc_tc_ok(text) from public;
grant execute on function public.gc_tc_ok(text) to anon, authenticated;

-- 2. The rules (RESTRICTIVE: they narrow the staff rule, they never widen it) --------------------------------------
do $$
declare t text;
begin
  foreach t in array array['gc_kv', 'app_data'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists gc_tc_read on public.%I', t);
      execute format('drop policy if exists gc_tc_insert on public.%I', t);
      execute format('drop policy if exists gc_tc_update on public.%I', t);
      execute format('create policy gc_tc_read on public.%I as restrictive for select to public using (public.gc_tc_ok(key))', t);
      execute format('create policy gc_tc_insert on public.%I as restrictive for insert to public with check (public.gc_tc_ok(key))', t);
      execute format('create policy gc_tc_update on public.%I as restrictive for update to public '
                     'using (public.gc_tc_ok(key)) with check (public.gc_tc_ok(key))', t);
      raise notice 'own time-clock key rules on %', t;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 3. Check list — every line must say OK -------------------------------------------------------------------------
select 'gc_kv: own time-clock rules' as check,
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gc_kv' and policyname like 'gc\_tc\_%') = 3
            then 'OK' else 'PROBLEM: run this file again' end as result
union all
select 'gc_kv: the SEC2 rules are still on',
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gc_kv' and policyname like 'gc\_sec2\_%') >= 3
            then 'OK' else 'PROBLEM: run docs/security-data.sql, then this file again' end
union all
select 'other keys are untouched', case when public.gc_tc_ok('projects') and public.gc_tc_ok('timesheets') then 'OK' else 'PROBLEM' end;
