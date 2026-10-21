-- GrayCo News: the unsubscribe list (patch AP2, 21 Oct 2026). Run once in Supabase → SQL editor.
--
-- Every customer with an e-mail is on GrayCo News (opt-out). This table holds the people who clicked
-- "Unsubscribe from our newsletters" (or the one-click button in their mail program). Every news /
-- marketing send skips them (netlify/functions/_lib/news.js); invoices, portal links, signed papers and
-- receipts still go to them.
--
-- SERVER ONLY: row-level security is on with NO policy, and nothing is granted to anon or authenticated,
-- so the CRM page and the public cannot read or change it. Only the Netlify functions (service_role key)
-- can: news-unsubscribe.js (the link) and portal.js (the CRM's "News: subscribed / unsubscribed" line and
-- an admin's re-subscribe).

create table if not exists public.gc_news_suppress (
  email            text primary key check (email = lower(email) and position('@' in email) > 1),
  unsubscribed     boolean     not null default true,
  unsubscribed_at  timestamptz,
  resubscribed_at  timestamptz,
  resubscribed_by  text,
  source           text,
  updated_at       timestamptz not null default now()
);

create or replace function public.gc_news_suppress_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists gc_news_suppress_touch on public.gc_news_suppress;
create trigger gc_news_suppress_touch before insert or update on public.gc_news_suppress
  for each row execute function public.gc_news_suppress_touch();

alter table public.gc_news_suppress enable row level security;
alter table public.gc_news_suppress force row level security;
revoke all on table public.gc_news_suppress from public;
revoke all on table public.gc_news_suppress from anon;
revoke all on table public.gc_news_suppress from authenticated;
grant select, insert, update, delete on table public.gc_news_suppress to service_role;
revoke all on function public.gc_news_suppress_touch() from public, anon, authenticated;

-- check: as anon / authenticated this must fail or return nothing; as service_role it works.
--   select count(*) from public.gc_news_suppress;
