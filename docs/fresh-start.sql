-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo CRM — FRESH START   (run ONCE; running it again changes nothing)
-- Supabase → SQL Editor → New query → paste ALL of this → Run.
-- Read docs/FRESH-START.md first. Close the CRM on every computer before you run it.
--
-- What it does, in one transaction (all of it happens, or none of it):
--   (a) COPIES every row of gc_kv, app_data and the other CRM tables, twice:
--         · into gc_backups, labelled 'fresh-start <time>', marked keep = true
--           (the nightly backup never prunes it — see netlify/functions/gc-backup.js)
--         · into gc_archive_fresh_start, a separate permanent table that cannot be
--           changed or deleted from (a trigger refuses it)
--       Neither table can be read or written from the web (RLS on, no rules).
--   (b) EMPTIES the company data in gc_kv: every business record and every
--       delete-list ("tombstones") goes. Configuration the CRM needs and that is
--       not in a backup file stays (Google / CompanyCam keys, templates, settings,
--       rate books…). The two lists are below, in gc_fresh_start_class().
--       app_data and the other tables are copied but NOT changed (the CRM no
--       longer reads them — 33.115 / 33.132 — so they cannot bring anything back).
--   (c) writes gc_kv 'gc_epoch' = {epoch, by:'fresh-start'}. Every computer that
--       opens the CRM after this sees it, puts its own old data aside (kept on that
--       computer) and starts empty, so nothing old can come back from any computer.
--       And the database refuses any gc_kv write from a browser that is not on this
--       fresh start (trigger gc_kv_epoch_guard) — an old tab cannot put old data back.
--   (d) shows a check list (the last result grid) — every line should say OK.
-- Nothing is destroyed: the UNDO block at the bottom puts gc_kv back exactly.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. The two permanent copies ------------------------------------------------
create table if not exists public.gc_backups (
  id         bigserial primary key,
  taken_at   timestamptz not null default now(),
  source     text not null,
  row_count  integer not null default 0,
  snapshot   jsonb not null
);
create index if not exists gc_backups_source_taken on public.gc_backups (source, taken_at desc);
alter table public.gc_backups add column if not exists label text;
alter table public.gc_backups add column if not exists keep boolean not null default false;
alter table public.gc_backups enable row level security;          -- no rules: no web access
revoke all on public.gc_backups from anon, authenticated;
revoke all on sequence public.gc_backups_id_seq from anon, authenticated;

-- a kept snapshot is never deleted (the nightly pruning skips it; any other delete is ignored)
create or replace function public.gc_backups_keep_guard() returns trigger
language plpgsql as $$
begin
  if old.keep then
    raise notice 'gc_backups row % is a kept snapshot (%): not deleted', old.id, old.label;
    return null;
  end if;
  return old;
end $$;
drop trigger if exists gc_backups_keep_guard on public.gc_backups;
create trigger gc_backups_keep_guard before delete on public.gc_backups
  for each row execute function public.gc_backups_keep_guard();

create table if not exists public.gc_archive_fresh_start (
  id        bigserial primary key,
  label     text not null,
  taken_at  timestamptz not null default now(),
  source    text not null,            -- the table the row came from
  row_key   text,                     -- gc_kv / app_data key
  row_data  jsonb not null            -- the whole row, every column
);
create index if not exists gc_archive_fresh_start_label on public.gc_archive_fresh_start (label, source);
alter table public.gc_archive_fresh_start enable row level security;   -- no rules: no web access
revoke all on public.gc_archive_fresh_start from anon, authenticated;
revoke all on sequence public.gc_archive_fresh_start_id_seq from anon, authenticated;

create or replace function public.gc_archive_permanent() returns trigger
language plpgsql as $$
begin
  raise exception 'gc_archive_fresh_start is permanent: rows are never changed or deleted';
end $$;
drop trigger if exists gc_archive_permanent on public.gc_archive_fresh_start;
create trigger gc_archive_permanent before update or delete on public.gc_archive_fresh_start
  for each row execute function public.gc_archive_permanent();
drop trigger if exists gc_archive_permanent_truncate on public.gc_archive_fresh_start;
create trigger gc_archive_permanent_truncate before truncate on public.gc_archive_fresh_start
  for each statement execute function public.gc_archive_permanent();

-- 0b. The database itself refuses old data from an out-of-date computer ----------
--     Every row the CRM (this build) writes to gc_kv carries the fresh start it is on
--     ("epoch"). Once gc_epoch exists, a row written from the web (a signed-in
--     browser) with any other epoch is refused — so even a window still running an
--     older build cannot put old data back. The SQL editor and the server functions
--     (service key) are not affected.
alter table public.gc_kv add column if not exists epoch text;
create or replace function public.gc_kv_epoch_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c   jsonb;
  cur text;
begin
  begin c := nullif(current_setting('request.jwt.claims', true), '')::jsonb; exception when others then c := null; end;
  if c is null or coalesce(c ->> 'role', '') not in ('anon', 'authenticated') then return new; end if;
  if new.key = 'gc_epoch' then
    raise exception 'GrayCo: gc_epoch is written only by docs/fresh-start.sql';
  end if;
  select (case when jsonb_typeof(to_jsonb(k.value)) = 'string' then (to_jsonb(k.value) #>> '{}')::jsonb else to_jsonb(k.value) end) ->> 'epoch'
    into cur from public.gc_kv k where k.key = 'gc_epoch';
  if cur is null then return new; end if;                       -- no fresh start yet: as before
  if new.epoch is distinct from cur then
    raise exception 'GrayCo fresh start: this computer is out of date (on %, the company data is on %). Close the CRM and open it again. Nothing was saved.',
      coalesce(new.epoch, 'an older build'), cur;
  end if;
  return new;
end $$;
revoke all on function public.gc_kv_epoch_guard() from public, anon, authenticated;
drop trigger if exists gc_kv_epoch_guard on public.gc_kv;
create trigger gc_kv_epoch_guard before insert or update on public.gc_kv
  for each row execute function public.gc_kv_epoch_guard();
notify pgrst, 'reload schema';   -- the web API learns the new column at once

-- 1. Which gc_kv key is what ----------------------------------------------------
--    KEEP   = configuration: stays in the cloud and on every computer.
--    DELETE = business records, delete-lists, documents, old backups, junk.
--    Anything not named on either list is DELETED too (it is in both copies above),
--    and the check list at the end names every such key so nothing goes unseen.
create or replace function public.gc_fresh_start_class(k text) returns text
language sql immutable as $$
  select case
    -- ── KEEP: configuration the CRM needs and that a backup file does not carry ──
    when k = any (array[
      'gc_epoch',                                                -- the fresh-start marker itself
      -- integrations (Google, CompanyCam): keys, tokens, mappings, "already imported" marks
      'gc_team_google_users', 'gc_gdoc_imported', 'gc_cc_token', 'gc_cc_token_backup', 'gc_cc_key_mirror',
      'gc_cc_creator_map', 'gc_cc_dismissed', 'gc_ccam_synced_ids',
      -- company settings
      'gc_ach_details', 'gc_commission_structures', 'commissionSchedules', 'payrollSettings', 'gc_checkrun_settings',
      'gc_contract_template', 'gc_contract_template_name', 'docTemplates', 'docTemplatesIndex', 'gc_company_docs',
      'gc_overhead_manual', 'gc_cash_anchor',
      -- price / rate books
      'laborRates', 'priceSheets', 'customProducts', 'priceEdits', '__est__gc_rates_v3', 'gc_invoice_learn', 'gc_material_leadtimes',
      -- screen settings and one-time markers
      'navOrders', 'gc_btn_pos', 'gc_explain_mode', '_qb_import_done'])
      then 'keep'
    when k like 'gcal\_token\_%' then 'keep'                    -- each person's Google Calendar / Docs sign-in
    when k like 'doctpl:%'       then 'keep'                    -- document templates
    -- ── DELETE: delete-lists ("tombstones") ──
    when k = 'gc_tombstones' or k like 'gc\_deleted\_%' then 'delete: delete-list'
    -- ── DELETE: business records ──
    when k = any (array[
      'projects', 'invs', 'invoices', 'cos', 'changeOrders', 'estimates', 'expenses', 'schedule', 'subs', 'vendors', 'customers',
      'leads', 'gcAcctRegister', 'projectPayments', 'projectDocs', 'bidOpps', 'bidLists', 'users', 'candidates', 'inspections',
      'scopes', 'punch', 'warrs', 'tmpls', 'logs', 'ccTrans', 'ccCards', 'photos', 'checklists', 'maintenance', 'warrClaims', 'todoDone',
      'timesheets', 'payrollW4', 'payrollProfiles', 'payrollRuns', 'payrollTaxPayments', 'gc_payroll_approvals',
      'gc_job_source', 'gc_sub_approvals', 'gc_check_queue', 'gc_employee_payments', 'gc_commission_paid', 'gc_expense_approvals',
      'gc_invoice_approvals', 'gc_project_approvals', 'gc_outbound_approvals', 'gc_contract_approvals', 'gc_override_requests',
      'gc_material_ordered', 'gc_custom_docs', 'gc_unfiled_docs', 'gc_master_leads', 'gc_active_no_deposit', 'gc_sub_compliance',
      'gc_owner_notifications', 'gc_est_notes_v1', 'gc_master_hubs', '__est__gc_matlog_v2', '__est__gc_ests_v2', '__est__gc_builder_slots',
      'gc_contract_reviews', 'gc_compliance_dates', 'gc_job_inspections', 'gc_sub_extra', 'gc_office_tasks', 'gc_pm_broadcasts',
      'gc_pm_assignments', 'gc_project_access_requests', 'gc_approval_notes', 'gc_sub_pdfs', 'gc_what_happened', 'gc_departed'])
      then 'delete: business records'
    when k like 'ccw\_%' or k like 'cc\_%' then 'delete: Cordova Club records'
    when k like 'doc:%'                   then 'delete: attached document'
    when k like '%\_\_chunk%' or k like '%\_\_manifest' then 'delete: piece of a split-up list'
    when k like 'gc\_dailybackup\_%'      then 'delete: old in-cloud daily backup'
    when k like '\_probe\_%' or k = '__healthcheck__' then 'delete: connection-test row'
    else 'delete: not on either list'
  end
$$;
revoke all on function public.gc_fresh_start_class(text) from public, anon, authenticated;

-- 2. The fresh start ---------------------------------------------------------------
do $$
declare
  v_force   boolean := false;   -- leave false. true = a SECOND fresh start on purpose (see FRESH-START.md)
  v_now     timestamptz := clock_timestamp();
  v_epoch   text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_label   text;
  v_prev    jsonb;
  v_has_upd boolean;
  v_n       bigint;
  t         text;
begin
  if to_regclass('public.gc_kv') is null then  -- (checked here too, for a clear message)
    raise exception 'There is no gc_kv table in this project — is this the GrayCo CRM database?';
  end if;
  select to_jsonb(x.value) into v_prev from public.gc_kv x where x.key = 'gc_epoch';
  if v_prev is not null and jsonb_typeof(v_prev) = 'string' then v_prev := (v_prev #>> '{}')::jsonb; end if;
  if v_prev is not null and v_prev ->> 'by' = 'fresh-start' and not v_force then
    raise notice 'A fresh start was already done (%). Nothing was changed. Undo is at the bottom of this file.', v_prev ->> 'epoch';
    return;
  end if;
  v_label := 'fresh-start ' || v_epoch;

  -- (a) two permanent copies of every row of every CRM table
  foreach t in array array['gc_kv', 'app_data', 'projects', 'project_estimates', 'project_scope',
                           'project_materials', 'estimate_line_items', 'products'] loop
    if to_regclass('public.' || t) is not null then
      execute format('insert into public.gc_archive_fresh_start (label, taken_at, source, row_key, row_data) '
                     'select $1, $2, %L, %s, to_jsonb(x) from public.%I x', t,
                     case when t in ('gc_kv', 'app_data') then 'x.key::text' else 'null' end, t)
        using v_label, v_now;
      get diagnostics v_n = row_count;
      execute format('insert into public.gc_backups (taken_at, source, row_count, snapshot, label, keep) '
                     'select $2, %L, 1, to_jsonb(x), $1, true from public.%I x', 'fresh-start/' || t, t)
        using v_label, v_now;
      insert into public.gc_backups (taken_at, source, row_count, snapshot, label, keep)
        values (v_now, 'fresh-start/' || t || '/summary', v_n, jsonb_build_object('table', t, 'rows', v_n, 'label', v_label), v_label, true);
      raise notice 'copied % row(s) of %', v_n, t;
    end if;
  end loop;

  -- (b) empty the company data (configuration stays)
  delete from public.gc_kv where public.gc_fresh_start_class(key) <> 'keep';
  get diagnostics v_n = row_count;
  raise notice 'removed % gc_kv row(s) (all of them are in both copies)', v_n;

  -- (c) the marker every computer checks before it writes anything
  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gc_kv' and column_name = 'updated_at') into v_has_upd;
  if v_has_upd then
    execute 'insert into public.gc_kv (key, value, updated_at) values ($1, $2, $3)
             on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at'
      using 'gc_epoch', jsonb_build_object('epoch', v_epoch, 'by', 'fresh-start', 'label', v_label), v_now;
  else
    execute 'insert into public.gc_kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value'
      using 'gc_epoch', jsonb_build_object('epoch', v_epoch, 'by', 'fresh-start', 'label', v_label);
  end if;
  raise notice 'fresh start % done', v_epoch;
end $$;

-- 3. Check list — every line should say OK ----------------------------------------
with last as (
  select label from public.gc_archive_fresh_start where label like 'fresh-start %' order by taken_at desc, id desc limit 1
), ep as (
  select (case when jsonb_typeof(to_jsonb(value)) = 'string' then (to_jsonb(value) #>> '{}')::jsonb else to_jsonb(value) end) as v
  from public.gc_kv where key = 'gc_epoch'
)
select 'marker gc_epoch' as check_name,
       coalesce((select 'OK ' || (v ->> 'epoch') || ' (' || (v ->> 'by') || ')' from ep), 'PROBLEM: no gc_epoch row') as result
union all
select 'permanent copy (gc_archive_fresh_start)',
       coalesce((select 'OK ' || l.label || ': ' || count(a.*) || ' row(s) from ' || count(distinct a.source) || ' table(s)'
                 from last l join public.gc_archive_fresh_start a on a.label = l.label group by l.label), 'PROBLEM: no copy')
union all
select 'kept copy (gc_backups, keep = true)',
       coalesce((select 'OK ' || count(*) || ' row(s), never pruned' from public.gc_backups b, last l where b.label = l.label and b.keep having count(*) > 0),
                'PROBLEM: no kept rows')
union all
select 'gc_kv copy is complete',
       (select case when count(*) = 0 then 'OK every copied gc_kv key is either still here (kept) or was meant to go'
                    else 'PROBLEM: ' || string_agg(a.row_key, ', ') end
        from last l join public.gc_archive_fresh_start a on a.label = l.label and a.source = 'gc_kv'
        where public.gc_fresh_start_class(a.row_key) = 'keep' and a.row_key <> 'gc_epoch'
          and not exists (select 1 from public.gc_kv k where k.key = a.row_key))
union all
select 'no business records or delete-lists left in gc_kv',
       coalesce((select 'PROBLEM: ' || string_agg(key, ', ') from public.gc_kv where public.gc_fresh_start_class(key) <> 'keep'), 'OK')
union all
select 'kept in gc_kv (configuration)',
       coalesce((select count(*) || ': ' || string_agg(key, ', ' order by key) from public.gc_kv), '0')
union all
select 'removed, not on either list (in the copies; tell Claude if one should have stayed)',
       coalesce((select string_agg(a.row_key, ', ' order by a.row_key) from last l join public.gc_archive_fresh_start a on a.label = l.label and a.source = 'gc_kv'
                 where public.gc_fresh_start_class(a.row_key) = 'delete: not on either list'), 'none');

-- ═══════════════════════════════════════════════════════════════════════════
-- PUT ONE KEY BACK (e.g. a setting that should have stayed). Replace the key name,
-- remove the leading "-- " from the 4 lines, Run. Other computers pick it up on
-- their next sync.
-- ═══════════════════════════════════════════════════════════════════════════
-- insert into public.gc_kv
--   select (jsonb_populate_record(null::public.gc_kv, a.row_data)).* from public.gc_archive_fresh_start a
--   where a.source = 'gc_kv' and a.row_key = 'PUT-THE-KEY-HERE'
--     and a.label = (select label from public.gc_archive_fresh_start where label like 'fresh-start %' order by taken_at desc, id desc limit 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- UNDO — puts gc_kv back EXACTLY as it was before the fresh start (every record,
-- every delete-list, every setting). What was added since (your import) is first
-- copied to gc_archive_fresh_start as 'before-undo <time>', so the undo loses
-- nothing either. It writes a new gc_epoch (by: 'undo'), so every computer empties
-- itself again (keeping its own copy) and takes the restored data from the cloud.
-- To run it: select from "-- do $$" down to "-- end undo", remove the leading
-- "-- " from those lines, and Run only that.
-- ═══════════════════════════════════════════════════════════════════════════
-- do $$
-- declare
--   v_label text;   -- the fresh start to undo: the latest one, unless you put a label here
--   v_now   timestamptz := clock_timestamp();
--   v_epoch text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
--   v_n     bigint;
--   v_has_upd boolean;
-- begin
--   if v_label is null then
--     select label into v_label from public.gc_archive_fresh_start where label like 'fresh-start %' order by taken_at desc, id desc limit 1;
--   end if;
--   if v_label is null or not exists (select 1 from public.gc_archive_fresh_start where label = v_label and source = 'gc_kv') then
--     raise exception 'No fresh-start copy of gc_kv found (%). Nothing was changed.', v_label;
--   end if;
--   insert into public.gc_archive_fresh_start (label, taken_at, source, row_key, row_data)
--     select 'before-undo ' || v_epoch, v_now, 'gc_kv', x.key::text, to_jsonb(x) from public.gc_kv x;
--   insert into public.gc_backups (taken_at, source, row_count, snapshot, label, keep)
--     select v_now, 'before-undo/gc_kv', 1, to_jsonb(x), 'before-undo ' || v_epoch, true from public.gc_kv x;
--   delete from public.gc_kv;
--   insert into public.gc_kv
--     select (jsonb_populate_record(null::public.gc_kv, a.row_data)).* from public.gc_archive_fresh_start a
--     where a.label = v_label and a.source = 'gc_kv';
--   get diagnostics v_n = row_count;
--   select exists (select 1 from information_schema.columns
--                  where table_schema = 'public' and table_name = 'gc_kv' and column_name = 'updated_at') into v_has_upd;
--   if v_has_upd then
--     execute 'insert into public.gc_kv (key, value, updated_at) values ($1, $2, $3)
--              on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at'
--       using 'gc_epoch', jsonb_build_object('epoch', v_epoch, 'by', 'undo', 'restored', v_label), v_now;
--   else
--     execute 'insert into public.gc_kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value'
--       using 'gc_epoch', jsonb_build_object('epoch', v_epoch, 'by', 'undo', 'restored', v_label);
--   end if;
--   raise notice 'UNDO: % row(s) of gc_kv put back from %; what was there before is kept as before-undo %', v_n, v_label, v_epoch;
-- end $$;
-- end undo
