-- GrayCo money door — run once in Supabase → SQL editor.
-- Queue for money records arriving through /.netlify/functions/money-intake
-- (QuickBooks webhooks and any company with a MONEY_KEY_<NAME>). The CRM
-- collects and deletes rows; nothing here is ever read by the public site.
create table if not exists public.gc_pending_money (
  id          bigserial primary key,
  fingerprint text not null unique,
  source      text not null,
  type        text not null,
  record      jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.gc_pending_money enable row level security;
-- no policies: only the service-role key (used by the Netlify function) can read or write.
