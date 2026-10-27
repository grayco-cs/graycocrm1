-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — WEEKLY PAY STUBS   (patch PAY)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
-- Run it AFTER docs/security-data.sql, docs/team-roles.sql, docs/marketing-role.sql and docs/automation-pause.sql.
-- It carries every key those files set, so it can be run last; if you run any of them again later, run THIS one after.
--
-- What it does: the saved pay stubs (gc_kv "payrollStubs_2026", "payrollStubs_2027", …) are payroll-only — admins and
-- the people with gc_staff.payroll = true. Employees never read that key: they see their OWN stubs through the Netlify
-- function paystubs.js, which matches the signed-in e-mail. Also: "gc_doc_defaults" (document defaults by job type)
-- becomes admin-write, like the other admin settings.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.gc_kv_class(k text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when k is null then 'staff'
    when k like 'users\_\_%' then 'admin'                         -- pieces of the people list
    when k like 'gc\_dailybackup\_%' then 'admin'                  -- in-cloud daily backups hold copies of everything
    when k like 'payrollStubs\_%' then 'payroll'                  -- patch PAY: saved weekly pay stubs (payrollStubs_<year>)
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
      'gc_automation_pause', 'gc_automation_pause_log',          -- patch PAUSE: data-entry mode (admins only)
      'gc_doc_defaults'])                                          -- patch DOCLIB2: document defaults by job type (admins only)
      then 'adminwrite'
    when k = 'users' then 'users'
    else 'staff'
  end
$$;
revoke all on function public.gc_kv_class(text) from public;
grant execute on function public.gc_kv_class(text) to anon, authenticated;

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

select 'payrollStubs_2026 is payroll-only' as check, case when public.gc_kv_class('payrollStubs_2026') = 'payroll' then 'OK' else 'PROBLEM' end as result
union all
select 'gc_doc_defaults is admin-write', case when public.gc_kv_class('gc_doc_defaults') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'gc_automation_pause still admin-write', case when public.gc_kv_class('gc_automation_pause') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'payroll keys still payroll-only', case when public.gc_kv_class('payrollRuns') = 'payroll' then 'OK' else 'PROBLEM' end
union all
select 'users private part still admin', case when public.gc_kv_class('users_private') = 'admin' then 'OK' else 'PROBLEM' end;
