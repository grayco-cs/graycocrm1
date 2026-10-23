-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — Google sign-ins are SERVER-ONLY   (patch GTOK)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run. Every line at the end says OK.
-- Run it AFTER docs/security-data.sql, docs/team-roles.sql, docs/marketing-role.sql, docs/automation-pause.sql,
-- docs/payroll-stubs.sql and docs/email-all.sql (it keeps everything those set). If you run any of those again later,
-- run THIS file again after them.
--
-- Why: each person's "Connect Google" (Calendar + Drive, read only) left a Google refresh token in gc_kv
-- ("gcal_token_<name>"), and every signed-in staff browser could read gc_kv. This file
--   1. makes sure the service-only table gc_lead_inbox_kv exists (the same one docs/lead-inbox.sql makes:
--      Row Level Security on, NO rules → only the server functions, with the service key, get in);
--   2. moves every gcal_token_* row there (the newer copy wins) and deletes it from gc_kv;
--   3. gives gcal_token_* in gc_kv a new class, "server": no browser may read, write or delete it — not even an admin.
--      (The server functions use the service key, which Row Level Security does not apply to.)
-- Nothing else changes: every other key keeps its class. Nobody has to reconnect Google.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.gc_is_admin()') is null or to_regprocedure('public.gc_json_of(jsonb)') is null then
    raise exception 'Run docs/security-data.sql first (and the files listed at the top), then this file.';
  end if;
end $$;

-- 1. The service-only table --------------------------------------------------------------------------------
create table if not exists public.gc_lead_inbox_kv (
  key         text primary key check (length(key) between 1 and 200),
  value       jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.gc_lead_inbox_kv enable row level security;
alter table public.gc_lead_inbox_kv force row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'gc_lead_inbox_kv' loop
    execute format('drop policy if exists %I on public.gc_lead_inbox_kv', r.policyname);
  end loop;
end $$;
revoke all on public.gc_lead_inbox_kv from public, anon, authenticated;
grant all on public.gc_lead_inbox_kv to service_role;

-- 2. Move the sign-ins out of gc_kv ---------------------------------------------------------------------------
insert into public.gc_lead_inbox_kv (key, value, updated_at)
select k.key, public.gc_json_of(to_jsonb(k.value)), coalesce(k.updated_at, now())
from public.gc_kv k
where k.key like 'gcal\_token\_%'
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
  where public.gc_lead_inbox_kv.updated_at < excluded.updated_at;
delete from public.gc_kv k
where k.key like 'gcal\_token\_%'
  and exists (select 1 from public.gc_lead_inbox_kv s where s.key = k.key);

-- 3. The key classes (everything from docs/email-all.sql, plus "server") ---------------------------------------
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
      'gc_doc_defaults'])                                          -- patch DOCLIB2: document defaults by job type (admins only)
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

-- 4. VERIFY — every line must say OK ---------------------------------------------------------------------------
select 'Google sign-ins are server-only' as check, case when public.gc_kv_class('gcal_token_Steven Biffle') = 'server' then 'OK' else 'PROBLEM' end as result
union all
select 'no Google sign-in left in gc_kv', case when not exists (select 1 from public.gc_kv where key like 'gcal\_token\_%') then 'OK' else 'PROBLEM: run again' end
union all
select 'a browser cannot read them', case when public.gc_kv_can_read('gcal_token_x') = false then 'OK' else 'PROBLEM' end
union all
select 'the service-only table has no rules', case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gc_lead_inbox_kv') then 'OK' else 'PROBLEM' end
union all
select 'gc_mail_index__x still admin-only', case when public.gc_kv_class('gc_mail_index__office@grayco-cs.com') = 'admin' then 'OK' else 'PROBLEM' end
union all
select 'gc_automation_pause still admin-write', case when public.gc_kv_class('gc_automation_pause') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'pay stubs still payroll-only', case when public.gc_kv_class('payrollStubs_2026') = 'payroll' then 'OK' else 'PROBLEM' end
union all
select 'ordinary lists still staff', case when public.gc_kv_class('projects') = 'staff' then 'OK' else 'PROBLEM' end;
