-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — PRIVATE MEDICAL & EXPOSURE RECORDS   (ENVCOMP)
-- Safe to run any number of times. Supabase → SQL Editor → New query → paste ALL → Run.
--
-- What it does: makes the table public.gc_medical, where the workers' medical surveillance (doctor visits, blood tests,
-- exams, fit tests, written opinions), personal exposure (air monitoring) results and medical removal records are kept.
-- Row Level Security is ON and there are NO rules, so NO browser can read, write or delete it — not even an admin's.
-- Only the Netlify functions (envcomp.js, gc-portal-daily.js) get in, with the service key, and they decide:
--   • each worker reads their OWN records;
--   • admins and the people with gc_staff.payroll = true (the Office Manager) read everyone's;
--   • everyone else only sees gc_kv "gc_medical_status" — current / due / overdue per person, never a date, a test or a result.
-- Until this file has run, the CRM says "Run docs/envcomp-medical.sql first" and keeps nothing.
-- Nothing in the CRM deletes from this table (records are kept; corrections keep their history).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.gc_medical (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gc_medical enable row level security;
revoke all on table public.gc_medical from anon, authenticated;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'gc_medical' loop
    execute format('drop policy if exists %I on public.gc_medical', r.policyname);
  end loop;
end $$;

select 'gc_medical exists' as check, case when to_regclass('public.gc_medical') is not null then 'OK' else 'PROBLEM' end as result
union all
select 'row level security is on', case when (select relrowsecurity from pg_class where oid = 'public.gc_medical'::regclass) then 'OK' else 'PROBLEM' end
union all
select 'no browser rules', case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gc_medical') then 'OK' else 'PROBLEM' end;
