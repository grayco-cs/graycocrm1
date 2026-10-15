-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — SECURITY, PART 2 of 2: LOCK DOWN
-- Run ONLY after (see docs/SECURITY-SETUP.md): the sign-in build is deployed, the
-- staff have sign-ins, and each of them has signed in once. Safe to run again.
-- Supabase → SQL Editor → New query → paste ALL of this → Run.
--
-- After this, the public page + the public "anon" key read and write NOTHING.
-- Only a signed-in person on gc_staff can use the CRM's tables. The Netlify
-- functions use the service key, which is not affected (it bypasses these rules).
-- If something breaks, the RE-OPEN block at the bottom undoes it in one run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. Part 1 again (idempotent), so this file works on its own ------------------
create table if not exists public.gc_staff (
  email     text primary key check (email = lower(btrim(email))),
  name      text not null default '',
  role      text not null default 'staff' check (role in ('admin', 'staff')),
  active    boolean not null default true,
  added_by  text not null default '',
  added_at  timestamptz not null default now()
);
insert into public.gc_staff (email, name, role, added_by) values
  ('wjohnson@grayco-cs.com', 'Wesley Johnson', 'admin', 'setup'),
  ('nthomas@grayco-cs.com',  'Nick Thomas',    'admin', 'setup'),
  ('gmiller@grayco-cs.com',  'Glenn Miller',   'staff', 'setup'),
  ('sbiffle@grayco-cs.com',  '',               'staff', 'setup'),
  ('office@grayco-cs.com',   'Office',         'staff', 'setup')
on conflict (email) do nothing;
-- Add Brittany and anyone else from the CRM: 💎 → Team access → Add.

create or replace function public.gc_is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.gc_staff s
                 where s.active and s.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.gc_is_staff() from public, anon;
grant execute on function public.gc_is_staff() to authenticated;

create table if not exists public.gc_backups (
  id bigserial primary key, taken_at timestamptz not null default now(),
  source text not null, row_count integer not null default 0, snapshot jsonb not null);
create index if not exists gc_backups_source_taken on public.gc_backups (source, taken_at desc);

-- 1. Row Level Security ON for EVERY table in the public schema -----------------
--    (the CRM's tables, the lead / money / CompanyCam queues, brain_files,
--     review_queue, gc_staff, gc_backups … and anything added later by hand)
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- 2. Remove EVERY old rule ("allow all", "anon can read", using (true) …) --------
--    Only the two GrayCo staff rules survive; they are re-made just below.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and policyname not in ('gc_staff_all', 'gc_staff_read')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'dropped old rule "%" on %', p.policyname, p.tablename;
  end loop;
end $$;

-- 3. Signed-in staff only, on the tables the CRM itself uses --------------------
do $$
declare t text;
begin
  foreach t in array array['gc_kv', 'app_data', 'projects', 'project_estimates', 'project_scope',
                           'project_materials', 'estimate_line_items', 'products']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists gc_staff_all on public.%I', t);
      execute format('create policy gc_staff_all on public.%I for all to authenticated '
                     'using (public.gc_is_staff()) with check (public.gc_is_staff())', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;

-- gc_staff: staff may READ it (the CRM shows who has access); nobody writes it via the API
drop policy if exists gc_staff_read on public.gc_staff;
create policy gc_staff_read on public.gc_staff for select to authenticated using (public.gc_is_staff());
revoke all on public.gc_staff from anon, authenticated;
grant select on public.gc_staff to authenticated;

-- gc_backups and every server-only table (gc_pending_money, ri_pending_leads,
-- cc_pending_leads, brain_files, brain_changelog, review_queue, review_settings …):
-- RLS on + no rules = no web access. Their Netlify functions use the service key.
revoke all on public.gc_backups from anon, authenticated;
revoke all on sequence public.gc_backups_id_seq from anon, authenticated;

-- 4. The public key gets NOTHING in the public schema, now or for tables added later
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Views run as their owner and would skip the rules above: make every view in
-- public run as the person asking (so the same rules apply to it).
do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
  end loop;
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'm'
  loop
    execute format('revoke all on public.%I from anon, authenticated', v.relname);
  end loop;
end $$;

-- 5. File storage (the CRM does not use it today): no public buckets, no anon rules
do $$
declare p record;
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false where public;
    for p in select policyname from pg_policies
             where schemaname = 'storage' and tablename = 'objects'
               and (roles @> array['anon']::name[] or roles @> array['public']::name[])
    loop
      execute format('drop policy if exists %I on storage.objects', p.policyname);
      raise notice 'dropped storage rule "%"', p.policyname;
    end loop;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — the results grid at the bottom must say OK on every line.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists gc_verify (check_name text, result text);
truncate gc_verify;

insert into gc_verify
select 'RLS on every public table',
       coalesce('PROBLEM: RLS off on ' || string_agg(c.relname, ', '), 'OK')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

insert into gc_verify
select 'no rules other than GrayCo staff rules',
       coalesce('PROBLEM: ' || string_agg(tablename || '.' || policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and policyname not in ('gc_staff_all', 'gc_staff_read');

insert into gc_verify
select 'anon has no table rights',
       coalesce('PROBLEM: ' || string_agg(distinct table_name || ':' || privilege_type, ', '), 'OK')
from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';

insert into gc_verify
select 'views follow the rules',
       coalesce('PROBLEM: ' || string_agg(c.relname, ', '), 'OK')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false);

insert into gc_verify
select 'staff on the list', count(*)::text || ' (' || string_agg(email || '=' || role, ', ') || ')'
from public.gc_staff where active;

do $$
declare n bigint;
begin
  -- the public key, trying to read the main table
  begin
    set local role anon;
    execute 'select count(*) from public.gc_kv' into n;
    reset role;
    insert into gc_verify values ('anon reading gc_kv', 'PROBLEM: anon read ' || n || ' rows');
  exception when insufficient_privilege then
    reset role;
    insert into gc_verify values ('anon reading gc_kv', 'OK (permission denied)');
  when undefined_table then
    reset role;
    insert into gc_verify values ('anon reading gc_kv', 'n/a (no gc_kv table)');
  end;
  -- a signed-in stranger (a Supabase account that is NOT on gc_staff)
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"stranger@example.com"}', true);
    set local role authenticated;
    execute 'select count(*) from public.gc_kv' into n;
    reset role;
    insert into gc_verify values ('signed-in non-staff reading gc_kv', case when n = 0 then 'OK (0 rows)' else 'PROBLEM: ' || n || ' rows' end);
  exception when undefined_table then reset role;
  end;
  -- Wesley, signed in
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"wjohnson@grayco-cs.com"}', true);
    set local role authenticated;
    execute 'select count(*) from public.gc_kv' into n;
    reset role;
    insert into gc_verify values ('signed-in staff (Wesley) reading gc_kv', 'OK (' || n || ' rows)');
  exception when undefined_table then reset role;
  end;
  -- the backups: invisible even to staff
  begin
    set local role authenticated;
    execute 'select count(*) from public.gc_backups' into n;
    reset role;
    insert into gc_verify values ('staff reading gc_backups', 'PROBLEM: visible');
  exception when insufficient_privilege then
    reset role;
    insert into gc_verify values ('staff reading gc_backups', 'OK (permission denied)');
  end;
end $$;

select * from gc_verify;

-- ═══════════════════════════════════════════════════════════════════════════
-- RE-OPEN (EMERGENCY ONLY). If the CRM cannot load its data after this file,
-- select from the next line down to "end re-open", remove the leading "-- "
-- from those lines, and Run. It lets the public key back in to the CRM's own
-- tables ONLY (the state before), so work can go on while it is looked at.
-- Run THIS WHOLE FILE again afterwards to lock it back down.
-- ═══════════════════════════════════════════════════════════════════════════
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['gc_kv', 'app_data', 'projects', 'project_estimates', 'project_scope',
--                            'project_materials', 'estimate_line_items', 'products']
--   loop
--     if to_regclass('public.' || t) is not null then
--       execute format('drop policy if exists gc_emergency_open on public.%I', t);
--       execute format('create policy gc_emergency_open on public.%I for all to anon, authenticated using (true) with check (true)', t);
--       execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
--     end if;
--   end loop;
-- end $$;
-- grant usage on all sequences in schema public to anon;
-- end re-open
