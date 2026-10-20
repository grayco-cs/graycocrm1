-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — OWNERS-ONLY DATA (gc_admin_kv)        safe to run any number of times
-- Supabase → SQL Editor → New query → paste ALL of this → Run.
-- Run it AFTER docs/security-prepare.sql (it needs the gc_staff list).
--
-- Owner rule: the office must never be able to see how much money the company has.
-- The cash / bank-balance records used to sit in gc_kv, which every staff computer reads:
--     gc_cash_anchor        "cash on hand" (Cash Flow screen)
--     gc_accounts_cfg       Payroll / Cash account opening balances
--     gc_accounts_ledger    Payroll / Cash account movements
-- This makes gc_admin_kv: a table only people whose gc_staff role is 'admin' (Wesley, Nick) can
-- read or write. The CRM (patch K) reads and writes those keys only there, and stops sending
-- them to gc_kv.
--
-- What it does — and it takes NOTHING away:
--   1. creates gc_admin_kv and gc_is_admin()
--   2. rules: admins may read / add / change; nobody else; nobody may delete through the web;
--      the public (anon) key gets nothing
--   3. COPIES the existing values from gc_kv into gc_admin_kv (an existing gc_admin_kv row is
--      kept if it is newer). The gc_kv copies are NOT deleted here — see step 5.
--   4. prints a check list
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The table and the "is this person an owner?" check ----------------------
create table if not exists public.gc_admin_kv (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- SECURITY DEFINER (same pattern as gc_is_staff) so it can read gc_staff without looping on its rules
create or replace function public.gc_is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.gc_staff s
    where s.active
      and s.role = 'admin'
      and s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.gc_is_admin() from public, anon;
grant execute on function public.gc_is_admin() to authenticated;

-- 2. The rules ------------------------------------------------------------------
alter table public.gc_admin_kv enable row level security;
alter table public.gc_admin_kv force row level security;
drop policy if exists gc_admin_read   on public.gc_admin_kv;
drop policy if exists gc_admin_insert on public.gc_admin_kv;
drop policy if exists gc_admin_update on public.gc_admin_kv;
create policy gc_admin_read   on public.gc_admin_kv for select to authenticated using (public.gc_is_admin());
create policy gc_admin_insert on public.gc_admin_kv for insert to authenticated with check (public.gc_is_admin());
create policy gc_admin_update on public.gc_admin_kv for update to authenticated using (public.gc_is_admin()) with check (public.gc_is_admin());
-- no delete policy and no delete grant: a record is never removed through the web
revoke all on public.gc_admin_kv from public, anon, authenticated;
grant select, insert, update on public.gc_admin_kv to authenticated;
grant all on public.gc_admin_kv to service_role;

-- 3. Copy the existing values over (gc_kv is left as it is) -----------------------
do $$
begin
  if to_regclass('public.gc_kv') is not null then
    insert into public.gc_admin_kv (key, value, updated_at)
    select k.key,
           case when jsonb_typeof(to_jsonb(k.value)) = 'string'
                then coalesce((to_jsonb(k.value) #>> '{}')::jsonb, to_jsonb(k.value))
                else to_jsonb(k.value) end,
           coalesce(k.updated_at, now())
    from public.gc_kv k
    where k.key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger')
    on conflict (key) do update
      set value = excluded.value, updated_at = excluded.updated_at
      where public.gc_admin_kv.updated_at < excluded.updated_at;
    raise notice 'copied from gc_kv';
  else
    raise notice '(no gc_kv table, nothing to copy)';
  end if;
exception when invalid_text_representation then
  -- a value stored as plain text that is not JSON: copy it as a JSON string
  insert into public.gc_admin_kv (key, value, updated_at)
  select k.key, to_jsonb(k.value), coalesce(k.updated_at, now())
  from public.gc_kv k
  where k.key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger')
  on conflict (key) do nothing;
end $$;

-- 4. Check list ------------------------------------------------------------------
drop table if exists pg_temp.gc_admin_verify;
create temp table gc_admin_verify (check_name text, result text);

insert into gc_admin_verify
select 'gc_admin_kv rows', count(*)::text || ' (' || coalesce(string_agg(key, ', ' order by key), 'none') || ')'
from public.gc_admin_kv;

insert into gc_admin_verify
select 'row level security on',
       case when c.relrowsecurity and c.relforcerowsecurity then 'OK' else 'PROBLEM' end
from pg_class c where c.oid = 'public.gc_admin_kv'::regclass;

insert into gc_admin_verify
select 'copies still in gc_kv (delete after checking, step 5)',
       case when to_regclass('public.gc_kv') is null then 'n/a'
            else (select count(*)::text from public.gc_kv where key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger')) end;

do $$
declare n bigint;
begin
  -- the public key
  begin
    set local role anon;
    execute 'select count(*) from public.gc_admin_kv' into n;
    reset role;
    insert into gc_admin_verify values ('anon reading gc_admin_kv', 'PROBLEM: anon read ' || n || ' rows');
  exception when insufficient_privilege then
    reset role;
    insert into gc_admin_verify values ('anon reading gc_admin_kv', 'OK (permission denied)');
  end;
  -- staff who is not an admin (the office)
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"office@grayco-cs.com"}', true);
    set local role authenticated;
    execute 'select count(*) from public.gc_admin_kv' into n;
    reset role;
    insert into gc_admin_verify values ('office (staff) reading gc_admin_kv', case when n = 0 then 'OK (0 rows)' else 'PROBLEM: ' || n || ' rows' end);
  end;
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"office@grayco-cs.com"}', true);
    set local role authenticated;
    execute $q$insert into public.gc_admin_kv (key, value) values ('gc_verify_probe', '1'::jsonb)$q$;
    reset role;
    delete from public.gc_admin_kv where key = 'gc_verify_probe';
    insert into gc_admin_verify values ('office (staff) writing gc_admin_kv', 'PROBLEM: write allowed');
  exception when insufficient_privilege then
    reset role;
    insert into gc_admin_verify values ('office (staff) writing gc_admin_kv', 'OK (refused)');
  end;
  -- Wesley
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"wjohnson@grayco-cs.com"}', true);
    set local role authenticated;
    execute 'select count(*) from public.gc_admin_kv' into n;
    reset role;
    insert into gc_admin_verify values ('admin (Wesley) reading gc_admin_kv', 'OK (' || n || ' rows)');
  end;
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"wjohnson@grayco-cs.com"}', true);
    set local role authenticated;
    execute $q$delete from public.gc_admin_kv where key = 'gc_cash_anchor'$q$;
    get diagnostics n = row_count;
    reset role;
    insert into gc_admin_verify values ('admin deleting from gc_admin_kv', case when n = 0 then 'OK (nothing deleted)' else 'PROBLEM: deleted ' || n end);
  exception when insufficient_privilege then
    reset role;
    insert into gc_admin_verify values ('admin deleting from gc_admin_kv', 'OK (permission denied)');
  end;
end $$;

select * from gc_admin_verify;

-- 5. AFTER you have checked the rows above (and Wesley's Cash Flow / Bank Accounts screens show
--    the right figures), remove the old copies from gc_kv by running this ONE line on its own:
--
--   delete from public.gc_kv where key in ('gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger');
