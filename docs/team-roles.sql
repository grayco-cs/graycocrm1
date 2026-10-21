-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — TEAM ROLES: the Senior PM, APMs, pay templates   (patch PMG)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
-- Run it AFTER docs/security-data.sql and docs/role-profiles.sql. If you run security-data.sql
-- again later, run this file again after it (it re-adds the four keys below).
--
-- Owner (10/21): "If I fire [a PM] I still need to be able to plug and play or add … then we hire PMs
-- and APMs and supers." No person is named in the CRM's code any more; who is who is data:
--
--   1. gc_staff.profile may now be 'apm' (Assistant PM), next to pm / super / estimator / …
--   2. Four gc_kv keys get their class (public.gc_kv_class, docs/security-data.sql):
--        gc_senior_pm      the Senior PM (Admin → Employees)        everyone reads, admins change it
--        gc_team_settings  "APMs may approve" and the like          everyone reads, admins change it
--        gc_reassign_log   who moved whose jobs to whom, and when   everyone reads, admins add to it
--        gc_pay_templates  saved pay structures (pay is private)    admins only
--      Until this file runs the four keys are ordinary staff keys (the CRM still lets only admins
--      change them from its screens).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the APM profile ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'profile') then
    alter table public.gc_staff drop constraint if exists gc_staff_profile_known;
    alter table public.gc_staff add constraint gc_staff_profile_known
      check (profile is null or profile in ('estimator', 'insurance', 'mitigation', 'super', 'pm', 'apm', 'office', 'field'));
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'payroll') then
    update public.gc_staff set payroll = false where payroll and role <> 'admin' and profile = 'apm';
  end if;
end $$;

-- 2. the four keys (the same lists as security-data.sql, plus these) ---------------------------
create or replace function public.gc_kv_class(k text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when k is null then 'staff'
    when k like 'users\_\_%' then 'admin'                         -- pieces of the people list
    when k like 'gc\_dailybackup\_%' then 'admin'                  -- in-cloud daily backups hold copies of everything
    when regexp_replace(k, '__(chunk[0-9]+|manifest)$', '') = any (array[
      'users_private', 'user', 'candidates', 'gc_commission_structures', 'gc_margin_goals',
      'gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger',
      'gc_tax_ids',                                                -- patch AUTAI: subs' full EIN / SSN (read from W-9s)
      'gc_pay_templates'])                                         -- patch PMG: saved pay structures
      then 'admin'
    when regexp_replace(k, '__(chunk[0-9]+|manifest)$', '') = any (array[
      'payrollRuns', 'payrollProfiles', 'payrollW4', 'payrollTaxPayments', 'payrollSettings', 'timesheets',
      'gc_payroll_approvals', 'gc_employee_payments', 'gc_commission_paid', 'commissionSchedules'])
      then 'payroll'
    when regexp_replace(k, '__(chunk[0-9]+|manifest)$', '') = any (array[
      'gc_ach_details', 'gc_overhead_manual', 'gc_checkrun_settings',
      'gc_senior_pm', 'gc_team_settings', 'gc_reassign_log'])        -- patch PMG
      then 'adminwrite'
    when k = 'users' then 'users'
    else 'staff'
  end
$$;
revoke all on function public.gc_kv_class(text) from public;
grant execute on function public.gc_kv_class(text) to anon, authenticated;

-- check list: every line should say OK
select 'apm profile allowed' as check,
       case when exists (select 1 from pg_constraint where conname = 'gc_staff_profile_known' and pg_get_constraintdef(oid) like '%apm%') then 'OK' else 'PROBLEM' end as result
union all
select 'Senior PM key is admin-written', case when public.gc_kv_class('gc_senior_pm') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'pay templates are admin-only', case when public.gc_kv_class('gc_pay_templates') = 'admin' then 'OK' else 'PROBLEM' end;
