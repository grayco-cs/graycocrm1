-- docs/scale-20.sql — twenty (and more) people on the CRM at once (patch SCALE20)
-- ------------------------------------------------------------------------------------------
-- Run once in the Supabase SQL editor (safe to run again). Nothing here changes or deletes data.
--
-- 1. gc_kv.updated_at always moves when a row changes.
--    The CRM asks "which lists changed?" by comparing updated_at (key + timestamp only, then
--    downloads just those lists), and its save checks "is the row still the version I read?"
--    by updated_at too. A few older writers update a row without sending a new updated_at
--    (the approval-queue timer did, until SCALE20), so other computers could miss that change
--    until the 10-minute full pull. This trigger stamps the row whenever its value changes and
--    the writer did not move the timestamp itself.
create or replace function public.gc_kv_touch() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at
     and new.value is distinct from old.value then
    new.updated_at := clock_timestamp();
  end if;
  if new.updated_at is null then new.updated_at := clock_timestamp(); end if;
  return new;
end $$;
drop trigger if exists gc_kv_touch on public.gc_kv;
create trigger gc_kv_touch before insert or update on public.gc_kv
  for each row execute function public.gc_kv_touch();

-- 2. Indexes for the questions every computer asks.
--    "what changed since …" (updated_at=gt.…)  and the key-prefix reads (key=like.doc:* ,
--    key=like.gc_dailybackup_*). The primary key already answers key=eq / key=in.
create index if not exists gc_kv_updated_at on public.gc_kv (updated_at);
create index if not exists gc_kv_key_prefix on public.gc_kv (key text_pattern_ops);

-- 3. The staff rule on gc_kv asks "is this person staff?" once per query instead of once per row
--    (same rule, same answer — Postgres caches a (select …) for the whole statement).
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gc_kv' and policyname = 'gc_staff_all') then
    execute 'alter policy gc_staff_all on public.gc_kv using ((select public.gc_is_staff())) with check ((select public.gc_is_staff()))';
  end if;
end $$;

-- 4. The realtime feed: only gc_kv is needed (the old app_data table is not used by the CRM).
--    Leave as is if docs/realtime-setup.sql was run; this only reports.
select 'gc_kv on the realtime feed' as check,
       case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gc_kv')
            then 'OK' else 'run docs/realtime-setup.sql' end as result
union all
select 'gc_kv_touch trigger', case when exists (select 1 from pg_trigger where tgname = 'gc_kv_touch' and not tgisinternal) then 'OK' else 'PROBLEM' end
union all
select 'gc_kv_updated_at index', case when exists (select 1 from pg_indexes where indexname = 'gc_kv_updated_at') then 'OK' else 'PROBLEM' end
union all
select 'gc_kv_key_prefix index', case when exists (select 1 from pg_indexes where indexname = 'gc_kv_key_prefix') then 'OK' else 'PROBLEM' end;

-- 5. Size check (read only): the biggest rows every computer downloads when they change.
select key, pg_size_pretty(pg_column_size(value)::bigint) as stored, updated_at
from public.gc_kv order by pg_column_size(value) desc limit 15;
