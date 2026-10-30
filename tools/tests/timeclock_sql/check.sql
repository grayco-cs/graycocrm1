-- behaviour of docs/timeclock-access.sql: who reads / writes which gc_timeclock_ key (run as the API role with a JWT e-mail)
insert into public.gc_staff (email, role, active, payroll) values ('carl.crew@grayco-cs.com', 'staff', true, false) on conflict do nothing;
insert into public.gc_kv (key, value) values
 ('gc_timeclock_carl_crew_grayco_cs_com', '[{"id":"c1"}]'::jsonb), ('gc_timeclock_sbiffle_grayco_cs_com', '[{"id":"s1"}]'::jsonb), ('projects', '[]'::jsonb)
on conflict (key) do update set value = excluded.value;
create or replace function pg_temp.as_user(e text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('role','authenticated','email',e)::text, false); end $$;
drop table if exists pg_temp.res; create temp table res (who text, what text, got text);
grant all on pg_temp.res to authenticated;
do $$
declare e text; n int; ok text;
begin
  foreach e in array array['carl.crew@grayco-cs.com','sbiffle@grayco-cs.com','office@grayco-cs.com','wjohnson@grayco-cs.com'] loop
    perform pg_temp.as_user(e);
    set local role authenticated;
    select count(*) into n from public.gc_kv where key like 'gc\_timeclock\_%'; insert into res values (e, 'reads timeclock keys (of 2)', n::text);
    select count(*) into n from public.gc_kv where key = 'projects'; insert into res values (e, 'reads projects', n::text);
    begin update public.gc_kv set value = '[{"id":"c2"}]'::jsonb where key = 'gc_timeclock_carl_crew_grayco_cs_com'; get diagnostics n = row_count; ok := 'updated ' || n; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes carl''s key', ok);
    begin insert into public.gc_kv (key, value) values ('gc_timeclock_' || regexp_replace(e, '[^a-z0-9]', '_', 'g'), '[]'::jsonb) on conflict (key) do update set value = excluded.value; ok := 'ok'; exception when others then ok := 'refused'; end;
    insert into res values (e, 'upserts own key', ok);
    begin insert into public.gc_kv (key, value) values ('gc_timeclock_nobody_grayco_cs_com', '[]'::jsonb); ok := 'ok'; exception when others then ok := 'refused'; end;
    insert into res values (e, 'adds someone else''s key', ok);
    begin update public.gc_kv set value = '[]'::jsonb where key = 'projects'; get diagnostics n = row_count; ok := 'updated ' || n; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes projects', ok);
    reset role;
    delete from public.gc_kv where key = 'gc_timeclock_nobody_grayco_cs_com';
  end loop;
end $$;
select * from res order by what, who;
