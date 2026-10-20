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
--   1. creates rs_leads, rs_activity, rs_settings, rs_profiles, rs_usage,
--      and the area scan's server-only cache and limits (rs_scan_cache, rs_scan_rate),
--      and the one-lookup-per-lead record for Tracerfy owner contact lookups (rs_skiptrace)
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

-- Paid-service lookups per month (Google Solar …), so the admin's monthly limit holds.
-- Only the server (Netlify function, service key) reads or writes it.
create table if not exists public.rs_usage (
  kind   text not null,
  month  text not null check (month ~ '^\d{4}-\d{2}$'),
  count  integer not null default 0,
  primary key (kind, month)
);
create or replace function public.rs_bump_usage(p_kind text, p_month text)
returns integer language sql security definer set search_path = public, pg_temp as $$
  insert into public.rs_usage (kind, month, count) values (p_kind, p_month, 1)
  on conflict (kind, month) do update set count = public.rs_usage.count + 1
  returning count;
$$;
revoke all on function public.rs_bump_usage(text, text) from public, anon, authenticated;

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
alter table public.rs_usage    enable row level security;   -- no rules: server only

revoke all on public.rs_leads, public.rs_activity, public.rs_settings, public.rs_profiles, public.rs_usage from public, anon, authenticated;
-- Supabase (from 2026-10-30): new tables need explicit grants for the API roles.
grant all on public.rs_leads, public.rs_activity, public.rs_settings, public.rs_profiles, public.rs_usage to service_role;

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

-- 3b. Area scan (Map → Scan an area) -------------------------------------------
-- Server-only, like rs_usage: the Netlify function roofscout-scan (service key) reads
-- and writes these; the web gets nothing. Added 2026-10; safe to run again.

-- Cached answers from the free public services (OpenStreetMap buildings per map tile,
-- county parcels, Memphis permits, NOAA hail days), so a rescan does not ask them again.
create table if not exists public.rs_scan_cache (
  key         text primary key check (char_length(key) <= 200),
  data        jsonb not null,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists rs_scan_cache_expires on public.rs_scan_cache (expires_at);

-- Request counts per hour (per person, and team-wide for OpenStreetMap downloads).
create table if not exists public.rs_scan_rate (
  bucket  text not null check (char_length(bucket) <= 200),
  hour    timestamptz not null,
  count   integer not null default 0,
  primary key (bucket, hour)
);

-- Counts one request and says whether it was allowed (false = over the hourly or 24-hour limit).
create or replace function public.rs_scan_take(p_bucket text, p_hour_limit integer, p_day_limit integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h timestamptz := date_trunc('hour', now());
  n_hour integer;
  n_day integer;
begin
  perform pg_advisory_xact_lock(hashtext('rs_scan_take:' || p_bucket));
  select coalesce(sum(count) filter (where hour = h), 0), coalesce(sum(count), 0)
    into n_hour, n_day
    from public.rs_scan_rate
   where bucket = p_bucket and hour > now() - interval '24 hours';
  if n_hour >= p_hour_limit or n_day >= p_day_limit then
    return false;
  end if;
  insert into public.rs_scan_rate (bucket, hour, count) values (p_bucket, h, 1)
  on conflict (bucket, hour) do update set count = public.rs_scan_rate.count + 1;
  if random() < 0.02 then
    delete from public.rs_scan_rate where hour < now() - interval '3 days';
  end if;
  return true;
end $$;
revoke all on function public.rs_scan_take(text, integer, integer) from public, anon, authenticated;

alter table public.rs_scan_cache enable row level security;   -- no rules: server only
alter table public.rs_scan_rate  enable row level security;   -- no rules: server only
revoke all on public.rs_scan_cache, public.rs_scan_rate from public, anon, authenticated;
grant all on public.rs_scan_cache, public.rs_scan_rate to service_role;

-- 3c. Owner contact lookups (Tracerfy skip tracing) -----------------------------
-- Server-only. One row per lead: the paid lookup's answer, so a second click (or two
-- clicks at once) never pays twice. The monthly count is in rs_usage (kind 'tracerfy').
create table if not exists public.rs_skiptrace (
  lead_id     text primary key check (lead_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  status      text not null check (status in ('pending', 'done')),
  result      jsonb,
  started_at  timestamptz not null default now(),
  fetched_at  timestamptz,
  by_email    text not null default ''
);

-- Claim the lookup for a lead. Returns {claimed:true}, or {claimed:false, busy:true} while
-- another lookup for it is running (under 2 minutes old), or {claimed:false, result} when it
-- was already looked up and p_again is false.
create or replace function public.rs_skiptrace_claim(p_lead text, p_by text, p_again boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rs_skiptrace;
begin
  perform pg_advisory_xact_lock(hashtext('rs_skiptrace:' || p_lead));
  select * into r from public.rs_skiptrace where lead_id = p_lead;
  if not found then
    insert into public.rs_skiptrace (lead_id, status, started_at, by_email) values (p_lead, 'pending', now(), coalesce(p_by, ''));
    return jsonb_build_object('claimed', true);
  end if;
  if r.status = 'pending' and r.started_at > now() - interval '2 minutes' then
    return jsonb_build_object('claimed', false, 'busy', true);
  end if;
  if r.status = 'done' and not coalesce(p_again, false) then
    return jsonb_build_object('claimed', false, 'result', r.result);
  end if;
  update public.rs_skiptrace set status = 'pending', started_at = now(), by_email = coalesce(p_by, '') where lead_id = p_lead;
  return jsonb_build_object('claimed', true);
end $$;

create or replace function public.rs_skiptrace_finish(p_lead text, p_result jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.rs_skiptrace set status = 'done', result = p_result, fetched_at = now() where lead_id = p_lead;
$$;

-- The lookup failed: go back to the earlier answer, or forget the claim if there was none.
create or replace function public.rs_skiptrace_release(p_lead text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.rs_skiptrace set status = 'done' where lead_id = p_lead and status = 'pending' and result is not null;
  delete from public.rs_skiptrace where lead_id = p_lead and status = 'pending' and result is null;
end $$;

revoke all on function public.rs_skiptrace_claim(text, text, boolean) from public, anon, authenticated;
revoke all on function public.rs_skiptrace_finish(text, jsonb) from public, anon, authenticated;
revoke all on function public.rs_skiptrace_release(text) from public, anon, authenticated;
alter table public.rs_skiptrace enable row level security;   -- no rules: server only
revoke all on public.rs_skiptrace from public, anon, authenticated;
grant all on public.rs_skiptrace to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFY — every line must say OK.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists rs_verify (check_name text, result text);
truncate rs_verify;

insert into rs_verify
select 'RoofScout tables exist', case when count(*) = 5 then 'OK' else 'PROBLEM: only ' || count(*) || ' of 5' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('rs_leads', 'rs_activity', 'rs_settings', 'rs_profiles', 'rs_usage');

insert into rs_verify
select 'RLS on every RoofScout table', coalesce('PROBLEM: RLS off on ' || string_agg(c.relname, ', '), 'OK')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('rs_leads', 'rs_activity', 'rs_settings', 'rs_profiles', 'rs_usage', 'rs_scan_cache', 'rs_scan_rate', 'rs_skiptrace') and not c.relrowsecurity;

insert into rs_verify
select 'only GrayCo staff rules', coalesce('PROBLEM: ' || string_agg(tablename || '.' || policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and tablename like 'rs\_%' and policyname not in ('gc_staff_all', 'gc_staff_read');

insert into rs_verify
select 'anon has no RoofScout rights', coalesce('PROBLEM: ' || string_agg(distinct table_name || ':' || privilege_type, ', '), 'OK')
from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name like 'rs\_%';

insert into rs_verify
select 'area scan tables exist', case when count(*) = 2 then 'OK' else 'PROBLEM: only ' || count(*) || ' of 2' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('rs_scan_cache', 'rs_scan_rate');

insert into rs_verify
select 'area scan limit function', case when to_regprocedure('public.rs_scan_take(text, integer, integer)') is not null
  and not has_function_privilege('authenticated', 'public.rs_scan_take(text, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rs_scan_take(text, integer, integer)', 'execute')
  then 'OK' else 'PROBLEM: missing or callable from the web' end;

insert into rs_verify
select 'owner lookup table + functions', case when to_regclass('public.rs_skiptrace') is not null
  and to_regprocedure('public.rs_skiptrace_claim(text, text, boolean)') is not null
  and not has_function_privilege('authenticated', 'public.rs_skiptrace_claim(text, text, boolean)', 'execute')
  and not has_table_privilege('authenticated', 'public.rs_skiptrace', 'select')
  then 'OK' else 'PROBLEM: missing or open to the web' end;

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
    execute 'select count(*) from public.rs_usage' into n;
    reset role;
    insert into rs_verify values ('usage counter hidden from the web', 'PROBLEM: readable');
  exception when insufficient_privilege then
    reset role;
    insert into rs_verify values ('usage counter hidden from the web', 'OK (permission denied)');
  end;

  begin
    set local role authenticated;
    execute 'select count(*) from public.rs_scan_cache' into n;
    reset role;
    insert into rs_verify values ('scan cache hidden from the web', 'PROBLEM: readable');
  exception when insufficient_privilege then
    reset role;
    insert into rs_verify values ('scan cache hidden from the web', 'OK (permission denied)');
  end;

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
-- drop table if exists public.rs_leads, public.rs_activity, public.rs_settings, public.rs_profiles, public.rs_usage, public.rs_scan_cache, public.rs_scan_rate, public.rs_skiptrace;
-- drop function if exists public.rs_scan_take(text, integer, integer);
-- drop function if exists public.rs_skiptrace_claim(text, text, boolean), public.rs_skiptrace_finish(text, jsonb), public.rs_skiptrace_release(text);
-- drop function if exists public.rs_stamp();
-- drop function if exists public.rs_bump_usage(text, text);
