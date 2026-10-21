-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — ROLE PROFILES (patch RP)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
-- Run it after docs/security-prepare.sql and docs/security-data.sql (it needs gc_staff and its payroll column).
--
-- Every person on the staff list gets a job PROFILE: what their CRM shows (left menu, home dashboard,
-- field view). It is set in the CRM by an admin: 💎 → Team access → Profile.
--     estimator   Glenn — Leads, 🧮 Estimate Builder, Estimates, Customers, plans, products …
--     insurance   insurance restoration (Bobby; program work) — 🛡️ Insurance claims home
--     mitigation  the mitigation manager — 💧 Mitigation drying home
--     super       the superintendent — 🏗️ My jobs today, 📒 Site Book (daily log, permits, subs, QC, safety, RFIs)
--     pm, office, field
--     (empty)     the role on Admin → Employees decides, as before
--
-- SECURITY (the same rules as docs/security-data.sql, SEC2):
--   • gc_staff is written only by the staff-admin function (service key), and only for an admin.
--     Nobody can change their own profile from the CRM or the database API.
--   • A profile never gives access to data. Admin = gc_staff.role 'admin'; payroll = admins and
--     gc_staff.payroll (the office). An estimator / insurance / mitigation / PM / field profile can never
--     hold the payroll flag (estimator, insurance, mitigation, super, pm, field): the check below refuses it.
-- UNDO: alter table public.gc_staff drop constraint if exists gc_staff_payroll_office_only;
--       alter table public.gc_staff drop column if exists profile;
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.gc_staff add column if not exists profile text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gc_staff_profile_known') then
    alter table public.gc_staff add constraint gc_staff_profile_known
      check (profile is null or profile in ('estimator', 'insurance', 'mitigation', 'super', 'pm', 'apm', 'office', 'field'));   -- apm: patch PMG (docs/team-roles.sql updates an existing table)
  end if;
end $$;

-- Glenn is the estimator (owner, 10/21) — only when nobody has set his profile yet
update public.gc_staff set profile = 'estimator' where email = 'gmiller@grayco-cs.com' and profile is null;

-- payroll stays admin / office only
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'payroll') then
    update public.gc_staff set payroll = false
      where payroll and role <> 'admin' and profile in ('estimator', 'insurance', 'mitigation', 'super', 'pm', 'field');
    if not exists (select 1 from pg_constraint where conname = 'gc_staff_payroll_office_only') then
      alter table public.gc_staff add constraint gc_staff_payroll_office_only
        check (not payroll or role = 'admin' or profile is null or profile = 'office');
    end if;
  end if;
end $$;

-- nobody writes gc_staff through the web API (unchanged; repeated here so this file is safe on its own)
revoke insert, update, delete on public.gc_staff from anon, authenticated;

-- check list: every line should say OK
select 'profile column' as check, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'profile') then 'OK' else 'PROBLEM' end as result
union all
select 'Glenn = estimator', coalesce((select case when profile = 'estimator' then 'OK' else 'set to ' || coalesce(profile, '(role)') end from public.gc_staff where email = 'gmiller@grayco-cs.com'), 'not on the staff list yet')
union all
select 'no estimator / insurance / mitigation / super / pm / field on payroll',
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'payroll')
       then (select case when count(*) = 0 then 'OK' else 'PROBLEM: ' || count(*) end from public.gc_staff where payroll and role <> 'admin' and profile in ('estimator', 'insurance', 'mitigation', 'super', 'pm', 'field'))
       else 'OK (no payroll column yet — run docs/security-data.sql)' end
union all
select 'staff cannot write gc_staff', case when has_table_privilege('authenticated', 'public.gc_staff', 'UPDATE') then 'PROBLEM' else 'OK' end;
