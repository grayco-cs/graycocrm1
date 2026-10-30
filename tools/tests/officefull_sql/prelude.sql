-- a minimal Supabase stand-in for tools/tests/test_OFFICEFULL_sql.sh (a scratch Postgres only)
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'role', 'anon') $$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
create table public.gc_kv (key text primary key, value jsonb, updated_at timestamptz default now());
grant select, insert, update, delete on public.gc_kv to anon, authenticated, service_role;
alter table public.gc_kv enable row level security;
create policy gc_staff_all on public.gc_kv for all to authenticated using (true) with check (true);
create table public.app_data (key text primary key, value jsonb, updated_at timestamptz default now());
