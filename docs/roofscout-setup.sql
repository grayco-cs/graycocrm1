-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo RoofScout — PHASE 1 BACKEND (shared leads + team)   safe to run any number of times
-- Supabase (the CRM's project) → SQL Editor → New query → paste ALL of this → Run.
-- Run it AFTER docs/security-prepare.sql (it needs the gc_staff list).
--
-- RoofScout uses the CRM's own sign-in: the same people (gc_staff), the same
-- passwords, and one sign-in for both apps. Admins (gc_staff role 'admin') manage
-- pricing and branding; everyone on the staff list works the shared lead pool.
--
-- What it does — and it changes NOTHING in the CRM's own tables:
--   1. creates rs_leads, rs_activity, rs_settings, rs_profiles
--   2. rules: only signed-in GrayCo staff can use them; only admins change settings;
--      the activity log can be added to but never edited or erased through the web;
--      the public (anon) key gets nothing
--   3. gives every staff member a RoofScout profile (title / direct phone for flyers)
--   4. prints a check list — every line must say OK
--
-- The rules are named gc_staff_all / gc_staff_read on purpose: docs/security-lockdown.sql
-- keeps rules with exactly those names and removes every other one, so running the
-- lockdown again later leaves RoofScout working.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.gc_staff') is null or to_regprocedure('public.gc_is_staff()') is null then
    raise exception 'Run docs/security-prepare.sql first: it creates the GrayCo staff list (gc_staff).';
  end if;
end $$;

-- Same definition as docs/admin-data.sql, so running either file first is fine.
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

-- 1. Tables -------------------------------------------------------------------

-- One row per lead. The lead itself (property, roof, owner contact, stage, notes …)
-- is the JSON in `data`; the database stamps who changed it and when.
create table if not exists public.rs_leads (
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

-- Who opened, edited, called, printed … (the PM leaderboard is built from this).
create table if not exists public.rs_activity (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  user_email  text not null default '',
  lead_id     text,
  action      text not null check (char_length(action) <= 20),
  detail      text not null default '' check (char_length(detail) <= 500)
);
create index if not exists rs_activity_ts on public.rs_activity (ts desc);

-- Pricing, margin, coating, company / license info, proposal terms: one row.
create table if not exists public.rs_settings (
  id          text primary key check (id = 'main'),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);
insert into public.rs_settings (id) values ('main') on conflict (id) do nothing;

-- What goes on the flyers a person sends: their title and direct number.
create table if not exists public.rs_profiles (
  email       text primary key check (email = lower(btrim(email))),
  name        text not null default '',
  title       text not null default '',
  phone       text not null default '',
  rs_role     text not null default 'pm' check (rs_role in ('pm', 'sales')),
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

-- The database, not the browser, says who made a change and when.
create or replace function public.rs_stamp()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare who text := lower(coalesce(auth.jwt() ->> 'email', 'server'));
begin
  if tg_table_name = 'rs_activity' then
    new.ts := now();
    new.user_email := who;
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := who;
  if tg_table_name = 'rs_leads' then
    if tg_op = 'INSERT' then
      new.created_at := now();
      new.created_by := who;
    else
      new.created_at := old.created_at;
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rs_stamp on public.rs_leads;
create trigger rs_stamp before insert or update on public.rs_leads for each row execute function public.rs_stamp();
drop trigger if exists rs_stamp on public.rs_activity;
create trigger rs_stamp before insert on public.rs_activity for each row execute function public.rs_stamp();
drop trigger if exists rs_stamp on public.rs_settings;
create trigger rs_stamp before insert or update on public.rs_settings for each row execute function public.rs_stamp();
drop trigger if exists rs_stamp on public.rs_profiles;
create trigger rs_stamp before insert or update on public.rs_profiles for each row execute function public.rs_stamp();

-- 2. Rules ----------------------------------------------------------------------
alter table public.rs_leads    enable row level security;
alter table public.rs_activity enable row level security;
alter table public.rs_settings enable row level security;
alter table public.rs_profiles enable row level security;

revoke all on public.rs_leads, public.rs_activity, public.rs_settings, public.rs_profiles from public, anon, authenticated;

-- Leads: every signed-in staff member, one shared pool.
drop policy if exists gc_staff_all on public.rs_leads;
create policy gc_staff_all on public.rs_leads for all to authenticated
  using (public.gc_is_staff()) with check (public.gc_is_staff());
grant select, insert, update, delete on public.rs_leads to authenticated;

-- Activity: staff read it and add to it. No update / delete grant: the log can't be rewritten.
drop policy if exists gc_staff_all on public.rs_activity;
create policy gc_staff_all on public.rs_activity for all to authenticated
  using (public.gc_is_staff()) with check (public.gc_is_staff());
grant select, insert on public.rs_activity to authenticated;

-- Settings: staff read; only admins change.
drop policy if exists gc_staff_read on public.rs_settings;
create policy gc_staff_read on public.rs_settings for select to authenticated using (public.gc_is_staff());
drop policy if exists gc_staff_all on public.rs_settings;
create policy gc_staff_all on public.rs_settings for all to authenticated
  using (public.gc_is_admin()) with check (public.gc_is_admin());
grant select, insert, update on public.rs_settings to authenticated;

-- Profiles: staff read all; each person edits their own; admins edit anyone's.
drop policy if exists gc_staff_read on public.rs_profiles;
create policy gc_staff_read on public.rs_profiles for select to authenticated using (public.gc_is_staff());
drop policy if exists gc_staff_all on public.rs_profiles;
create policy gc_staff_all on public.rs_profiles for all to authenticated
  using (public.gc_is_admin() or (public.gc_is_staff() and email = lower(coalesce(auth.jwt() ->> 'email', ''))))
  with check (public.gc_is_admin() or (public.gc_is_staff() and email = lower(coalesce(auth.jwt() ->> 'email', ''))));
grant select, insert, update on public.rs_profiles to authenticated;

-- 3. A profile for everyone already on the staff list --------------------------
insert into public.rs_profiles (email, name)
select email, name from public.gc_staff
on conflict (email) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFY — every line must say OK.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists rs_verify (check_name text, result text);
truncate rs_verify;

insert into rs_verify
select 'RoofScout tables exist', case when count(*) = 4 then 'OK' else 'PROBLEM: only ' || count(*) || ' of 4' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('rs_leads', 'rs_activity', 'rs_settings', 'rs_profiles');

insert into rs_verify
select 'RLS on every RoofScout table', coalesce('PROBLEM: RLS off on ' || string_agg(c.relname, ', '), 'OK')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('rs_leads', 'rs_activity', 'rs_settings', 'rs_profiles') and not c.relrowsecurity;

insert into rs_verify
select 'only GrayCo staff rules', coalesce('PROBLEM: ' || string_agg(tablename || '.' || policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and tablename like 'rs\_%' and policyname not in ('gc_staff_all', 'gc_staff_read');

insert into rs_verify
select 'anon has no RoofScout rights', coalesce('PROBLEM: ' || string_agg(distinct table_name || ':' || privilege_type, ', '), 'OK')
from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name like 'rs\_%';

insert into rs_verify
select 'staff profiles', count(*)::text || ' profiles'
from public.rs_profiles;

do $$
declare n bigint;
begin
  begin
    set local role anon;
    execute 'select count(*) from public.rs_leads' into n;
    reset role;
    insert into rs_verify values ('anon reading rs_leads', 'PROBLEM: anon read ' || n || ' rows');
  exception when insufficient_privilege then
    reset role;
    insert into rs_verify values ('anon reading rs_leads', 'OK (permission denied)');
  end;

  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"stranger@example.com"}', true);
  set local role authenticated;
  execute 'select count(*) from public.rs_settings' into n;
  reset role;
  insert into rs_verify values ('signed-in non-staff reading settings', case when n = 0 then 'OK (0 rows)' else 'PROBLEM: ' || n || ' rows' end);

  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"wjohnson@grayco-cs.com"}', true);
  set local role authenticated;
  execute 'select count(*) from public.rs_settings' into n;
  reset role;
  insert into rs_verify values ('signed-in staff (Wesley) reading settings', case when n = 1 then 'OK (1 row)' else 'PROBLEM: ' || n || ' rows' end);

  begin
    set local role authenticated;
    execute 'delete from public.rs_activity';
    reset role;
    insert into rs_verify values ('activity log cannot be erased', 'PROBLEM: delete allowed');
  exception when insufficient_privilege then
    reset role;
    insert into rs_verify values ('activity log cannot be erased', 'OK (permission denied)');
  end;
end $$;

select * from rs_verify;

-- UNDO (removes RoofScout's tables and everything in them — the CRM is not touched):
-- drop table if exists public.rs_leads, public.rs_activity, public.rs_settings, public.rs_profiles;
-- drop function if exists public.rs_stamp();
