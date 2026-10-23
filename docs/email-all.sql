-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — "🌐 ALL GRAYCO E-MAIL" keys are ADMIN-ONLY   (patch MAILALL, docs/EMAIL-ALL.md)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
-- Run it AFTER docs/security-data.sql, docs/team-roles.sql, docs/marketing-role.sql, docs/automation-pause.sql and
-- docs/payroll-stubs.sql (it keeps everything those set).
-- If you run any of those again later, run THIS file again after them.
--
-- The e-mail index normally lives in the service-only table gc_lead_inbox_kv (docs/lead-inbox.sql), which no browser can
-- read. Until that SQL has been run it falls back to gc_kv — this file makes every gc_mail_* key there admin-only
-- (gc_mail_index__<mailbox>, gc_mail_index__crm__<month>, gc_mail_sync_state, gc_mail_access_log, gc_mail_all_settings,
-- gc_mail_links, gc_mail_log). Nothing else changes: every other key keeps its class.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.gc_kv_class(k text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when k is null then 'staff'
    when k like 'users\_\_%' then 'admin'                         -- pieces of the people list
    when k like 'gc\_dailybackup\_%' then 'admin'                  -- in-cloud daily backups hold copies of everything
    when k like 'gc\_mail\_%' then 'admin'                       -- patch MAILALL: the e-mail index, sync state, access log, links (admins only)
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

select 'gc_mail_index__x is admin-only' as check, case when public.gc_kv_class('gc_mail_index__office@grayco-cs.com') = 'admin' then 'OK' else 'PROBLEM' end as result
union all
select 'gc_mail_access_log is admin-only', case when public.gc_kv_class('gc_mail_access_log') = 'admin' then 'OK' else 'PROBLEM' end
union all
select 'gc_automation_pause still admin-write', case when public.gc_kv_class('gc_automation_pause') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'payroll keys still payroll-only', case when public.gc_kv_class('payrollRuns') = 'payroll' then 'OK' else 'PROBLEM' end
union all
select 'pay stubs still payroll-only', case when public.gc_kv_class('payrollStubs_2026') = 'payroll' then 'OK' else 'PROBLEM' end;
