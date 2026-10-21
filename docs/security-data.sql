-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — SECURITY, PART 3: OWNER-ONLY DATA INSIDE gc_kv   (patch SEC2)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
--
-- Run it AFTER docs/security-prepare.sql (it needs gc_staff). It works before or after
-- docs/security-lockdown.sql, but its rules are only ENFORCED once row level security is
-- on for gc_kv (the lockdown turns it on). Run it AGAIN after every run of the lockdown,
-- and read the check list at the bottom: every line should say OK.
--
-- Until now any signed-in staff member could read and write EVERY gc_kv row. This adds:
--
--   1. gc_staff.payroll — people who may prepare payroll without being an owner.
--      Set for office@grayco-cs.com the first time this file runs (decision: the office
--      prepares the payroll runs that Wesley or Nick approve). To take it away:
--          update public.gc_staff set payroll = false where email = 'office@grayco-cs.com';
--
--   2. Every gc_kv key gets a class (public.gc_kv_class):
--        admin       only Wesley and Nick (gc_staff role 'admin') read or write it:
--                    users_private (pay, bank, ID, insurance, home address of every
--                    employee), commission structures, margin goals, hiring candidates,
--                    the cash keys, every in-cloud daily backup (it holds copies of all of it)
--                    and gc_tax_ids (subs' full EIN / SSN from their W-9s, patch AUTAI; the sub
--                    record keeps only the masked number)
--        payroll     admins + gc_staff.payroll people read and write it:
--                    payrollRuns, payrollProfiles, payrollW4, payrollTaxPayments,
--                    payrollSettings, timesheets, gc_payroll_approvals,
--                    gc_employee_payments, gc_commission_paid, commissionSchedules
--        adminwrite  every staff member reads it, only admins change it:
--                    gc_ach_details (the bank details printed on invoices),
--                    gc_overhead_manual, gc_checkrun_settings
--        users       the people list: every staff member reads it; a non-admin may only
--                    change their OWN phone / vehicle / shirt size / photo and their own
--                    home address and emergency contact (which go to users_private).
--                    Role, name, email, pay type, active and every other field are
--                    put back the way they were (trigger gc_kv_users_guard).
--        staff       everything else: as before (any signed-in staff member).
--      A split-up list ("<key>__chunkN", "<key>__manifest") has its list's class.
--
--   3. The people list is split. Pay, bank, ID, insurance and home-address fields never
--      stay in "users": whoever writes "users" (an admin from Admin → Employees, the
--      backup import, an old build), the database moves those fields into the
--      admin-only row "users_private" ({ "<user id>": { field: value } }) and keeps
--      only the public profile in "users". Old password hashes (pwHash) are dropped. A field an
--      admin cleared arrives listed in "_sec2Cleared" and is stored as null.
--      This file moves the fields that are in "users" today, once.
--
--   4. public.gc_my_access() — the CRM asks it "am I an admin / may I prepare payroll".
--
-- Nothing is deleted. The UNDO block at the bottom takes the rules away again.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. What this needs (the same as security-prepare.sql / admin-data.sql; idempotent) ----------
create table if not exists public.gc_staff (
  email     text primary key check (email = lower(btrim(email))),
  name      text not null default '',
  role      text not null default 'staff' check (role in ('admin', 'staff')),
  active    boolean not null default true,
  added_by  text not null default '',
  added_at  timestamptz not null default now()
);
-- Supabase (from 2026-10-30): new tables need explicit grants for the API roles.
grant select on public.gc_staff to authenticated;
grant all on public.gc_staff to service_role;

create or replace function public.gc_is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.gc_staff s
                 where s.active and s.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.gc_is_staff() from public, anon;
grant execute on function public.gc_is_staff() to authenticated;

create or replace function public.gc_is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.gc_staff s
                 where s.active and s.role = 'admin'
                   and s.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.gc_is_admin() from public, anon;
grant execute on function public.gc_is_admin() to authenticated;

-- 1. Who may prepare payroll ----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gc_staff' and column_name = 'payroll') then
    alter table public.gc_staff add column payroll boolean not null default false;
    -- first run only (a later "payroll = false" is never undone by running this file again)
    update public.gc_staff set payroll = true where email = 'office@grayco-cs.com';
    raise notice 'gc_staff.payroll added; office@grayco-cs.com may prepare payroll';
  end if;
end $$;

create or replace function public.gc_can_payroll()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.gc_staff s
                 where s.active and (s.role = 'admin' or s.payroll)
                   and s.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.gc_can_payroll() from public, anon;
grant execute on function public.gc_can_payroll() to authenticated;

-- 2. Which key is what (the CRM has the same lists: index.html, __GC_SEC2__) -----------------
create or replace function public.gc_kv_class(k text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when k is null then 'staff'
    when k like 'users\_\_%' then 'admin'                         -- pieces of the people list
    when k like 'gc\_dailybackup\_%' then 'admin'                  -- in-cloud daily backups hold copies of everything
    when regexp_replace(k, '__(chunk[0-9]+|manifest)$', '') = any (array[
      'users_private', 'user', 'candidates', 'gc_commission_structures', 'gc_margin_goals',
      'gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger',
      'gc_tax_ids'])                                               -- patch AUTAI: subs' full EIN / SSN (read from W-9s)
      then 'admin'
    when regexp_replace(k, '__(chunk[0-9]+|manifest)$', '') = any (array[
      'payrollRuns', 'payrollProfiles', 'payrollW4', 'payrollTaxPayments', 'payrollSettings', 'timesheets',
      'gc_payroll_approvals', 'gc_employee_payments', 'gc_commission_paid', 'commissionSchedules'])
      then 'payroll'
    when regexp_replace(k, '__(chunk[0-9]+|manifest)$', '') = any (array[
      'gc_ach_details', 'gc_overhead_manual', 'gc_checkrun_settings'])
      then 'adminwrite'
    when k = 'users' then 'users'
    else 'staff'
  end
$$;
revoke all on function public.gc_kv_class(text) from public;
grant execute on function public.gc_kv_class(text) to anon, authenticated;

-- "staff" here means: the ordinary gc_staff_all rule (security-prepare / lockdown) already let
-- the person in. These rules only ever take something AWAY from that.
create or replace function public.gc_kv_can_read(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c = 'admin' then return public.gc_is_admin(); end if;
  if c = 'payroll' then return public.gc_can_payroll(); end if;
  return true;
end $$;
create or replace function public.gc_kv_can_write(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c text := public.gc_kv_class(k);
begin
  if c in ('admin', 'adminwrite') then return public.gc_is_admin(); end if;
  if c = 'payroll' then return public.gc_can_payroll(); end if;
  return true;                                                    -- staff, and users (the trigger guards it)
end $$;
create or replace function public.gc_kv_can_delete(k text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.gc_kv_class(k) = 'staff' then return true; end if;
  return public.gc_is_admin();
end $$;
revoke all on function public.gc_kv_can_read(text), public.gc_kv_can_write(text), public.gc_kv_can_delete(text) from public;
grant execute on function public.gc_kv_can_read(text), public.gc_kv_can_write(text), public.gc_kv_can_delete(text) to anon, authenticated;

-- 3. The rules. RESTRICTIVE: they narrow the staff rule (gc_staff_all), they never widen it.
--    Names start with gc_sec2_ (security-lockdown.sql leaves them in place).
do $$
declare t text;
begin
  foreach t in array array['gc_kv', 'app_data'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists gc_sec2_read on public.%I', t);
      execute format('drop policy if exists gc_sec2_insert on public.%I', t);
      execute format('drop policy if exists gc_sec2_update on public.%I', t);
      execute format('drop policy if exists gc_sec2_delete on public.%I', t);
      execute format('create policy gc_sec2_read on public.%I as restrictive for select to public '
                     'using (public.gc_kv_can_read(key))', t);
      execute format('create policy gc_sec2_insert on public.%I as restrictive for insert to public '
                     'with check (public.gc_kv_can_write(key))', t);
      execute format('create policy gc_sec2_update on public.%I as restrictive for update to public '
                     'using (public.gc_kv_can_write(key)) with check (public.gc_kv_can_write(key))', t);
      execute format('create policy gc_sec2_delete on public.%I as restrictive for delete to public '
                     'using (public.gc_kv_can_delete(key))', t);
      raise notice 'owner-only rules on %', t;
    end if;
  end loop;
end $$;

-- 4. The people list: public profile in "users", the rest in "users_private" ---------------------
create or replace function public.gc_json_of(v jsonb)
returns jsonb language plpgsql immutable as $$
begin
  if v is not null and jsonb_typeof(v) = 'string' then
    begin return (v #>> '{}')::jsonb; exception when others then return v; end;
  end if;
  return v;
end $$;

-- the fields that leave "users" (an unknown field stays public: keep this list up to date)
create or replace function public.gc_users_private_fields()
returns text[] language sql immutable as $$
  select array[
    -- identity / HR
    'ssn4', 'dob', 'driversLic', 'licState', 'licExp', 'address', 'city', 'state', 'zip',
    'emergName', 'emergPhone', 'emergRelation', 'notes',
    -- bank
    'directDeposit', 'bankName', 'routingLast4', 'acctLast4',
    -- pay
    'salary', 'baseSalary', 'hourlyRate', 'payFreq', 'commPct', 'payMatrix', 'payRules', 'paySourceRules',
    'multiPay', 'split', 'overhead', 'ownSplit', 'ownOverhead', 'threshold', 'ownThreshold', 'graycoThreshold',
    'resPay', 'insPay', 'insPaySameAsRes', 'perEstimatePay', 'perEstimateTypes', 'bidBoardPay', 'bringsJobPay',
    'handoffPct', 'estimateCommPct', 'estimateAfterThreshold', 'customBasis', 'customSelfPct', 'customCompanyPct',
    'customFlat', 'customFlatPct', 'commSchedule', 'commPayDay', 'payStructureNote', 'revenuePct', 'ftHours', 'benefits',
    -- insurance
    'healthIns', 'healthCarrier', 'healthPlan', 'healthPremium', 'healthExp',
    'dentalIns', 'dentalCarrier', 'dentalPremium', 'dentalExp',
    'visionIns', 'visionCarrier', 'visionPremium', 'visionExp',
    'lifeIns', 'lifeCarrier', 'lifeCoverage', 'lifeExp', 'wcCovered']
$$;
-- what a non-admin may change on their OWN record (My Profile → Edit My Info)
create or replace function public.gc_users_self_fields()
returns text[] language sql immutable as $$
  select array['phone', 'vehicle', 'vehiclePlate', 'shirtSize', 'photo', 'updatedAt', 'savedAt',
               'address', 'city', 'state', 'zip', 'emergName', 'emergPhone', 'emergRelation']
$$;

-- "users" without the private fields and without password hashes
create or replace function public.gc_users_public(v jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(v) = 'array' then
    coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object'
                                    then e - public.gc_users_private_fields() - array['pwHash', 'password', '_sec2Cleared']
                                    else e end order by o)
              from jsonb_array_elements(v) with ordinality as x(e, o)), '[]'::jsonb)
  else v end
$$;

create or replace function public.gc_kv_users_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c        jsonb;
  actor    text;                        -- server | admin | staff
  me       text;
  is_text  boolean := pg_typeof(new.value) = 'text'::regtype;
  raw_new  jsonb := to_jsonb(new.value);
  was_str  boolean;
  v_new    jsonb;
  v_old    jsonb := '[]'::jsonb;
  v_priv   jsonb := '{}'::jsonb;
  priv0    jsonb;
  out_arr  jsonb := '[]'::jsonb;
  seen     text[] := array[]::text[];
  privf    text[] := public.gc_users_private_fields();
  selff    text[] := public.gc_users_self_fields();
  rec      jsonb;
  old_rec  jsonb;
  id       text;
  p        jsonb;
  has_epoch boolean;
begin
  begin c := nullif(current_setting('request.jwt.claims', true), '')::jsonb; exception when others then c := null; end;
  if c is null or coalesce(c ->> 'role', '') not in ('anon', 'authenticated') then actor := 'server';
  elsif public.gc_is_admin() then actor := 'admin';
  else actor := 'staff'; end if;
  me := lower(coalesce(c ->> 'email', ''));

  was_str := (not is_text) and raw_new is not null and jsonb_typeof(raw_new) = 'string';
  v_new := public.gc_json_of(raw_new);
  select public.gc_json_of(to_jsonb(k.value)) into v_old from public.gc_kv k where k.key = 'users';
  if v_old is null or jsonb_typeof(v_old) <> 'array' then v_old := '[]'::jsonb; end if;
  select public.gc_json_of(to_jsonb(k.value)) into v_priv from public.gc_kv k where k.key = 'users_private';
  if v_priv is null or jsonb_typeof(v_priv) <> 'object' then v_priv := '{}'::jsonb; end if;
  priv0 := v_priv;

  if v_new is null or jsonb_typeof(v_new) <> 'array' then
    if actor = 'staff' then v_new := public.gc_users_public(v_old); else return new; end if;
    out_arr := v_new;
  else
    for rec in select e from jsonb_array_elements(v_new) as x(e) loop
      if jsonb_typeof(rec) <> 'object' then
        if actor <> 'staff' then out_arr := out_arr || jsonb_build_array(rec); end if;
        continue;
      end if;
      id := rec ->> 'id';
      if actor <> 'staff' then
        if id is not null and id <> '' then
          p := (select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) from jsonb_each(rec) f where f.key = any (privf));
          -- fields an admin cleared (the CRM lists them, a missing field alone means "not sent")
          if jsonb_typeof(rec -> '_sec2Cleared') = 'array' then
            p := p || (select coalesce(jsonb_object_agg(x.f, 'null'::jsonb), '{}'::jsonb)
                       from jsonb_array_elements_text(rec -> '_sec2Cleared') as x(f) where x.f = any (privf) and not (p ? x.f));
          end if;
          if p <> '{}'::jsonb then
            v_priv := jsonb_set(v_priv, array[id], coalesce(v_priv -> id, '{}'::jsonb) || p, true);
          end if;
        end if;
        out_arr := out_arr || jsonb_build_array(rec - privf - array['pwHash', 'password', '_sec2Cleared']);
      else
        -- a non-admin: only their own record, only the self fields; nobody added or removed
        if id is null or id = '' or id = any (seen) then continue; end if;
        select e into old_rec from jsonb_array_elements(v_old) as y(e)
         where jsonb_typeof(e) = 'object' and e ->> 'id' = id limit 1;
        if old_rec is null then continue; end if;                     -- a new person: admins only
        seen := seen || id;
        old_rec := old_rec - privf - array['pwHash', 'password', '_sec2Cleared'];
        if me <> '' and lower(coalesce(old_rec ->> 'email', '')) = me then
          p := (select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) from jsonb_each(rec) f
                 where f.key = any (selff) and f.key = any (privf));
          if p <> '{}'::jsonb then
            v_priv := jsonb_set(v_priv, array[id], coalesce(v_priv -> id, '{}'::jsonb) || p, true);
          end if;
          old_rec := old_rec || (select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) from jsonb_each(rec) f
                                  where f.key = any (selff) and not (f.key = any (privf)));
        end if;
        out_arr := out_arr || jsonb_build_array(old_rec);
      end if;
    end loop;
    if actor = 'staff' then                                           -- nobody removed by a non-admin
      for old_rec in select e from jsonb_array_elements(v_old) as y(e) loop
        if jsonb_typeof(old_rec) = 'object' and coalesce(old_rec ->> 'id', '') <> '' and not ((old_rec ->> 'id') = any (seen)) then
          out_arr := out_arr || jsonb_build_array(old_rec - privf - array['pwHash', 'password', '_sec2Cleared']);
          seen := seen || (old_rec ->> 'id');
        end if;
      end loop;
    end if;
  end if;

  if is_text then new.value := out_arr::text;
  elsif was_str then new.value := to_jsonb(out_arr::text);
  else new.value := out_arr; end if;

  if v_priv is distinct from priv0 then
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'gc_kv' and column_name = 'epoch') into has_epoch;
    if has_epoch then
      execute 'insert into public.gc_kv (key, value, updated_at, epoch) values ($1, $2, now(), $3)
               on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, epoch = excluded.epoch'
        using 'users_private', v_priv, to_jsonb(new) ->> 'epoch';
    else
      execute 'insert into public.gc_kv (key, value, updated_at) values ($1, $2, now())
               on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at'
        using 'users_private', v_priv;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.gc_kv_users_guard() from public, anon, authenticated;
drop trigger if exists gc_kv_users_guard on public.gc_kv;
create trigger gc_kv_users_guard before insert or update on public.gc_kv
  for each row when (new.key = 'users') execute function public.gc_kv_users_guard();

-- 5. "Am I an admin / may I prepare payroll?" (the CRM asks once per sign-in) ------------------
create or replace function public.gc_my_access()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'email',   lower(coalesce(auth.jwt() ->> 'email', '')),
    'staff',   public.gc_is_staff(),
    'admin',   public.gc_is_admin(),
    'payroll', public.gc_can_payroll(),
    'sec2',    case when exists (select 1 from pg_trigger where tgname = 'gc_kv_users_guard' and not tgisinternal) then 1 else 0 end)
$$;
revoke all on function public.gc_my_access() from public, anon;
grant execute on function public.gc_my_access() to authenticated;

-- 6. Move today's private fields out of "users" (once; running it again changes nothing) --------
--    Touching the row runs the guard above as the server: the fields go to users_private.
update public.gc_kv set value = value where key = 'users';
-- the old app_data table (no longer used by the CRM; its copy is weeks old): strip it, do not move it
do $$
begin
  if to_regclass('public.app_data') is not null then
    execute $q$update public.app_data
       set value = public.gc_users_public(public.gc_json_of(to_jsonb(value)))
     where key = 'users' and jsonb_typeof(public.gc_json_of(to_jsonb(value))) = 'array'$q$;
  end if;
exception when others then raise notice 'app_data users not stripped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';   -- the web API learns gc_my_access() and the new column at once

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK LIST — the last results grid. Every line should say OK.
-- The test people below are made inside a step that is undone at its end: nothing is kept.
-- ═══════════════════════════════════════════════════════════════════════════
drop table if exists pg_temp.gc_sec2_verify;
create temp table gc_sec2_verify (n serial, check_name text, result text);

insert into gc_sec2_verify (check_name, result)
select 'payroll people (gc_staff.payroll)',
       'OK (' || coalesce(string_agg(email, ', ' order by email), 'nobody — payroll is owners-only') || ')'
from public.gc_staff where active and payroll and role <> 'admin';

insert into gc_sec2_verify (check_name, result)
select 'owner-only rules on gc_kv',
       case when count(*) = 4 then 'OK' else 'PROBLEM: ' || count(*) || ' of 4 (run this file again)' end
from pg_policies where schemaname = 'public' and tablename = 'gc_kv' and policyname like 'gc\_sec2\_%' and permissive = 'RESTRICTIVE';

insert into gc_sec2_verify (check_name, result)
select 'row level security on gc_kv',
       case when c.relrowsecurity then 'OK' else 'PROBLEM: off — run docs/security-lockdown.sql, then this file again' end
from pg_class c where c.oid = 'public.gc_kv'::regclass;

insert into gc_sec2_verify (check_name, result)
select 'people-list guard (trigger)',
       case when exists (select 1 from pg_trigger where tgname = 'gc_kv_users_guard' and tgrelid = 'public.gc_kv'::regclass and not tgisinternal)
            then 'OK' else 'PROBLEM: missing' end;

insert into gc_sec2_verify (check_name, result)
select '"users" holds no pay / bank / ID / password fields',
       coalesce((select case when n = 0 then 'OK (' || total || ' people)' else 'PROBLEM: ' || n || ' record(s) still carry them' end
                 from (select count(*) filter (where e ?| (public.gc_users_private_fields() || array['pwHash', 'password', '_sec2Cleared'])) as n,
                              count(*) as total
                       from public.gc_kv k, jsonb_array_elements(case when jsonb_typeof(public.gc_json_of(to_jsonb(k.value))) = 'array'
                                                                     then public.gc_json_of(to_jsonb(k.value)) else '[]'::jsonb end) e
                       where k.key = 'users' and jsonb_typeof(e) = 'object') s),
                'OK (no "users" row yet)');

insert into gc_sec2_verify (check_name, result)
select 'users_private (admins only)',
       coalesce((select 'OK (' || count(*) || ' people)' from public.gc_kv k, jsonb_object_keys(
                  case when jsonb_typeof(public.gc_json_of(to_jsonb(k.value))) = 'object' then public.gc_json_of(to_jsonb(k.value)) else '{}'::jsonb end) x
                 where k.key = 'users_private' having count(*) > 0), 'OK (empty — nothing private stored yet)');

do $$
declare
  rls      boolean;
  has_ep   boolean;
  ep       text;
  r_pm_admin bigint; r_pm_pay bigint; r_pm_priv bigint; r_pm_ach bigint;
  r_off_pay bigint; r_off_admin bigint; r_adm_admin bigint; r_adm_pay bigint;
  w_pm_pay text; w_pm_ach text; w_pm_priv text; w_pm_staff text; w_off_pay text; w_off_ach text; w_adm_ach text;
  d_pm_users text;
  t_role text; t_name text; t_salary text; t_phone text; t_addr text; t_new text; t_gone text; t_adm_role text; t_adm_priv text;
  u0 jsonb;
  msg text;
  t_addr_pub text;
begin
  select c.relrowsecurity into rls from pg_class c where c.oid = 'public.gc_kv'::regclass;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gc_kv' and column_name = 'epoch') into has_ep;
  if has_ep then
    select (case when jsonb_typeof(to_jsonb(k.value)) = 'string' then (to_jsonb(k.value) #>> '{}')::jsonb else to_jsonb(k.value) end) ->> 'epoch'
      into ep from public.gc_kv k where k.key = 'gc_epoch';
  end if;

  begin
    -- test people (undone below) and test rows of every class
    insert into public.gc_staff (email, name, role, active, payroll) values
      ('sec2-probe-admin@grayco-cs.com', 'probe', 'admin', true, false),
      ('sec2-probe-office@grayco-cs.com', 'probe', 'staff', true, true),
      ('sec2-probe-pm@grayco-cs.com', 'probe', 'staff', true, false)
    on conflict (email) do update set role = excluded.role, active = true, payroll = excluded.payroll;
    insert into public.gc_kv (key, value) values
      ('payrollRuns__chunk990', '[1]'::jsonb), ('users_private__chunk990', '{"x":1}'::jsonb),
      ('gc_ach_details__chunk990', '{"routing":"1"}'::jsonb), ('gc_dailybackup_1999-01-01', '{}'::jsonb)
    on conflict (key) do nothing;
    if has_ep then execute 'update public.gc_kv set epoch = $1 where key like ''%\_\_chunk990'' or key = ''gc_dailybackup_1999-01-01''' using ep; end if;
    -- a people list to try the guard on (the real one if there is one)
    select public.gc_json_of(to_jsonb(k.value)) into u0 from public.gc_kv k where k.key = 'users';
    if u0 is null or jsonb_typeof(u0) <> 'array' then u0 := '[]'::jsonb; end if;
    u0 := u0 || '[{"id":"SEC2PM","name":"Probe PM","email":"sec2-probe-pm@grayco-cs.com","role":"Project Manager","phone":"1"},
                  {"id":"SEC2OTHER","name":"Probe Other","email":"sec2-probe-other@grayco-cs.com","role":"Estimator"}]'::jsonb;
    insert into public.gc_kv (key, value) values ('users', u0) on conflict (key) do update set value = excluded.value;
    if has_ep then execute 'update public.gc_kv set epoch = $1 where key in (''users'', ''users_private'')' using ep; end if;

    -- ── a project manager (staff, no payroll) ──
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"sec2-probe-pm@grayco-cs.com"}', true);
    set local role authenticated;
    select count(*) into r_pm_admin from public.gc_kv where public.gc_kv_class(key) = 'admin';
    select count(*) into r_pm_pay from public.gc_kv where public.gc_kv_class(key) = 'payroll';
    select count(*) into r_pm_priv from public.gc_kv where key = 'users_private';
    select count(*) into r_pm_ach from public.gc_kv where key = 'gc_ach_details__chunk990';
    -- the PM makes themself Admin, renames themself, gives themself a salary, changes their phone and
    -- address, adds a person and removes another one
    begin
      execute $q$update public.gc_kv set value =
        (select coalesce(jsonb_agg(case when e ->> 'id' = 'SEC2PM'
                     then e || '{"role":"Admin","name":"Boss","salary":999999,"phone":"555-0100","address":"1 Main St"}'::jsonb else e end), '[]'::jsonb)
           from jsonb_array_elements(public.gc_json_of(to_jsonb(value))) e
          where e ->> 'id' is distinct from 'SEC2OTHER')
        || '[{"id":"SEC2NEW","name":"Sneaky","role":"Admin","email":"x@y.z"}]'::jsonb
        where key = 'users'$q$;
    exception when others then msg := sqlerrm; end;
    reset role;
    select e ->> 'role', e ->> 'name', e ->> 'salary', e ->> 'phone', e ->> 'address'
      into t_role, t_name, t_salary, t_phone, t_addr_pub
      from public.gc_kv k, jsonb_array_elements(public.gc_json_of(to_jsonb(k.value))) e
     where k.key = 'users' and e ->> 'id' = 'SEC2PM';
    select case when exists (select 1 from public.gc_kv k, jsonb_array_elements(public.gc_json_of(to_jsonb(k.value))) e
                              where k.key = 'users' and e ->> 'id' = 'SEC2NEW') then 'PROBLEM: added' else 'OK (not added)' end into t_new;
    select case when exists (select 1 from public.gc_kv k, jsonb_array_elements(public.gc_json_of(to_jsonb(k.value))) e
                              where k.key = 'users' and e ->> 'id' = 'SEC2OTHER') then 'OK (kept)' else 'PROBLEM: removed' end into t_gone;
    select coalesce(public.gc_json_of(to_jsonb(k.value)) #>> '{SEC2PM,address}', '') into t_addr
      from public.gc_kv k where k.key = 'users_private';

    -- the PM's writes (after the people-list test: with row level security off they would succeed)
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"sec2-probe-pm@grayco-cs.com"}', true);
    set local role authenticated;
    begin
      execute 'insert into public.gc_kv (key, value' || case when has_ep then ', epoch' else '' end || ') values (''payrollRuns__chunk991'', ''[]''::jsonb' || case when has_ep then ', $1' else '' end || ')' using ep;
      w_pm_pay := 'PROBLEM: written';
    exception when insufficient_privilege then w_pm_pay := 'OK (refused)'; when others then w_pm_pay := 'refused: ' || sqlerrm; end;
    begin
      execute 'update public.gc_kv set value = ''{"routing":"999"}''::jsonb where key = ''gc_ach_details__chunk990''';
      get diagnostics r_adm_pay = row_count;
      w_pm_ach := case when r_adm_pay = 0 then 'OK (0 rows changed)' else 'PROBLEM: changed' end;
    exception when insufficient_privilege then w_pm_ach := 'OK (refused)'; end;
    begin
      execute 'insert into public.gc_kv (key, value' || case when has_ep then ', epoch' else '' end || ') values (''users_private'', ''{}''::jsonb' || case when has_ep then ', $1' else '' end || ') on conflict (key) do update set value = excluded.value' using ep;
      w_pm_priv := 'PROBLEM: written';
    exception when insufficient_privilege then w_pm_priv := 'OK (refused)'; when others then w_pm_priv := 'refused: ' || sqlerrm; end;
    begin
      execute 'insert into public.gc_kv (key, value' || case when has_ep then ', epoch' else '' end || ') values (''sec2_probe_staff'', ''1''::jsonb' || case when has_ep then ', $1' else '' end || ')' using ep;
      w_pm_staff := 'OK (written)';
    exception when others then w_pm_staff := 'PROBLEM: ' || sqlerrm; end;
    if rls then begin
      execute 'delete from public.gc_kv where key = ''users''';
      get diagnostics r_adm_pay = row_count;
      d_pm_users := case when r_adm_pay = 0 then 'OK (nothing deleted)' else 'PROBLEM: deleted' end;
    exception when insufficient_privilege then d_pm_users := 'OK (refused)'; end; end if;
    reset role;

    -- ── the office (payroll) ──
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"sec2-probe-office@grayco-cs.com"}', true);
    set local role authenticated;
    select count(*) into r_off_pay from public.gc_kv where key = 'payrollRuns__chunk990';
    select count(*) into r_off_admin from public.gc_kv where public.gc_kv_class(key) = 'admin';
    begin
      execute 'update public.gc_kv set value = ''[2]''::jsonb where key = ''payrollRuns__chunk990''';
      get diagnostics r_adm_pay = row_count;
      w_off_pay := case when r_adm_pay = 1 then 'OK (written)' else 'PROBLEM: ' || r_adm_pay || ' rows' end;
    exception when others then w_off_pay := 'PROBLEM: ' || sqlerrm; end;
    begin
      execute 'update public.gc_kv set value = ''{"routing":"999"}''::jsonb where key = ''gc_ach_details__chunk990''';
      get diagnostics r_adm_pay = row_count;
      w_off_ach := case when r_adm_pay = 0 then 'OK (0 rows changed)' else 'PROBLEM: changed' end;
    exception when insufficient_privilege then w_off_ach := 'OK (refused)'; end;
    reset role;

    -- ── an admin ──
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"sec2-probe-admin@grayco-cs.com"}', true);
    set local role authenticated;
    select count(*) into r_adm_admin from public.gc_kv where key in ('users_private__chunk990', 'gc_dailybackup_1999-01-01');
    select count(*) into r_adm_pay from public.gc_kv where key = 'payrollRuns__chunk990';
    begin
      execute 'update public.gc_kv set value = ''{"routing":"2"}''::jsonb where key = ''gc_ach_details__chunk990''';
      w_adm_ach := 'OK (written)';
    exception when others then w_adm_ach := 'PROBLEM: ' || sqlerrm; end;
    begin
      execute $q$update public.gc_kv set value =
        (select jsonb_agg(case when e ->> 'id' = 'SEC2OTHER' then e || '{"role":"Project Manager","salary":70000,"ssn4":"1234"}'::jsonb else e end)
           from jsonb_array_elements(public.gc_json_of(to_jsonb(value))) e) where key = 'users'$q$;
    exception when others then t_adm_role := 'PROBLEM: ' || sqlerrm; end;
    reset role;
    if t_adm_role is null then
      select case when e ->> 'role' = 'Project Manager' and not (e ? 'salary') and not (e ? 'ssn4') then 'OK' else 'PROBLEM: ' || e::text end
        into t_adm_role
        from public.gc_kv k, jsonb_array_elements(public.gc_json_of(to_jsonb(k.value))) e
       where k.key = 'users' and e ->> 'id' = 'SEC2OTHER';
      select case when public.gc_json_of(to_jsonb(k.value)) #>> '{SEC2OTHER,salary}' = '70000'
                   and public.gc_json_of(to_jsonb(k.value)) #>> '{SEC2OTHER,ssn4}' = '1234' then 'OK' else 'PROBLEM' end
        into t_adm_priv from public.gc_kv k where k.key = 'users_private';
    end if;

    raise exception using errcode = 'P0001', message = 'gc_sec2_undo_probe';
  exception when others then
    reset role;
    if sqlerrm <> 'gc_sec2_undo_probe' then
      insert into gc_sec2_verify (check_name, result) values ('tests ran', 'PROBLEM: ' || sqlerrm);
      return;
    end if;
  end;

  if not rls then
    insert into gc_sec2_verify (check_name, result) values
      ('test people', 'NOT TESTED: row level security is off on gc_kv (run docs/security-lockdown.sql, then this file again)');
  else
    insert into gc_sec2_verify (check_name, result) values
      ('project manager reads owner-only rows', case when r_pm_admin = 0 then 'OK (0)' else 'PROBLEM: ' || r_pm_admin end),
      ('project manager reads payroll rows', case when r_pm_pay = 0 then 'OK (0)' else 'PROBLEM: ' || r_pm_pay end),
      ('project manager reads users_private', case when r_pm_priv = 0 then 'OK (0)' else 'PROBLEM: visible' end),
      ('project manager reads the invoice bank details', case when r_pm_ach = 1 then 'OK (can read)' else 'PROBLEM: ' || r_pm_ach end),
      ('project manager writes payroll', w_pm_pay),
      ('project manager changes the invoice bank details', w_pm_ach),
      ('project manager writes users_private', w_pm_priv),
      ('project manager writes an ordinary row', w_pm_staff),
      ('project manager deletes the people list', d_pm_users),
      ('office reads + writes payroll', case when r_off_pay = 1 and w_off_pay like 'OK%' then 'OK' else 'PROBLEM: read ' || r_off_pay || ', ' || w_off_pay end),
      ('office reads owner-only rows', case when r_off_admin = 0 then 'OK (0)' else 'PROBLEM: ' || r_off_admin end),
      ('office changes the invoice bank details', w_off_ach),
      ('admin reads owner-only + payroll rows', case when r_adm_admin = 2 and r_adm_pay = 1 then 'OK' else 'PROBLEM: ' || r_adm_admin || '/' || r_adm_pay end),
      ('admin changes the invoice bank details', w_adm_ach);
  end if;
  insert into gc_sec2_verify (check_name, result) values
    ('PM sets own role to Admin', case when t_role = 'Project Manager' then 'OK (stays Project Manager)' else 'PROBLEM: ' || coalesce(t_role, 'null') || coalesce(' ' || msg, '') end),
    ('PM renames themself / sets own salary', case when t_name = 'Probe PM' and t_salary is null then 'OK (refused)' else 'PROBLEM: ' || coalesce(t_name, '') || ' ' || coalesce(t_salary, '') end),
    ('PM changes own phone + home address', case when t_phone = '555-0100' and t_addr = '1 Main St' and t_addr_pub is null then 'OK (phone in users, address in users_private)' else 'PROBLEM: ' || coalesce(t_phone, '') || ' / ' || coalesce(t_addr, '') end),
    ('PM adds a person', t_new),
    ('PM removes a person', t_gone),
    ('admin edits pay: public part stays, pay moves', coalesce(t_adm_role, 'PROBLEM')),
    ('admin edits pay: users_private has it', coalesce(t_adm_priv, 'PROBLEM'));
end $$;

select check_name, result from gc_sec2_verify order by n;

-- ═══════════════════════════════════════════════════════════════════════════
-- UNDO (takes the owner-only rules away; gc_kv goes back to "any signed-in staff member").
-- Select from the next line down to "end undo", remove the leading "-- ", Run.
-- It also puts the private fields back into "users" (the CRM then works as before SEC2) and
-- removes gc_my_access(), so every computer goes back to the old way at its next start.
-- users_private is kept as it is (a copy).
-- ═══════════════════════════════════════════════════════════════════════════
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['gc_kv', 'app_data'] loop
--     if to_regclass('public.' || t) is not null then
--       execute format('drop policy if exists gc_sec2_read on public.%I', t);
--       execute format('drop policy if exists gc_sec2_insert on public.%I', t);
--       execute format('drop policy if exists gc_sec2_update on public.%I', t);
--       execute format('drop policy if exists gc_sec2_delete on public.%I', t);
--     end if;
--   end loop;
-- end $$;
-- drop trigger if exists gc_kv_users_guard on public.gc_kv;
-- drop function if exists public.gc_my_access();
-- update public.gc_kv u set value = (
--   select jsonb_agg(case when jsonb_typeof(e) = 'object' and p.v ? (e ->> 'id')
--                         then e || (select coalesce(jsonb_object_agg(x.key, x.value), '{}'::jsonb)
--                                    from jsonb_each(p.v -> (e ->> 'id')) x where x.value <> 'null'::jsonb)
--                         else e end order by o)
--   from jsonb_array_elements(public.gc_json_of(to_jsonb(u.value))) with ordinality as y(e, o),
--        (select public.gc_json_of(to_jsonb(value)) v from public.gc_kv where key = 'users_private') p)
-- where u.key = 'users' and exists (select 1 from public.gc_kv where key = 'users_private');
-- notify pgrst, 'reload schema';
-- end undo
