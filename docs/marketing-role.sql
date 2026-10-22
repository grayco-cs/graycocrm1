-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — THE MARKETING MANAGER PROFILE   (patch MM)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
-- Run it AFTER docs/security-lockdown.sql, docs/security-data.sql, docs/role-profiles.sql and docs/team-roles.sql.
-- If you run any of those again later, run THIS file again after them (security-lockdown.sql removes rules it
-- does not know; this file puts them back — until then the Marketing Manager simply cannot read anything).
--
-- Owner (10/22): "he needs strictly marketing stuff in his profile, doesn't need to see company data, but I want
-- him to see how his leads are playing out." Who has the profile is DATA (💎 → Team access → Profile "Marketing
-- Manager"), never a name in the code.
--
-- HOW IT IS LOCKED (default deny):
--   • A Marketing Manager is a gc_staff row with profile 'marketing', mkt_active = true, and ALWAYS active = false,
--     role 'staff', no payroll (the check below refuses anything else). Because he is not ACTIVE staff:
--       – public.gc_is_staff() is false for him → every table rule that lets staff in (gc_staff_all on gc_kv,
--         projects, estimates …, the storage bucket crm-files) keeps him OUT;
--       – every Netlify function's staff check refuses him (they all require an active gc_staff row).
--   • He gets exactly three small doors here:
--       – his OWN gc_staff row (so the CRM's sign-in can see his profile);
--       – READ of four harmless gc_kv keys the page needs to start: users (the people list's public part),
--         gc_company_address, gc_epoch, gc_mkt_admin (the admins' marketing settings). Nothing else, no writes;
--       – everything marketing goes through netlify/functions/soc.js, which redacts it (no customer name,
--         phone, e-mail or street address; no job costs, margins or profit).
--   • gc_mkt_admin (the admins' marketing settings: "Marketing Manager sees sold values", "… approves at stage 2")
--     is readable by staff and writable by admins only.
-- UNDO: drop the four policies and the function below, then: alter table public.gc_staff drop constraint if exists
--       gc_staff_marketing_shape; alter table public.gc_staff drop column if exists mkt_active;
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the profile and its switch ---------------------------------------------------------------
alter table public.gc_staff add column if not exists profile text;
alter table public.gc_staff add column if not exists mkt_active boolean not null default false;
do $$
begin
  alter table public.gc_staff drop constraint if exists gc_staff_profile_known;
  alter table public.gc_staff add constraint gc_staff_profile_known
    check (profile is null or profile in ('estimator', 'insurance', 'mitigation', 'super', 'pm', 'apm', 'office', 'field', 'marketing'));
  -- the Marketing Manager is never active staff, never an admin, never on payroll
  update public.gc_staff set active = false, role = 'staff' where profile = 'marketing' and (active or role <> 'staff');
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'payroll') then
    execute 'update public.gc_staff set payroll = false where profile = ''marketing'' and payroll';
    alter table public.gc_staff drop constraint if exists gc_staff_marketing_shape;
    execute 'alter table public.gc_staff add constraint gc_staff_marketing_shape check (coalesce(profile, '''') <> ''marketing'' or (not active and role = ''staff'' and not payroll))';
  else
    alter table public.gc_staff drop constraint if exists gc_staff_marketing_shape;
    alter table public.gc_staff add constraint gc_staff_marketing_shape check (coalesce(profile, '') <> 'marketing' or (not active and role = 'staff'));
  end if;
  -- mkt_active only means something with the marketing profile
  update public.gc_staff set mkt_active = false where mkt_active and coalesce(profile, '') <> 'marketing';
end $$;

create or replace function public.gc_is_marketing()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.gc_staff s
                 where s.profile = 'marketing' and s.mkt_active and not s.active and s.role = 'staff'
                   and s.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.gc_is_marketing() from public, anon;
grant execute on function public.gc_is_marketing() to authenticated;

-- 2. his own gc_staff row (the CRM's sign-in reads it to know the profile) ---------------------
drop policy if exists gc_mm_staff_self on public.gc_staff;
create policy gc_mm_staff_self on public.gc_staff for select to authenticated
  using (public.gc_is_marketing() and email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 3. the four keys he may read (nothing to write) ---------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['gc_kv', 'app_data'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists gc_mm_read on public.%I', t);
      execute format('create policy gc_mm_read on public.%I for select to authenticated '
                     'using (public.gc_is_marketing() and key in (''users'', ''gc_company_address'', ''gc_epoch'', ''gc_mkt_admin''))', t);
    end if;
  end loop;
end $$;

-- 4. gc_mkt_admin: staff read, admins write (the same classes as docs/team-roles.sql, plus this key) ----
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
      'gc_mkt_admin'])                                             -- patch MM: the admins' marketing settings
      then 'adminwrite'
    when k = 'users' then 'users'
    else 'staff'
  end
$$;
revoke all on function public.gc_kv_class(text) from public;
grant execute on function public.gc_kv_class(text) to anon, authenticated;

-- check list: every line should say OK
select 'mkt_active column' as check, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'mkt_active') then 'OK' else 'PROBLEM' end as result
union all
select 'no Marketing Manager is active staff / admin', (select case when count(*) = 0 then 'OK' else 'PROBLEM: ' || count(*) end from public.gc_staff where profile = 'marketing' and (active or role <> 'staff'))
union all
select 'Marketing Manager read rule on gc_kv', case when exists (select 1 from pg_policies where tablename = 'gc_kv' and policyname = 'gc_mm_read') then 'OK' else 'PROBLEM' end
union all
select 'gc_mkt_admin is admin-write', case when public.gc_kv_class('gc_mkt_admin') = 'adminwrite' then 'OK' else 'PROBLEM' end
union all
select 'Marketing Managers on the list', (select count(*)::text from public.gc_staff where profile = 'marketing' and mkt_active);
