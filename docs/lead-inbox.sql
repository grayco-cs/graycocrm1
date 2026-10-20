-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo LEAD INBOX (bids@grayco-cs.com, the public bid watcher, the admins' alerts)
-- safe to run any number of times.
-- Supabase (the CRM's project) → SQL Editor → New query → paste ALL of this → Run.
-- Run it AFTER docs/security-prepare.sql (it needs the gc_staff list).
--
-- What it does — it changes NOTHING in the CRM's own tables:
--   1. creates gc_lead_inbox_kv: the Lead Inbox's own records (the inbox list, the watcher's settings,
--      seen ids and last run, the admins' alert queue, the bid-portal draft queue). One row per record.
--      Before this table exists the functions keep the same records in gc_kv; step 2 moves them here.
--   2. copies those records from gc_kv (if the inbox ran before this SQL), keeping the newer copy.
--   3. rules: NONE. Row Level Security is on and there is no rule, so the public key and every
--      signed-in browser get nothing. Only the server functions (bid-inbox.js, bid-watch.js,
--      bid-alerts.js, service key) read and write; the CRM reads the inbox through bid-inbox.js,
--      which checks the staff sign-in. The CRM's sync never sees these rows.
--   4. prints a check list — every line must say OK.
--
-- The bid portal's own table (sp_rows) and bucket (subportal-files) come from docs/subportal-setup.sql.
-- Until they exist, new opportunities wait in the draft queue and are created there within the hour.
-- Works with docs/security-lockdown.sql: there are no rules here to remove; RLS is already on.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.gc_staff') is null then
    raise exception 'Run docs/security-prepare.sql first: it creates the GrayCo staff list (gc_staff).';
  end if;
end $$;

-- 1. The record table -------------------------------------------------------------
create table if not exists public.gc_lead_inbox_kv (
  key         text primary key check (length(key) between 1 and 200),
  value       jsonb,
  updated_at  timestamptz not null default now()
);

-- 2. Records the inbox kept in gc_kv before this table existed ---------------------
do $$
begin
  if to_regclass('public.gc_kv') is not null then
    insert into public.gc_lead_inbox_kv (key, value, updated_at)
    select k.key,
           case when jsonb_typeof(to_jsonb(k.value)) = 'string'
                then coalesce((to_jsonb(k.value) #>> '{}')::jsonb, to_jsonb(k.value))
                else to_jsonb(k.value) end,
           coalesce(k.updated_at, now())
    from public.gc_kv k
    where k.key in ('gc_lead_inbox', 'gc_lead_inbox_settings', 'gc_lead_inbox_notices', 'gc_bid_watch_seen',
                    'gc_bid_watch_status', 'gc_lead_inbox_alerts', 'gc_bidportal_queue')
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
      where public.gc_lead_inbox_kv.updated_at < excluded.updated_at;
  end if;
exception when others then
  raise notice 'gc_kv records not copied (%): the inbox starts empty here, nothing is lost in gc_kv.', sqlerrm;
end $$;

-- 3. The rules: none. Only the service key (the server functions) gets in --------------
alter table public.gc_lead_inbox_kv enable row level security;
alter table public.gc_lead_inbox_kv force row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'gc_lead_inbox_kv' loop
    execute format('drop policy if exists %I on public.gc_lead_inbox_kv', r.policyname);
  end loop;
end $$;
-- Supabase (from 2026-10-30): new tables need explicit grants for the API roles.
revoke all on public.gc_lead_inbox_kv from public, anon, authenticated;
grant all on public.gc_lead_inbox_kv to service_role;

notify pgrst, 'reload schema';   -- the web API learns the new table at once

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFY — every line must say OK (the last two lines are information).
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists li_verify (check_name text, result text);
truncate li_verify;

insert into li_verify
select 'table gc_lead_inbox_kv exists', case when to_regclass('public.gc_lead_inbox_kv') is not null then 'OK' else 'PROBLEM: missing' end;

insert into li_verify
select 'Row Level Security is on',
       case when (select relrowsecurity from pg_class where oid = 'public.gc_lead_inbox_kv'::regclass) then 'OK' else 'PROBLEM: RLS is off' end;

insert into li_verify
select 'no rule lets a browser in', coalesce('PROBLEM: ' || string_agg(policyname, ', '), 'OK')
from pg_policies where schemaname = 'public' and tablename = 'gc_lead_inbox_kv';

insert into li_verify
select 'the public key cannot read the inbox',
       case when has_table_privilege('anon', 'public.gc_lead_inbox_kv', 'select') then 'PROBLEM: anon has select' else 'OK' end;

insert into li_verify
select 'signed-in browsers cannot read the inbox',
       case when has_table_privilege('authenticated', 'public.gc_lead_inbox_kv', 'select') then 'PROBLEM: authenticated has select' else 'OK' end;

insert into li_verify
select 'the server functions can read and write',
       case when has_table_privilege('service_role', 'public.gc_lead_inbox_kv', 'select')
             and has_table_privilege('service_role', 'public.gc_lead_inbox_kv', 'insert')
             and has_table_privilege('service_role', 'public.gc_lead_inbox_kv', 'update') then 'OK' else 'PROBLEM: service_role grant missing' end;

insert into li_verify
select 'admins who get the bid alerts (gc_staff role admin)',
       coalesce((select string_agg(email, ', ' order by email) from public.gc_staff where role = 'admin' and active), 'none — add Wesley and Nick as admin');

insert into li_verify
select 'bid portal tables (docs/subportal-setup.sql)',
       case when to_regclass('public.sp_rows') is not null then 'ready — drafts go straight to the bid portal'
            else 'not yet — drafts wait in the queue until docs/subportal-setup.sql has run' end;

select * from li_verify;

-- UNDO (the CRM's leads are not touched; the inbox list, watcher state and queues are removed):
-- drop table if exists public.gc_lead_inbox_kv;
