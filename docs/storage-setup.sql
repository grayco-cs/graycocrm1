-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — FILE STORAGE  (run ONCE, after docs/security-prepare.sql; safe to run again)
-- Supabase → SQL Editor → New query → paste ALL of this → Run.
--
-- What it does:
--   • creates the PRIVATE file bucket "crm-files" (nothing in it is public; 25 MB per file;
--     only document / picture / office / text / video types)
--   • signed-in GrayCo staff (public.gc_is_staff(), from security-prepare.sql) may READ files
--     and ADD files — nobody else, and never the public key
--   • NOBODY can change or delete a stored file through the CRM: a file is named by its own
--     SHA-256 fingerprint and many records (on many jobs, on every computer) can point to
--     the same one, so deleting it from one place could break the others. Removing a file
--     for good is an owner job done in the Supabase dashboard (Storage → crm-files).
-- Takes nothing away; the CRM keeps working before and after.
-- docs/security-lockdown.sql only removes storage rules made for the public ("anon"/"public")
-- roles and makes buckets private — it leaves these rules alone (they are for signed-in staff).
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. the staff check must exist (security-prepare.sql makes it)
do $$
begin
  if to_regprocedure('public.gc_is_staff()') is null then
    raise exception 'Run docs/security-prepare.sql first (it creates public.gc_is_staff()).';
  end if;
end $$;

-- 1. the private bucket ------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-files', 'crm-files', false, 26214400, array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif', 'image/tiff', 'image/svg+xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf', 'text/rtf', 'text/html', 'text/plain', 'text/csv', 'application/json',
  'application/zip', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4',
  'message/rfc822', 'application/vnd.ms-outlook',
  'application/octet-stream'            -- any other kind of file someone attaches (kept, never public)
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. the rules ----------------------------------------------------------------
-- read: staff only
drop policy if exists gc_files_read on storage.objects;
create policy gc_files_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-files' and public.gc_is_staff());

-- add: staff only, and only under the file's own fingerprint name "<64 hex>.<ext>"
drop policy if exists gc_files_add on storage.objects;
create policy gc_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-files' and public.gc_is_staff()
              and name ~ '^[0-9a-f]{64}\.[a-z0-9]{1,8}$');

-- change / delete: no rule at all = not allowed for anyone signed in (see the top)
drop policy if exists gc_files_update on storage.objects;
drop policy if exists gc_files_delete on storage.objects;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — the grid at the bottom must say OK on every line.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table if not exists gc_files_verify (check_name text, result text);
truncate gc_files_verify;

insert into gc_files_verify
select 'bucket crm-files exists and is private',
       coalesce((select case when public then 'PROBLEM: it is public' else 'OK (private, '
                 || coalesce((file_size_limit / 1048576)::text || ' MB limit', 'no size limit') || ')' end
                 from storage.buckets where id = 'crm-files'), 'PROBLEM: missing');

insert into gc_files_verify
select 'staff may read and add files',
       case when count(*) filter (where policyname = 'gc_files_read' and cmd = 'SELECT') = 1
             and count(*) filter (where policyname = 'gc_files_add' and cmd = 'INSERT') = 1
            then 'OK' else 'PROBLEM: rules missing' end
from pg_policies where schemaname = 'storage' and tablename = 'objects';

insert into gc_files_verify
select 'nobody may change or delete files through the app',
       coalesce('PROBLEM: ' || string_agg(policyname || ' (' || cmd || ')', ', '), 'OK')
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%crm-files%';

insert into gc_files_verify
select 'no rule lets the public key in',
       coalesce('PROBLEM: ' || string_agg(policyname, ', '), 'OK')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (roles @> array['anon']::name[] or roles @> array['public']::name[])
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%crm-files%';

insert into gc_files_verify
select 'files stored so far', count(*)::text || ' file(s), '
       || coalesce(round(sum(coalesce((metadata ->> 'size')::bigint, 0)) / 1048576.0, 1), 0)::text || ' MB'
from storage.objects where bucket_id = 'crm-files';

select * from gc_files_verify;
