-- GrayCo CRM 33.144 (patch N): put the company table on Supabase's live feed, so a save on one
-- computer or phone reaches every other one within a second or two.
-- Run once in Supabase → SQL Editor. Safe to run again.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gc_kv') then
    execute 'alter publication supabase_realtime add table public.gc_kv';
  end if;
end $$;

-- The live feed honours the same row-level security as every read: a signed-in staff member
-- (security-lockdown.sql) sees the changes, nobody else does. Nothing else to set.

-- Check: should return one row.
select schemaname, tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'gc_kv';

-- UNDO (turns the live feed off again; the CRM falls back to its timed sync by itself):
-- alter publication supabase_realtime drop table public.gc_kv;
