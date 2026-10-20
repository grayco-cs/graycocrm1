-- ═══════════════════════════════════════════════════════════════════════════
-- GrayCo RoofScout: remove the made-up DEMO leads from the shared list (one time).
-- Safe to run again: a second run finds nothing and reports 0 everywhere.
-- Supabase → SQL Editor → New query → paste ALL of this text → Run.
--
-- In the early test phase the "Run scan (demo)" button saved made-up sites into the
-- shared table rs_leads. Only rows that are clearly made up are removed:
--   • the lead is flagged demo (data.demo = true), or
--   • its name starts with "DEMO ", or
--   • its owner e-mail is @example.com (reserved, never a real address), or
--   • its owner phone is in the fictional 555-0100 … 555-0199 range.
-- Real leads, settings, staff and the CRM's own tables are not touched.
-- The result table at the bottom shows what was found and removed. The SQL Editor runs the
-- whole script as one transaction: if any step fails, nothing is removed.
-- ═══════════════════════════════════════════════════════════════════════════
drop table if exists pg_temp.rs_demo_ids;
drop table if exists pg_temp.rs_demo_report;

create temporary table rs_demo_ids as
select id,
       coalesce(data ->> 'name', '') as name
from public.rs_leads
where coalesce(data ->> 'demo', '') = 'true'
   or coalesce(data ->> 'name', '') ilike 'DEMO %'
   or lower(coalesce(data #>> '{owner,email}', '')) like '%@example.com'
   or coalesce(data #>> '{owner,phone}', '') ~ '555[-. ]?01[0-9]{2}([^0-9]|$)';

create temporary table rs_demo_report (step text, rows_count bigint);

insert into rs_demo_report
select '1. demo leads found', count(*) from rs_demo_ids;

with d as (delete from public.rs_activity a using rs_demo_ids x where a.lead_id = x.id returning 1)
insert into rs_demo_report select '2. activity rows removed (for those leads)', count(*) from d;

-- Owner-lookup records for those leads (the table exists once roofscout-setup.sql has run).
do $$
declare n bigint := 0;
begin
  if to_regclass('public.rs_skiptrace') is not null then
    execute 'with d as (delete from public.rs_skiptrace s using rs_demo_ids x where s.lead_id = x.id returning 1) select count(*) from d' into n;
  end if;
  insert into rs_demo_report values ('3. owner-lookup records removed', n);
end $$;

with d as (delete from public.rs_leads l using rs_demo_ids x where l.id = x.id returning 1)
insert into rs_demo_report select '4. demo leads removed', count(*) from d;

insert into rs_demo_report
select '5. demo leads left (must be 0)', count(*)
from public.rs_leads
where coalesce(data ->> 'demo', '') = 'true'
   or coalesce(data ->> 'name', '') ilike 'DEMO %'
   or lower(coalesce(data #>> '{owner,email}', '')) like '%@example.com'
   or coalesce(data #>> '{owner,phone}', '') ~ '555[-. ]?01[0-9]{2}([^0-9]|$)';

insert into rs_demo_report
select '6. real leads kept', count(*) from public.rs_leads;

-- Last statement, so the SQL Editor shows this table.
select step, rows_count from rs_demo_report order by step;
