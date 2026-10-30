-- behaviour: who reads / writes what (run as the API roles with a JWT e-mail)
insert into public.gc_kv (key, value) values
 ('users', '[{"id":"U7","name":"Brittany","email":"office@grayco-cs.com","role":"Office Admin","active":true},{"id":"U5","name":"Steven","email":"sbiffle@grayco-cs.com","role":"Project Manager","active":true}]'::jsonb),
 ('gc_cash_anchor', '{"cash":1}'::jsonb), ('gc_commission_structures', '[1]'::jsonb), ('users_private', '{"U5":{"split":40}}'::jsonb),
 ('candidates', '[1]'::jsonb), ('gc_team_settings', '{}'::jsonb), ('gc_overhead_manual', '[]'::jsonb), ('projects', '[]'::jsonb)
on conflict (key) do update set value = excluded.value;
insert into public.gc_admin_kv (key, value) values ('gc_accounts_ledger', '[1]'::jsonb), ('sam_api_key', '"secret"'::jsonb) on conflict (key) do nothing;
create or replace function pg_temp.as_user(e text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('role','authenticated','email',e)::text, false); end $$;
drop table if exists pg_temp.res; create temp table res (who text, what text, got text);
grant all on pg_temp.res to authenticated;
do $$
declare e text; n int; v jsonb; ok text;
begin
  foreach e in array array['office@grayco-cs.com','sbiffle@grayco-cs.com','wjohnson@grayco-cs.com'] loop
    perform pg_temp.as_user(e);
    set local role authenticated;
    select public.gc_my_access() into v; insert into res values (e, 'gc_my_access.office', v ->> 'office');
    select count(*) into n from public.gc_kv where key in ('gc_cash_anchor','gc_commission_structures','users_private'); insert into res values (e, 'reads cash/commission/private (of 3)', n::text);
    select count(*) into n from public.gc_kv where key in ('candidates'); insert into res values (e, 'reads candidates', n::text);
    select count(*) into n from public.gc_admin_kv; insert into res values (e, 'gc_admin_kv rows seen (of 2)', n::text);
    begin update public.gc_kv set value = '[2]'::jsonb where key = 'gc_overhead_manual'; get diagnostics n = row_count; ok := 'updated ' || n; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes gc_overhead_manual', ok);
    begin update public.gc_kv set value = '{"x":1}'::jsonb where key = 'gc_team_settings'; get diagnostics n = row_count; ok := 'updated ' || n; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes gc_team_settings', ok);
    begin update public.gc_kv set value = '{}'::jsonb where key = 'users_private'; get diagnostics n = row_count; ok := 'updated ' || n; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes users_private', ok);
    begin insert into public.gc_admin_kv (key, value) values ('gc_cash_anchor', '{"cash":2}'::jsonb) on conflict (key) do update set value = excluded.value; ok := 'ok'; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes gc_admin_kv cash', ok);
    begin insert into public.gc_admin_kv (key, value) values ('sam_api_key', '"x"'::jsonb) on conflict (key) do update set value = excluded.value; ok := 'ok'; exception when others then ok := 'refused'; end;
    insert into res values (e, 'writes gc_admin_kv sam key', ok);
    reset role;
  end loop;
end $$;
select * from res order by what, who;
