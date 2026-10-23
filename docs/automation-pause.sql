-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — DATA-ENTRY MODE ("⏸ pause all automatic sending")   (patch PAUSE)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
-- Run it AFTER docs/security-data.sql, docs/team-roles.sql and docs/marketing-role.sql (if you use it). If you run any
-- of those again later, run THIS file again after them (docs/marketing-role.sql already carries these keys too).
--
-- What it does: the switch gc_kv "gc_automation_pause" (and its history "gc_automation_pause_log") can be READ by
-- every staff member (everyone sees the amber banner) but CHANGED only by an admin — the same "adminwrite" class as
-- gc_senior_pm / gc_mkt_admin. The Netlify function automation-pause.js (admins only) is the normal way to flip it;
-- this file closes the side door (a non-admin writing the key straight into gc_kv).
-- Until this file is run, the switch still works and every send is still guarded on the server; only the side door
-- (a staff member writing the key directly) stays open.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════

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
      'gc_senior_pm', 'gc_team_settings', 'gc_reassign_log',        -- patch PMG
      'gc_mkt_admin',                                              -- patch MM: the admins' marketing settings
      'gc_automation_pause', 'gc_automation_pause_log'])          -- patch PAUSE: data-entry mode (admins only)
      then 'adminwrite'
    when k = 'users' then 'users'
    else 'staff'
  end
$$;
revoke all on function public.gc_kv_class(text) from public;
grant execute on function public.gc_kv_class(text) to anon, authenticated;

-- the Marketing Manager (patch MM, when docs/marketing-role.sql was run) may read the switch too, for the banner
do $$
declare t text;
begin
  if to_regprocedure('public.gc_is_marketing()') is not null then
    foreach t in array array['gc_kv', 'app_data'] loop
      if to_regclass('public.' || t) is not null then
        execute format('drop policy if exists gc_mm_read on public.%I', t);
        execute format('create policy gc_mm_read on public.%I for select to authenticated '
                       'using (public.gc_is_marketing() and key in (''users'', ''gc_company_address'', ''gc_epoch'', ''gc_mkt_admin'', ''gc_automation_pause''))', t);
      end if;
    end loop;
  end if;
end $$;

-- checks (each line should say OK)
select 'gc_automation_pause is admin-write' as check, case when public.gc_kv_class('gc_automation_pause') = 'adminwrite' then 'OK' else 'PROBLEM' end as result
union all
select 'gc_automation_pause_log is admin-write', case when public.gc_kv_class('gc_automation_pause_log') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'gc_mkt_admin still admin-write', case when public.gc_kv_class('gc_mkt_admin') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'payroll keys still payroll-only', case when public.gc_kv_class('payrollRuns') = 'payroll' then 'OK' else 'PROBLEM' end;
