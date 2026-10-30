-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — THE OFFICE SEES AND WORKS EVERYTHING, MONEY TOO   (patch OFFICEFULL)      safe to run any number of times
-- Supabase → SQL Editor → New query → paste ALL of this → Run. Every line of the check list at the end must say OK.
--
-- Owner (Wesley, 10/30): "need her to be able to have full reign of crm she can see projects everything for everything"
-- — asked about the owner money screens (bank accounts, cash flow, P&L / owner profit, owner draws, commissions):
-- "Everything, money too".
--
-- Run it AFTER docs/security-data.sql, docs/admin-data.sql and docs/training.sql (the newest key rules). If you run
-- security-data.sql, google-tokens.sql or training.sql again later, run THIS file again after them (they write the
-- same two functions without the office).
--
-- Who is "the office" (data, never a name): an active gc_staff row that is not an admin and not the Marketing Manager,
-- with profile 'office' (💎 → Team access → Profile) or role 'office' — or, when no profile is set, whose role on the
-- people list (Admin → Employees) is Office / Office Admin / Office Manager. Admins set both; nobody can change their own.
--
-- What it does — it takes NOTHING away, and gives nothing to the public (anon) key:
--   1. public.gc_is_office_full() — "is the signed-in person the office?"
--   2. public.gc_office_can_read(key) / gc_office_can_write(key) — the owners-only keys the office may now read / change:
--        read + change: gc_cash_anchor, gc_accounts_cfg, gc_accounts_ledger (cash on hand, bank accounts, their
--                       movements = owner draws), gc_margin_goals, gc_ach_details (bank details on invoices),
--                       gc_overhead_manual (P&L overhead), gc_checkrun_settings, gc_mkt_admin (marketing settings),
--                       gc_doc_defaults, gc_train_items
--        read only:     users_private (pay set-up → commission figures; HR fields included — the database guard still
--                       keeps her from changing anyone's record), gc_commission_structures, gc_tax_ids (subs' EIN for
--                       1099s), gc_pay_templates
--      STAY ADMINS ONLY: candidates (hiring), the people-list pieces, the in-cloud daily backups, all-company e-mail
--      (gc_mail_*), team roles (gc_senior_pm, gc_team_settings, gc_reassign_log), data-entry mode
--      (gc_automation_pause*), Google sign-ins (server only), gc_staff itself (Team access).
--   3. gc_kv / app_data: the read and write rules (gc_kv_can_read / gc_kv_can_write) let the office in for those keys.
--   4. gc_admin_kv (docs/admin-data.sql): the office reads / adds / changes the three cash rows only (the SAM key and
--      anything else kept there stay admins-only). Still nobody deletes through the web.
--   5. public.gc_my_access() also answers "office": true / false — the CRM opens the money records for her on that.
-- UNDO: run docs/training.sql again (the gc_kv rules without the office) and docs/admin-data.sql again (gc_admin_kv
--       admins only). The extra "office" answer of gc_my_access() then only opens screens, not data.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.gc_is_admin()') is null or to_regprocedure('public.gc_can_payroll()') is null
     or to_regprocedure('public.gc_kv_class(text)') is null or to_regprocedure('public.gc_json_of(jsonb)') is null then
    raise exception 'Run docs/security-data.sql (and the files after it, up to docs/training.sql) first, then this file.';
  end if;
end $$;

-- 1. Who is the office ---------------------------------------------------------------------------------------
create or replace function public.gc_is_office_full()
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  r    jsonb;
  ppl  jsonb;
  pf   text;
begin
  if me = '' then return false; end if;
  select to_jsonb(s) into r from public.gc_staff s where s.email = me limit 1;
  if r is null or coalesce((r ->> 'active')::boolean, false) is not true then return false; end if;
  if lower(coalesce(r ->> 'role', '')) = 'admin' then return false; end if;                 -- admins have everything already
  pf := lower(coalesce(r ->> 'profile', ''));
  if pf = 'marketing' or coalesce((r ->> 'mkt_active')::boolean, false) then return false; end if;
  if lower(coalesce(r ->> 'role', '')) = 'office' or pf = 'office' then return true; end if;
  if pf <> '' then return false; end if;                                                    -- another profile an admin set
  -- no profile: the person's role on the company's people list
  select public.gc_json_of(to_jsonb(k.value)) into ppl from public.gc_kv k where k.key = 'users';
  if ppl is null or jsonb_typeof(ppl) <> 'array' then return false; end if;
  return exists (
    select 1 from jsonb_array_elements(ppl) as x(e)
    where jsonb_typeof(e) = 'object'
      and lower(coalesce(e ->> 'email', '')) = me
      and coalesce(e ->> 'active', 'true') <> 'false'
      and coalesce(e ->> 'role', '') ~* '^office');
end $$;
revoke all on function public.gc_is_office_full() from public, anon;
grant execute on function public.gc_is_office_full() to authenticated;

-- 2. What the office may read / change besides the staff keys (index.html __GC_SEC2.OFFICE_READ / OFFICE_WRITE) ---
create or replace function public.gc_office_can_write(k text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(coalesce(k, ''), '__(chunk[0-9]+|manifest)$', '') = any (array[
    'gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger', 'gc_margin_goals',
    'gc_ach_details', 'gc_overhead_manual', 'gc_checkrun_settings',
    'gc_mkt_admin', 'gc_doc_defaults', 'gc_train_items'])
$$;
create or replace function public.gc_office_can_read(k text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select public.gc_office_can_write(k)
      or regexp_replace(coalesce(k, ''), '__(chunk[0-9]+|manifest)$', '') = any (array[
           'users_private', 'gc_commission_structures', 'gc_tax_ids', 'gc_pay_templates'])
$$;
revoke all on function public.gc_office_can_read(text), public.gc_office_can_write(text) from public;
grant execute on function public.gc_office_can_read(text), public.gc_office_can_write(text) to anon, authenticated, service_role;

-- 3. The gc_kv / app_data rules (docs/training.sql's, plus the office) ------------------------------------------
create or replace function public.gc_kv_can_read(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c = 'server' then return false; end if;                       -- patch GTOK: no browser
  if c = 'admin' then return public.gc_is_admin() or (public.gc_office_can_read(k) and public.gc_is_office_full()); end if;   -- patch OFFICEFULL
  if c = 'payroll' then return public.gc_can_payroll(); end if;
  return true;
end $$;
create or replace function public.gc_kv_can_write(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c = 'server' then return false; end if;                       -- patch GTOK: no browser
  if c in ('admin', 'adminwrite') then return public.gc_is_admin() or (public.gc_office_can_write(k) and public.gc_is_office_full()); end if;   -- patch OFFICEFULL
  if c = 'payroll' then return public.gc_can_payroll(); end if;
  return true;                                                    -- staff, and users (the trigger guards it)
end $$;
-- gc_kv_can_delete is not changed: only admins delete owners-only rows.
revoke all on function public.gc_kv_can_read(text), public.gc_kv_can_write(text) from public;
grant execute on function public.gc_kv_can_read(text), public.gc_kv_can_write(text) to anon, authenticated;

-- 4. gc_admin_kv: the three cash rows for the office too ---------------------------------------------------------
do $$
begin
  if to_regclass('public.gc_admin_kv') is not null then
    execute 'drop policy if exists gc_admin_read   on public.gc_admin_kv';
    execute 'drop policy if exists gc_admin_insert on public.gc_admin_kv';
    execute 'drop policy if exists gc_admin_update on public.gc_admin_kv';
    execute $p$create policy gc_admin_read on public.gc_admin_kv for select to authenticated
      using (public.gc_is_admin() or (key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger') and public.gc_is_office_full()))$p$;
    execute $p$create policy gc_admin_insert on public.gc_admin_kv for insert to authenticated
      with check (public.gc_is_admin() or (key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger') and public.gc_is_office_full()))$p$;
    execute $p$create policy gc_admin_update on public.gc_admin_kv for update to authenticated
      using (public.gc_is_admin() or (key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger') and public.gc_is_office_full()))
      with check (public.gc_is_admin() or (key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger') and public.gc_is_office_full()))$p$;
    -- the grants stay as docs/admin-data.sql set them: select / insert / update for authenticated, nothing for anon, no delete
    raise notice 'gc_admin_kv: the office may read and change the three cash rows';
  else
    raise notice 'gc_admin_kv is missing — run docs/admin-data.sql first (then this file again)';
  end if;
end $$;

-- 5. "Am I an admin / may I prepare payroll / am I the office?" --------------------------------------------------
create or replace function public.gc_my_access()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'email',   lower(coalesce(auth.jwt() ->> 'email', '')),
    'staff',   public.gc_is_staff(),
    'admin',   public.gc_is_admin(),
    'payroll', public.gc_can_payroll(),
    'office',  public.gc_is_office_full(),                                     -- patch OFFICEFULL
    'sec2',    case when exists (select 1 from pg_trigger where tgname = 'gc_kv_users_guard' and not tgisinternal) then 1 else 0 end)
$$;
revoke all on function public.gc_my_access() from public, anon;
grant execute on function public.gc_my_access() to authenticated;

notify pgrst, 'reload schema';

-- 6. Check list — every line must say OK ------------------------------------------------------------------------
drop table if exists pg_temp.gc_office_verify;
create temp table gc_office_verify (check_name text, result text);

insert into gc_office_verify
select 'the office (who the database counts)',
       'OK (' || coalesce(string_agg(email, ', ' order by email), 'nobody yet — set 💎 → Team access → Profile "office"') || ')'
from (
  select s.email from public.gc_staff s
  where s.active and s.role <> 'admin'
    and (lower(coalesce(to_jsonb(s) ->> 'profile', '')) = 'office' or lower(s.role) = 'office'
         or (coalesce(to_jsonb(s) ->> 'profile', '') = '' and exists (
               select 1 from public.gc_kv k, jsonb_array_elements(case when jsonb_typeof(public.gc_json_of(to_jsonb(k.value))) = 'array' then public.gc_json_of(to_jsonb(k.value)) else '[]'::jsonb end) as x(e)
               where k.key = 'users' and jsonb_typeof(e) = 'object' and lower(coalesce(e ->> 'email', '')) = s.email and coalesce(e ->> 'role', '') ~* '^office')))
    and lower(coalesce(to_jsonb(s) ->> 'profile', '')) <> 'marketing'
) o;

insert into gc_office_verify values
  ('office reads the cash / bank / commission keys', case when public.gc_office_can_read('gc_cash_anchor') and public.gc_office_can_read('gc_accounts_ledger__chunk3') and public.gc_office_can_read('users_private') and public.gc_office_can_read('gc_commission_structures') then 'OK' else 'PROBLEM' end),
  ('office changes the bank / cash / overhead keys', case when public.gc_office_can_write('gc_accounts_ledger') and public.gc_office_can_write('gc_overhead_manual') and public.gc_office_can_write('gc_ach_details') then 'OK' else 'PROBLEM' end),
  ('office does NOT change people''s private records', case when not public.gc_office_can_write('users_private') then 'OK' else 'PROBLEM' end),
  ('candidates / backups / all e-mail / team roles stay admin', case when not public.gc_office_can_read('candidates') and not public.gc_office_can_read('gc_dailybackup_2026-10-30') and not public.gc_office_can_read('gc_mail_index__x') and not public.gc_office_can_write('gc_team_settings') and not public.gc_office_can_write('gc_senior_pm') then 'OK' else 'PROBLEM' end),
  ('data-entry mode stays admin', case when not public.gc_office_can_write('gc_automation_pause') and not public.gc_office_can_write('gc_automation_pause_log') then 'OK' else 'PROBLEM' end),
  ('ordinary lists still staff', case when public.gc_kv_class('projects') = 'staff' then 'OK' else 'PROBLEM' end),
  ('gc_my_access answers office', case when (select prosrc from pg_proc where oid = 'public.gc_my_access()'::regprocedure) like '%gc_is_office_full%' then 'OK' else 'PROBLEM' end),
  ('the public key cannot ask who is the office', case when has_function_privilege('anon', 'public.gc_is_office_full()', 'EXECUTE') then 'PROBLEM' else 'OK' end);

do $$
declare n bigint;
begin
  if to_regclass('public.gc_admin_kv') is not null then
    begin
      set local role anon;
      execute 'select count(*) from public.gc_admin_kv' into n;
      reset role;
      insert into gc_office_verify values ('anon reading gc_admin_kv', 'PROBLEM: anon read ' || n || ' rows');
    exception when insufficient_privilege then
      reset role;
      insert into gc_office_verify values ('anon reading gc_admin_kv', 'OK (permission denied)');
    end;
    -- a signed-in person who is not on the staff list: nothing
    begin
      perform set_config('request.jwt.claims', '{"role":"authenticated","email":"nobody-officefull-probe@example.invalid"}', true);
      set local role authenticated;
      execute 'select count(*) from public.gc_admin_kv' into n;
      reset role;
      insert into gc_office_verify values ('a stranger reading gc_admin_kv', case when n = 0 then 'OK (0 rows)' else 'PROBLEM: ' || n || ' rows' end);
    exception when insufficient_privilege then
      reset role;
      insert into gc_office_verify values ('a stranger reading gc_admin_kv', 'OK (permission denied)');
    end;
  end if;
end $$;

select * from gc_office_verify;
