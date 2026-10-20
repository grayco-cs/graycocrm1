-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo Photos (patch U2) — one-time setup. Safe to run any number of times.
-- Supabase → SQL Editor → New query → paste ALL → Run.
--
-- 1. gc_photo_reports — share links for photo reports (netlify/functions/photo-report.js).
-- 2. gc_sub_portal    — the sub portal's link codes (netlify/functions/sub-photos.js; contract in
--                       docs/SUB-PHOTOS-API.md). One row per code: which sub it is, optional extra
--                       jobs, turned off / expiry.
-- Both: row level security ON and NO policies, and no grants for anon / authenticated: the browser's
-- keys cannot read or change them. Only the server (service_role key) can — granted explicitly,
-- because from 2026-10-30 Supabase no longer grants API access to new tables by itself.
--
-- The photo records themselves stay in gc_kv ("gc_photos", "gc_jobchat": ordinary staff keys, class
-- 'staff' in docs/security-data.sql — nothing to change there) and the pictures in the private bucket
-- crm-files (docs/storage-setup.sql — no change: subs never touch the bucket, the server stores and
-- signs their photos).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. photo report share links ------------------------------------------------
create table if not exists public.gc_photo_reports (
  id             uuid primary key,
  token          text not null unique,          -- 256 random bits (base64url, 43 chars)
  project_id     text not null,
  title          text not null default 'Photo report',
  items          jsonb not null default '[]',   -- [{id:"ph_…"}] GrayCo photos, or {cc:1,t,f,at,tag,by} CompanyCam ones
  created_by     text,
  created_at     timestamptz not null default now(),
  revoked        boolean not null default false,
  revoked_at     timestamptz,
  revoked_by     text,
  last_viewed_at timestamptz
);
create index if not exists gc_photo_reports_project on public.gc_photo_reports (project_id, created_at desc);
alter table public.gc_photo_reports enable row level security;
revoke all on public.gc_photo_reports from public, anon, authenticated;
grant all on public.gc_photo_reports to service_role;

-- 2. sub portal link codes ----------------------------------------------------
create table if not exists public.gc_sub_portal (
  token          text primary key,              -- 32-64 chars [A-Za-z0-9_-], random (e.g. 256 bits base64url)
  sub_id         text not null,                 -- the sub's id in the CRM (vendors[].id = projects[].subs[].vendorId)
  sub_name       text not null default '',
  sub_email      text not null default '',
  job_ids        text[] not null default '{}',  -- extra jobs besides the ones whose subs list names this sub
  created_by     text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz,                   -- null = until turned off
  revoked        boolean not null default false,
  revoked_at     timestamptz,
  last_viewed_at timestamptz
);
create index if not exists gc_sub_portal_sub on public.gc_sub_portal (sub_id);
alter table public.gc_sub_portal enable row level security;
revoke all on public.gc_sub_portal from public, anon, authenticated;
grant all on public.gc_sub_portal to service_role;

-- check list: every line should say OK -------------------------------------------
select 'gc_photo_reports: RLS on, browser keys locked out' as check,
       case when (select relrowsecurity from pg_class where oid = 'public.gc_photo_reports'::regclass)
             and not has_table_privilege('anon', 'public.gc_photo_reports', 'select')
             and not has_table_privilege('authenticated', 'public.gc_photo_reports', 'select')
             and has_table_privilege('service_role', 'public.gc_photo_reports', 'select,insert,update')
            then 'OK' else 'PROBLEM' end as result
union all
select 'gc_sub_portal: RLS on, browser keys locked out',
       case when (select relrowsecurity from pg_class where oid = 'public.gc_sub_portal'::regclass)
             and not has_table_privilege('anon', 'public.gc_sub_portal', 'select')
             and not has_table_privilege('authenticated', 'public.gc_sub_portal', 'select')
             and has_table_privilege('service_role', 'public.gc_sub_portal', 'select,insert,update')
            then 'OK' else 'PROBLEM' end;
