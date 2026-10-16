-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — SECURITY, PART 1 of 2: PREPARE   (safe to run any time, any number of times)
-- Supabase → SQL Editor → New query → paste ALL of this → Run.
--
-- What it does — and it takes NOTHING away; the current CRM keeps working:
--   • creates gc_staff, the list of people allowed in (Team access in the CRM edits it)
--   • creates gc_backups, the private nightly backup table (no one can read it from the web)
--   • ADDS "signed-in staff may use this table" rules to the CRM's tables, so the new
--     sign-in build works before AND after part 2 (docs/security-lockdown.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The staff list ----------------------------------------------------------
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
-- Anyone else (Brittany, a new hire…): add them in the CRM — 💎 → Team access → Add.
-- (Or here:  insert into public.gc_staff (email, name, role) values ('name@grayco-cs.com', 'Name', 'staff');
--  then Supabase → Authentication → Users → Add user for the same email.)

-- "Is the person asking a signed-in GrayCo staff member?"  Used by every rule below.
-- SECURITY DEFINER so it can read gc_staff without the rules on gc_staff looping.
create or replace function public.gc_is_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.gc_staff s
    where s.active
      and s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.gc_is_staff() from public, anon;
grant execute on function public.gc_is_staff() to authenticated;

alter table public.gc_staff enable row level security;
drop policy if exists gc_staff_read on public.gc_staff;
create policy gc_staff_read on public.gc_staff for select to authenticated using (public.gc_is_staff());
-- nobody writes gc_staff through the web API; only the staff-admin function (service key) does
revoke all on public.gc_staff from anon, authenticated;
grant select on public.gc_staff to authenticated;

-- 2. The private backup table -------------------------------------------------
create table if not exists public.gc_backups (
  id         bigserial primary key,
  taken_at   timestamptz not null default now(),
  source     text not null,
  row_count  integer not null default 0,
  snapshot   jsonb not null
);
create index if not exists gc_backups_source_taken on public.gc_backups (source, taken_at desc);
alter table public.gc_backups enable row level security;   -- and NO policies: no web access at all
revoke all on public.gc_backups from anon, authenticated;
revoke all on sequence public.gc_backups_id_seq from anon, authenticated;

-- 3. "Signed-in staff may use this table" on every table the CRM uses ----------
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
      raise notice 'staff rule on %', t;
    else
      raise notice '(no table %, skipped)', t;
    end if;
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;
revoke all on sequence public.gc_backups_id_seq from authenticated;

select 'prepared' as step, (select count(*) from public.gc_staff) as staff_on_list;
