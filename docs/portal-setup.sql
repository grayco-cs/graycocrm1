-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — CUSTOMER PORTAL  (run ONCE; safe to run again)
-- Supabase → SQL Editor → New query → paste ALL of this → Run.
--
-- What it does:
--   • creates the table gc_portal: one row per customer link
--       (link code, which job, who made it, when, turned off?, last opened)
--   • creates the table gc_portal_mail: one row per final invoice
--       (when the first e-mail went, when the last reminder went, how many) —
--       so a reminder can never go out twice
--   • Row Level Security ON with NO rules on both tables: the public key and every
--     signed-in browser get NOTHING. Only the portal server function (service key)
--     can read or write them. Nobody can list the links from a browser.
--   • one active link per job at most (a second one is refused by the database)
-- Takes nothing away; the CRM keeps working before and after.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the link table ------------------------------------------------------------
create table if not exists public.gc_portal (
  token          text primary key,                 -- the link code (256 random bits, base64url)
  project_id     text not null,                    -- the CRM job id
  created_by     text,
  created_at     timestamptz not null default now(),
  revoked        boolean not null default false,
  last_viewed_at timestamptz,
  sent_at        timestamptz,
  sent_via       text,
  link_todo_at   timestamptz
);
alter table public.gc_portal add column if not exists created_by text;
alter table public.gc_portal add column if not exists revoked boolean not null default false;
alter table public.gc_portal add column if not exists last_viewed_at timestamptz;
alter table public.gc_portal add column if not exists sent_at timestamptz;      -- the link went to the customer (never twice)
alter table public.gc_portal add column if not exists sent_via text;            -- 'email' (text later, after A2P 10DLC)
alter table public.gc_portal add column if not exists link_todo_at timestamptz; -- no e-mail on file: an Office to-do was made
create index if not exists gc_portal_project on public.gc_portal (project_id);
create unique index if not exists gc_portal_one_active on public.gc_portal (project_id) where not revoked;

-- 2. the final-invoice e-mail log ---------------------------------------------
create table if not exists public.gc_portal_mail (
  invoice_id       text primary key,              -- the CRM invoice id
  project_id       text,
  first_sent_at    timestamptz,                   -- "your final invoice" e-mail
  last_reminder_at timestamptz,                   -- the last send (or try) — reminders are 15 days apart
  reminders        integer not null default 0,
  todo_at          timestamptz,                   -- an Office to-do was made instead (no e-mail on file)
  last_result      text,
  updated_at       timestamptz not null default now()
);
alter table public.gc_portal_mail add column if not exists todo_at timestamptz;
alter table public.gc_portal_mail add column if not exists last_result text;

-- 2b. "new papers in your portal" e-mails: one row per job + document — never sent twice --------
create table if not exists public.gc_portal_notice (
  doc_key       text primary key,                 -- '<job id>|est:<id>' / 'doc:<id>' / 'co:<id>' / 'link:<id>'
  project_id    text not null,
  title         text,
  first_seen_at timestamptz not null default now(),
  sent_at       timestamptz,                      -- claimed by the send that e-mailed it (or recorded)
  batch_id      text,                             -- the e-mail it went out in (several papers → one e-mail)
  result        text                              -- 'emailed' / 'todo' / 'already there'
);
create index if not exists gc_portal_notice_project on public.gc_portal_notice (project_id);
alter table public.gc_portal_notice enable row level security;
alter table public.gc_portal_notice force row level security;
revoke all on public.gc_portal_notice from public, anon, authenticated;
grant all on public.gc_portal_notice to service_role;

-- 3. the rules: none. Only the service key (the server function) gets in ---------
alter table public.gc_portal enable row level security;
alter table public.gc_portal force row level security;
alter table public.gc_portal_mail enable row level security;
alter table public.gc_portal_mail force row level security;
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('gc_portal', 'gc_portal_mail', 'gc_portal_notice') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
revoke all on public.gc_portal from public, anon, authenticated;
revoke all on public.gc_portal_mail from public, anon, authenticated;
grant all on public.gc_portal to service_role;
grant all on public.gc_portal_mail to service_role;

notify pgrst, 'reload schema';   -- the web API learns the new tables at once

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — the grid at the bottom must say OK on every line.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists gc_portal_verify (check_name text, result text);
truncate gc_portal_verify;

insert into gc_portal_verify
select 'tables gc_portal and gc_portal_mail exist',
       case when to_regclass('public.gc_portal') is not null and to_regclass('public.gc_portal_mail') is not null
            then 'OK' else 'PROBLEM: missing' end;

insert into gc_portal_verify
select 'Row Level Security is on (both tables)',
       case when (select bool_and(relrowsecurity) from pg_class where oid in ('public.gc_portal'::regclass, 'public.gc_portal_mail'::regclass))
            then 'OK' else 'PROBLEM: RLS is off' end;

insert into gc_portal_verify
select 'no rule lets a browser in (public key or signed-in)',
       coalesce('PROBLEM: ' || string_agg(policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and tablename in ('gc_portal', 'gc_portal_mail', 'gc_portal_notice');

insert into gc_portal_verify
select 'the public key cannot read the links',
       case when has_table_privilege('anon', 'public.gc_portal', 'select') then 'PROBLEM: anon has select' else 'OK' end;

insert into gc_portal_verify
select 'signed-in browsers cannot read the links',
       case when has_table_privilege('authenticated', 'public.gc_portal', 'select') then 'PROBLEM: authenticated has select' else 'OK' end;

insert into gc_portal_verify
select 'one active link per job',
       case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'gc_portal_one_active')
            then 'OK' else 'PROBLEM: index missing' end;

insert into gc_portal_verify
select 'customer links so far', (select count(*) filter (where not revoked) || ' active, ' || count(*) filter (where revoked) || ' turned off' from public.gc_portal);

select * from gc_portal_verify;
