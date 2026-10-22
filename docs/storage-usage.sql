-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — STORAGE USAGE (patch INS3). Read-only. Safe to run any number of times.
-- Supabase → SQL Editor → New query → paste ALL → Run.
-- Adds two functions the CRM's Admin → 💾 Storage card calls with the service key only:
--   gc_storage_usage()  files and bytes per bucket · year · kind (image / pdf / other)
--   gc_db_size()        the database size in bytes
-- Nothing is moved, changed or deleted. Browsers (anon / signed-in users) cannot call them.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.gc_storage_usage()
returns table(bucket text, yr int, kind text, files bigint, bytes bigint)
language sql stable security definer set search_path = public, storage, pg_temp as $$
  select o.bucket_id::text,
         extract(year from o.created_at)::int,
         case when coalesce(o.metadata->>'mimetype', '') like 'image/%' then 'image'
              when coalesce(o.metadata->>'mimetype', '') = 'application/pdf' then 'pdf'
              else 'other' end,
         count(*)::bigint,
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  group by 1, 2, 3
$$;
create or replace function public.gc_db_size()
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select pg_database_size(current_database())::bigint
$$;
revoke all on function public.gc_storage_usage() from public, anon, authenticated;
revoke all on function public.gc_db_size() from public, anon, authenticated;
grant execute on function public.gc_storage_usage() to service_role;
grant execute on function public.gc_db_size() to service_role;

-- check list: every line should say OK
select 'storage usage function' as check, case when exists (select 1 from pg_proc where proname = 'gc_storage_usage') then 'OK' else 'PROBLEM' end as result
union all
select 'database size function', case when exists (select 1 from pg_proc where proname = 'gc_db_size') then 'OK' else 'PROBLEM' end
union all
select 'browsers cannot call them', case when not has_function_privilege('anon', 'public.gc_storage_usage()', 'execute') and not has_function_privilege('authenticated', 'public.gc_db_size()', 'execute') then 'OK' else 'PROBLEM' end;
