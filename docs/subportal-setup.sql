-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo SUBCONTRACTOR PORTAL (portal.grayco-cs.com)   safe to run any number of times
-- Supabase (the CRM's project) → SQL Editor → New query → paste ALL of this → Run.
-- Run it AFTER docs/security-prepare.sql (it needs the gc_staff list).
--
-- The portal uses the CRM's own Supabase project:
--   • GrayCo staff (gc_staff) sign in with their CRM email and password and are the
--     portal's admins. Subcontractors get their own sign-in when they register.
--   • Subcontractors are signed-in users too, but they are NOT on gc_staff, so every
--     CRM table, every RoofScout table and the crm-files bucket stay closed to them
--     (those rules all ask gc_is_staff()). The checks at the bottom prove it.
--
-- What it does — and it changes NOTHING in the CRM's own tables:
--   1. creates sp_rows: every portal record (subs' profiles, bid jobs, bids, messages,
--      documents list, takeoffs …), one row each, the record itself as JSON
--   2. creates the PRIVATE file bucket "subportal-files" (plans, bid attachments,
--      W-9s, insurance certificates). 50 MB per file.
--   3. rules: NONE. Row Level Security is on and there is no rule, so the public key and
--      every signed-in browser get nothing. Only the portal's server function
--      (netlify/functions/subportal.js, service key) reads and writes — and it shows
--      each subcontractor only their own records.
--   4. prints a check list — every line must say OK
--
-- Works with docs/security-lockdown.sql: the lockdown removes rules, and there are none
-- here to remove; it turns RLS on, which it already is.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.gc_staff') is null or to_regprocedure('public.gc_is_staff()') is null then
    raise exception 'Run docs/security-prepare.sql first: it creates the GrayCo staff list (gc_staff).';
  end if;
end $$;

-- 1. The record table -----------------------------------------------------------
-- key = '<collection>/<id>'. collection is one of: users, jobs, bids, estimates,
-- activity, messages, invites, links, plans, subdocs, takeoff, bid-draft.
create table if not exists public.sp_rows (
  key         text primary key check (length(key) <= 400),
  collection  text not null check (collection ~ '^[a-z-]{2,20}$'),
  id          text not null check (length(id) between 1 and 360),
  job_id      text,
  user_id     text,
  email       text,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);
create index if not exists sp_rows_collection on public.sp_rows (collection);
create index if not exists sp_rows_coll_user  on public.sp_rows (collection, user_id);
create index if not exists sp_rows_coll_job   on public.sp_rows (collection, job_id);
create index if not exists sp_rows_coll_email on public.sp_rows (collection, email);
-- one portal profile per sign-in email
create unique index if not exists sp_rows_one_profile_per_email on public.sp_rows (email) where collection = 'users';

-- 2. The private file bucket ------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('subportal-files', 'subportal-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 3. The rules: none. Only the service key (the server function) gets in -----------
alter table public.sp_rows enable row level security;
alter table public.sp_rows force row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'sp_rows' loop
    execute format('drop policy if exists %I on public.sp_rows', r.policyname);
  end loop;
  -- no storage rule may mention the portal bucket (files go out only as short signed links)
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') like '%subportal-files%' or coalesce(with_check, '') like '%subportal-files%') loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;
revoke all on public.sp_rows from public, anon, authenticated;
grant all on public.sp_rows to service_role;

notify pgrst, 'reload schema';   -- the web API learns the new table at once

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFY — every line must say OK.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists sp_verify (check_name text, result text);
truncate sp_verify;

insert into sp_verify
select 'table sp_rows exists', case when to_regclass('public.sp_rows') is not null then 'OK' else 'PROBLEM: missing' end;

insert into sp_verify
select 'Row Level Security is on',
       case when (select relrowsecurity from pg_class where oid = 'public.sp_rows'::regclass) then 'OK' else 'PROBLEM: RLS is off' end;

insert into sp_verify
select 'no rule lets a browser in', coalesce('PROBLEM: ' || string_agg(policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and tablename = 'sp_rows';

insert into sp_verify
select 'bucket subportal-files exists and is private',
       coalesce((select case when public then 'PROBLEM: bucket is public' else 'OK' end
                 from storage.buckets where id = 'subportal-files'), 'PROBLEM: missing');

insert into sp_verify
select 'the public key cannot read portal records',
       case when has_table_privilege('anon', 'public.sp_rows', 'select') then 'PROBLEM: anon has select' else 'OK' end;

insert into sp_verify
select 'signed-in browsers cannot read portal records',
       case when has_table_privilege('authenticated', 'public.sp_rows', 'select') then 'PROBLEM: authenticated has select' else 'OK' end;

-- A subcontractor is a signed-in user who is NOT on gc_staff. Prove the CRM stays closed to them.
do $$
declare n bigint;
begin
  if to_regclass('public.gc_kv') is not null then
    perform set_config('request.jwt.claims', '{"role":"authenticated","email":"sub-check@example.com"}', true);
    begin
      set local role authenticated;
      execute 'select count(*) from public.gc_kv' into n;
      reset role;
      insert into sp_verify values ('a signed-in subcontractor reading CRM records (gc_kv)',
        case when n = 0 then 'OK (0 rows)' else 'PROBLEM: ' || n || ' rows — run docs/security-lockdown.sql' end);
    exception when insufficient_privilege then
      reset role;
      insert into sp_verify values ('a signed-in subcontractor reading CRM records (gc_kv)', 'OK (permission denied)');
    end;
  end if;
  begin
    set local role anon;
    execute 'select count(*) from public.sp_rows' into n;
    reset role;
    insert into sp_verify values ('anon reading sp_rows', 'PROBLEM: anon read ' || n || ' rows');
  exception when insufficient_privilege then
    reset role;
    insert into sp_verify values ('anon reading sp_rows', 'OK (permission denied)');
  end;
end $$;

insert into sp_verify
select 'portal records so far',
       coalesce((select string_agg(collection || ' ' || n, ', ' order by collection)
                 from (select collection, count(*) n from public.sp_rows group by collection) x), 'none yet');

select * from sp_verify;

-- UNDO (removes the portal's records — the CRM is not touched; empty the bucket in
-- Supabase → Storage first if you also want the files gone):
-- drop table if exists public.sp_rows;
