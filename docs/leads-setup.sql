-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo Lead List — SHARED DATABASE   safe to run any number of times
-- Supabase (the CRM's project) → SQL Editor → New query → paste ALL of this → Run.
-- Run it AFTER docs/security-prepare.sql (it needs the gc_staff list).
--
-- The lead list (leads/) uses the CRM's own sign-in: the same people (gc_staff),
-- the same passwords. Everyone on the staff list works one shared list.
--
-- What it does — and it changes NOTHING in the CRM's or RoofScout's tables:
--   1. creates ll_progress, ll_custom, ll_leadlist
--   2. rules: only signed-in GrayCo staff can use them; the public (anon) key gets nothing
--   3. prints a check list — every line must say OK
--
-- The tables have the same shape as the documents the lead list kept in its
-- Claude artifact (leads/HANDOFF.md, "Database docs"):
--   ll_progress  one row per company: status, call log, follow-up date, contact edits,
--                email draft, replies, extra portals, notes (the JSON in `data`)
--   ll_custom    companies added by hand
--   ll_leadlist  a spreadsheet uploaded with "Update from spreadsheet":
--                row 'meta' {at, fileName, chunks, count} and rows 'c0', 'c1' … {items}
--
-- The rules are named gc_staff_all on purpose: docs/security-lockdown.sql keeps rules
-- with that name and removes every other one, so running the lockdown again later
-- leaves the lead list working.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.gc_staff') is null or to_regprocedure('public.gc_is_staff()') is null then
    raise exception 'Run docs/security-prepare.sql first: it creates the GrayCo staff list (gc_staff).';
  end if;
end $$;

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.ll_progress (
  id          text primary key check (char_length(id) between 1 and 200),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);
create index if not exists ll_progress_updated on public.ll_progress (updated_at);

create table if not exists public.ll_custom (
  id          text primary key check (char_length(id) between 1 and 200),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

create table if not exists public.ll_leadlist (
  id          text primary key check (id = 'meta' or id ~ '^c[0-9]{1,3}$'),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

-- The database, not the browser, says who made a change and when.
create or replace function public.ll_stamp()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', 'server'));
  return new;
end $$;

drop trigger if exists ll_stamp on public.ll_progress;
create trigger ll_stamp before insert or update on public.ll_progress for each row execute function public.ll_stamp();
drop trigger if exists ll_stamp on public.ll_custom;
create trigger ll_stamp before insert or update on public.ll_custom for each row execute function public.ll_stamp();
drop trigger if exists ll_stamp on public.ll_leadlist;
create trigger ll_stamp before insert or update on public.ll_leadlist for each row execute function public.ll_stamp();

-- 2. Rules ----------------------------------------------------------------------
alter table public.ll_progress enable row level security;
alter table public.ll_custom   enable row level security;
alter table public.ll_leadlist enable row level security;

revoke all on public.ll_progress, public.ll_custom, public.ll_leadlist from public, anon, authenticated;

drop policy if exists gc_staff_all on public.ll_progress;
create policy gc_staff_all on public.ll_progress for all to authenticated
  using (public.gc_is_staff()) with check (public.gc_is_staff());
grant select, insert, update, delete on public.ll_progress to authenticated;

drop policy if exists gc_staff_all on public.ll_custom;
create policy gc_staff_all on public.ll_custom for all to authenticated
  using (public.gc_is_staff()) with check (public.gc_is_staff());
grant select, insert, update, delete on public.ll_custom to authenticated;

drop policy if exists gc_staff_all on public.ll_leadlist;
create policy gc_staff_all on public.ll_leadlist for all to authenticated
  using (public.gc_is_staff()) with check (public.gc_is_staff());
grant select, insert, update, delete on public.ll_leadlist to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VERIFY — every line must say OK.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists ll_verify (check_name text, result text);
truncate ll_verify;

insert into ll_verify
select 'lead list tables exist', case when count(*) = 3 then 'OK' else 'PROBLEM: only ' || count(*) || ' of 3' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('ll_progress', 'll_custom', 'll_leadlist');

insert into ll_verify
select 'RLS on every lead list table', coalesce('PROBLEM: RLS off on ' || string_agg(c.relname, ', '), 'OK')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('ll_progress', 'll_custom', 'll_leadlist') and not c.relrowsecurity;

insert into ll_verify
select 'only GrayCo staff rules', coalesce('PROBLEM: ' || string_agg(tablename || '.' || policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and tablename like 'll\_%' and policyname <> 'gc_staff_all';

insert into ll_verify
select 'anon has no lead list rights', coalesce('PROBLEM: ' || string_agg(distinct table_name || ':' || privilege_type, ', '), 'OK')
from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name like 'll\_%';

do $$
declare n bigint;
begin
  begin
    set local role anon;
    execute 'select count(*) from public.ll_progress' into n;
    reset role;
    insert into ll_verify values ('anon reading ll_progress', 'PROBLEM: anon read ' || n || ' rows');
  exception when insufficient_privilege then
    reset role;
    insert into ll_verify values ('anon reading ll_progress', 'OK (permission denied)');
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"stranger@example.com"}', true);
  set local role authenticated;
  begin
    execute 'insert into public.ll_progress (id, data) values (''_verify'', ''{}'')';
    reset role;
    delete from public.ll_progress where id = '_verify';
    insert into ll_verify values ('signed-in non-staff writing', 'PROBLEM: write allowed');
  exception when insufficient_privilege then
    reset role;
    insert into ll_verify values ('signed-in non-staff writing', 'OK (refused)');
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"wjohnson@grayco-cs.com"}', true);
  set local role authenticated;
  execute 'insert into public.ll_progress (id, data) values (''_verify'', ''{}'') on conflict (id) do update set data = excluded.data';
  execute 'select count(*) from public.ll_progress where id = ''_verify''' into n;
  execute 'delete from public.ll_progress where id = ''_verify''';
  reset role;
  insert into ll_verify values ('signed-in staff (Wesley) saving', case when n = 1 then 'OK' else 'PROBLEM: ' || n || ' rows' end);
end $$;

insert into ll_verify
select 'saved companies', count(*)::text || ' with progress' from public.ll_progress;

select * from ll_verify;

-- UNDO (removes the lead list's tables and everything in them — the CRM is not touched):
-- drop table if exists public.ll_progress, public.ll_custom, public.ll_leadlist;
-- drop function if exists public.ll_stamp();
