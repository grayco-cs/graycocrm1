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

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 (build 33.151): the sub portal on portal.grayco-cs.com, wired to the CRM
--   • gc_sub_link        one private link per sub company (portal.grayco-cs.com/#t=…), can be turned off
--   • gc_sub_device      phones a sub confirmed with a 6-digit code ("remember this phone")
--   • gc_portal_code     6-digit sign-in codes (customers and subs): only a fingerprint, 10 minutes, 5 tries
--   • gc_portal_session  "signed in on this device" (30 days; ends when the link is turned off)
--   • gc_sub_scope       scopes and change orders for a sub (versions, PM approval, sub acceptance)
--   • gc_portal_msg      messages between GrayCo and a customer (per job) or a sub (per job + sub)
--   • gc_sub_event       what a sub sends (invoice, photos, progress, punch done, W-9 / COI) until the CRM files it
--   • gc_portal_login    a customer's own password (scrypt fingerprint only) once they pick one
--   • gc_portal_lock     5 wrong passwords → 15 minutes locked (per e-mail / per address)
-- Same rules as sp_rows: Row Level Security on, no rules — only the server functions get in.
-- ═══════════════════════════════════════════════════════════════════════════
-- 5. one link per sub company ----------------------------------------------------
create table if not exists public.gc_sub_link (
  token          text primary key,                 -- 256 random bits, base64url
  sub_id         text not null,                    -- the CRM sub record id (Subs tab)
  sub_name       text,
  created_by     text,
  created_at     timestamptz not null default now(),
  revoked        boolean not null default false,
  revoked_at     timestamptz,
  last_viewed_at timestamptz,
  sent_at        timestamptz,
  sent_via       text
);
alter table public.gc_sub_link add column if not exists sub_name text;
alter table public.gc_sub_link add column if not exists revoked_at timestamptz;
alter table public.gc_sub_link add column if not exists last_viewed_at timestamptz;
alter table public.gc_sub_link add column if not exists sent_at timestamptz;
alter table public.gc_sub_link add column if not exists sent_via text;
create index if not exists gc_sub_link_sub on public.gc_sub_link (sub_id);
create unique index if not exists gc_sub_link_one_active on public.gc_sub_link (sub_id) where not revoked;

-- 6. phones a sub confirmed --------------------------------------------------------
create table if not exists public.gc_sub_device (
  id           text primary key,                   -- fingerprint (SHA-256) of the phone's device code
  link_token   text not null,
  sub_id       text not null,
  created_at   timestamptz not null default now(),
  verified_at  timestamptz,
  last_seen_at timestamptz,
  label        text
);
create index if not exists gc_sub_device_link on public.gc_sub_device (link_token);

-- 7. 6-digit codes -------------------------------------------------------------------
create table if not exists public.gc_portal_code (
  id          text primary key,
  purpose     text not null,                       -- 'signin' | 'device'
  ident       text not null,                       -- fingerprint of the e-mail / phone (never the address itself)
  code_hash   text not null,                       -- fingerprint of the code (never the code itself)
  link_token  text,
  sub_id      text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  tries       integer not null default 0,
  used_at     timestamptz,
  ip          text
);
create index if not exists gc_portal_code_ident on public.gc_portal_code (ident, created_at);
alter table public.gc_portal_code add column if not exists relay jsonb;   -- a code for a phone-only customer, until texting is set up: the PM texts it

-- 8. signed-in devices ---------------------------------------------------------------
create table if not exists public.gc_portal_session (
  id           text primary key,                   -- fingerprint (SHA-256) of the session code
  kind         text not null,                      -- 'customer' | 'partner'
  ident        text,
  sub_id       text,
  links        jsonb not null default '[]'::jsonb, -- the link codes it was opened with; a turned-off link ends it
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz,
  revoked      boolean not null default false
);
create index if not exists gc_portal_session_sub on public.gc_portal_session (sub_id);

-- 9. scopes and change orders for subs -------------------------------------------------
create table if not exists public.gc_sub_scope (
  id               text primary key,
  project_id       text not null,
  sub_id           text not null,
  kind             text not null default 'scope',  -- 'scope' | 'co'
  version          integer not null default 1,
  status           text not null default 'draft',  -- draft | waiting (PM approval) | published | accepted | question | void
  title            text,
  data             jsonb not null default '{}'::jsonb,   -- lines (description, measurement, qty, unit), included / excluded, materials, notes, files
  total            numeric,                        -- what GrayCo pays the sub (the only money a sub sees)
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  approved_by      text,
  approved_at      timestamptz,
  accepted_at      timestamptz,
  accepted_version integer,
  question         text,
  question_at      timestamptz,
  history          jsonb not null default '[]'::jsonb
);
alter table public.gc_sub_scope add column if not exists question text;
alter table public.gc_sub_scope add column if not exists question_at timestamptz;
alter table public.gc_sub_scope add column if not exists history jsonb not null default '[]'::jsonb;
create index if not exists gc_sub_scope_job on public.gc_sub_scope (project_id);
create index if not exists gc_sub_scope_sub on public.gc_sub_scope (sub_id);

-- 10. messages (customer per job; sub per job + sub) -------------------------------------
create table if not exists public.gc_portal_msg (
  id          text primary key,
  project_id  text not null,
  party       text not null,                       -- 'c' (the customer) or 's:<sub id>'
  side        text not null,                       -- 'gc' (GrayCo wrote it) | 'them' (customer / sub wrote it)
  author      text,
  text        text,
  files       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz                          -- when the other side read it (read receipt)
);
create index if not exists gc_portal_msg_thread on public.gc_portal_msg (project_id, party, created_at);
create index if not exists gc_portal_msg_unread on public.gc_portal_msg (side) where read_at is null;

-- 11. what subs sent, until the CRM files it -----------------------------------------------
create table if not exists public.gc_sub_event (
  id          text primary key,
  kind        text not null,                       -- upload | invoice | photos | progress | punch | paper | scope
  project_id  text,
  sub_id      text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,                         -- the CRM filed it
  applied_by  text
);
create index if not exists gc_sub_event_open on public.gc_sub_event (created_at) where applied_at is null;
create index if not exists gc_sub_event_sub on public.gc_sub_event (sub_id, kind);

-- 11b. customer portal login (e-mail + password; owner rule 20 Oct 2026) ------------------------
--   Starter password = the customer's first name. Nothing is stored for it; a row appears only when the
--   customer picks their own password, and then only its scrypt fingerprint.
create table if not exists public.gc_portal_login (
  login       text primary key,                    -- 'e:<e-mail>' or 'p:<10-digit mobile>'
  pw_hash     text,                                -- 'scrypt$<salt>$<hash>' — never the password
  changed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 5 wrong passwords → 15 minutes locked, per e-mail and per address (fingerprints only)
create table if not exists public.gc_portal_lock (
  id           text primary key,
  fails        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- 12. the rules: none. Only the service key (the server functions) gets in -----------------
do $$
declare t text; r record;
begin
  foreach t in array array['gc_sub_link','gc_sub_device','gc_portal_code','gc_portal_session','gc_sub_scope','gc_portal_msg','gc_sub_event','gc_portal_login','gc_portal_lock'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
    end loop;
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';   -- the web API learns the new tables at once

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
select 'all 9 portal tables exist',
       case when (select count(*) from unnest(array['gc_sub_link','gc_sub_device','gc_portal_code','gc_portal_session','gc_sub_scope','gc_portal_msg','gc_sub_event','gc_portal_login','gc_portal_lock']) t
                  where to_regclass('public.' || t) is not null) = 9 then 'OK' else 'PROBLEM: missing' end;

insert into sp_verify
select 'Row Level Security is on (all 9)',
       case when (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
                  where oid in ('public.gc_sub_link'::regclass, 'public.gc_sub_device'::regclass, 'public.gc_portal_code'::regclass,
                                'public.gc_portal_session'::regclass, 'public.gc_sub_scope'::regclass, 'public.gc_portal_msg'::regclass,
                                'public.gc_sub_event'::regclass, 'public.gc_portal_login'::regclass, 'public.gc_portal_lock'::regclass))
            then 'OK' else 'PROBLEM: RLS is off' end;

insert into sp_verify
select 'no rule lets a browser in (public key or signed-in)',
       coalesce('PROBLEM: ' || string_agg(tablename || '.' || policyname, ', '), 'OK')
from pg_policies where schemaname = 'public'
  and tablename in ('gc_sub_link','gc_sub_device','gc_portal_code','gc_portal_session','gc_sub_scope','gc_portal_msg','gc_sub_event','gc_portal_login','gc_portal_lock');

insert into sp_verify
select 'the public key cannot read links, codes, sessions or messages',
       case when has_table_privilege('anon', 'public.gc_sub_link', 'select') or has_table_privilege('anon', 'public.gc_portal_code', 'select')
              or has_table_privilege('anon', 'public.gc_portal_session', 'select') or has_table_privilege('anon', 'public.gc_portal_msg', 'select')
              or has_table_privilege('anon', 'public.gc_portal_login', 'select')
            then 'PROBLEM: anon has select' else 'OK' end;

insert into sp_verify
select 'signed-in browsers cannot read them either',
       case when has_table_privilege('authenticated', 'public.gc_sub_link', 'select') or has_table_privilege('authenticated', 'public.gc_portal_session', 'select')
              or has_table_privilege('authenticated', 'public.gc_sub_scope', 'select') or has_table_privilege('authenticated', 'public.gc_sub_event', 'select')
            then 'PROBLEM: authenticated has select' else 'OK' end;

insert into sp_verify
select 'the portal server (service key) can use them',
       case when has_table_privilege('service_role', 'public.gc_sub_link', 'insert') and has_table_privilege('service_role', 'public.gc_sub_event', 'update')
            then 'OK' else 'PROBLEM: service_role is missing rights' end;

insert into sp_verify
select 'one active link per sub',
       case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'gc_sub_link_one_active')
            then 'OK' else 'PROBLEM: index missing' end;

insert into sp_verify
select 'portal records so far',
       coalesce((select string_agg(collection || ' ' || n, ', ' order by collection)
                 from (select collection, count(*) n from public.sp_rows group by collection) x), 'none yet');

select * from sp_verify;

-- UNDO (removes the portal's records — the CRM is not touched; empty the bucket in
-- Supabase → Storage first if you also want the files gone):
-- drop table if exists public.sp_rows;
-- drop table if exists public.gc_sub_link, public.gc_sub_device, public.gc_portal_code, public.gc_portal_session,
--   public.gc_sub_scope, public.gc_portal_msg, public.gc_sub_event, public.gc_portal_login, public.gc_portal_lock;
