-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — 🎓 Training   (patch TRAIN2)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run. Every line at the end says OK.
-- Run it AFTER docs/google-tokens.sql (it keeps every key class that file and the ones before it set). If you run
-- any of the earlier files again later, run THIS file again after them.
--
-- What it does:
--   1. gc_train_items (the list of training an admin adds: videos, documents, links, steps) — only an admin may
--      change it; every staff member still reads it. Each person's own ticks (gc_train_p_<e-mail>) stay "staff".
--   2. the company file store (bucket crm-files) takes files up to 50 MB (was 25 MB), so a downloaded IICRC / OSHA
--      training video fits. 50 MB is the largest single upload Supabase allows on the standard upload; a bigger file
--      has to be shortened or compressed first.
-- Nothing else changes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.gc_is_admin()') is null or to_regprocedure('public.gc_kv_can_write(text)') is null then
    raise exception 'Run docs/security-data.sql and the files after it (up to docs/google-tokens.sql) first, then this file.';
  end if;
end $$;

-- 1. The key classes (everything from docs/google-tokens.sql, plus gc_train_items = admin-write) ------------------
create or replace function public.gc_kv_class(k text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when k is null then 'staff'
    when k like 'users\_\_%' then 'admin'                         -- pieces of the people list
    when k like 'gc\_dailybackup\_%' then 'admin'                  -- in-cloud daily backups hold copies of everything
    when k like 'gcal\_token\_%' then 'server'                  -- patch GTOK: a person's Google sign-in — NO browser, not even an admin
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
      'gc_doc_defaults',                                           -- patch DOCLIB2: document defaults by job type (admins only)
      'gc_train_items'])                                           -- patch TRAIN2: the 🎓 Training list (admins add / edit / archive)
      then 'adminwrite'
    when k = 'users' then 'users'
    else 'staff'
  end
$$;
revoke all on function public.gc_kv_class(text) from public;
grant execute on function public.gc_kv_class(text) to anon, authenticated;

grant execute on function public.gc_kv_class(text) to service_role;

create or replace function public.gc_kv_can_read(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c = 'server' then return false; end if;                       -- patch GTOK: no browser
  if c = 'admin' then return public.gc_is_admin(); end if;
  if c = 'payroll' then return public.gc_can_payroll(); end if;
  return true;
end $$;
create or replace function public.gc_kv_can_write(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c = 'server' then return false; end if;                       -- patch GTOK: no browser
  if c in ('admin', 'adminwrite') then return public.gc_is_admin(); end if;
  if c = 'payroll' then return public.gc_can_payroll(); end if;
  return true;                                                    -- staff, and users (the trigger guards it)
end $$;
create or replace function public.gc_kv_can_delete(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c = 'server' then return false; end if;                       -- patch GTOK: no browser
  if c = 'staff' then return true; end if;
  return public.gc_is_admin();
end $$;
revoke all on function public.gc_kv_can_read(text), public.gc_kv_can_write(text), public.gc_kv_can_delete(text) from public;
grant execute on function public.gc_kv_can_read(text), public.gc_kv_can_write(text), public.gc_kv_can_delete(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 2. The file store: 50 MB per file ------------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute 'update storage.buckets set file_size_limit = 52428800 where id = ''crm-files'' and coalesce(file_size_limit, 0) < 52428800';
  end if;
end $$;

-- 3. VERIFY — every line must say OK ---------------------------------------------------------------------------
select 'the training list is admin-write' as check, case when public.gc_kv_class('gc_train_items') = 'adminwrite' then 'OK' else 'PROBLEM' end as result
union all
select 'each person''s ticks stay staff', case when public.gc_kv_class('gc_train_p_office@grayco_cs_com') = 'staff' then 'OK' else 'PROBLEM' end
union all
select 'Google sign-ins still server-only', case when public.gc_kv_class('gcal_token_Steven Biffle') = 'server' then 'OK' else 'PROBLEM' end
union all
select 'gc_automation_pause still admin-write', case when public.gc_kv_class('gc_automation_pause') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'pay stubs still payroll-only', case when public.gc_kv_class('payrollStubs_2026') = 'payroll' then 'OK' else 'PROBLEM' end
union all
select 'gc_mail_index__x still admin-only', case when public.gc_kv_class('gc_mail_index__office@grayco-cs.com') = 'admin' then 'OK' else 'PROBLEM' end
union all
select 'ordinary lists still staff', case when public.gc_kv_class('projects') = 'staff' then 'OK' else 'PROBLEM' end
union all
select 'the file store takes 50 MB', case when (select file_size_limit from storage.buckets where id = 'crm-files') >= 52428800 then 'OK' else 'PROBLEM: run docs/storage-setup.sql first' end;
