create table if not exists public.queue_event_receipts (
  delivery_key text primary key,
  event_name text not null,
  provider_message_id text,
  status text not null check (status in ('processing', 'completed')),
  lease_owner text not null,
  lease_until timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists queue_event_receipts_status_lease_idx
  on public.queue_event_receipts(status, lease_until);

alter table public.queue_event_receipts enable row level security;
revoke all on public.queue_event_receipts from public, anon, authenticated;

create policy deny_client_queue_event_receipts
  on public.queue_event_receipts
  for all
  to anon, authenticated
  using (false)
  with check (false);
