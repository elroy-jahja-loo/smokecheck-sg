create table if not exists public.queue_dead_letters (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  idempotency_key text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  source text not null,
  provider text not null,
  provider_message_id text,
  provider_dlq_id text,
  failure_reason text not null,
  retryable boolean not null default true,
  status text not null default 'open' check (status in ('open', 'retried', 'resolved')),
  created_at timestamptz not null default now(),
  retried_at timestamptz,
  resolved_at timestamptz
);

create unique index if not exists queue_dead_letters_provider_dlq_idx
  on public.queue_dead_letters(provider, provider_dlq_id)
  where provider_dlq_id is not null;

create index if not exists queue_dead_letters_created_at_idx
  on public.queue_dead_letters(created_at desc);

create index if not exists queue_dead_letters_status_idx
  on public.queue_dead_letters(status, retryable);

alter table public.queue_dead_letters enable row level security;
revoke all on public.queue_dead_letters from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'queue_dead_letters'
      and policyname = 'deny_client_queue_dead_letters'
  ) then
    create policy deny_client_queue_dead_letters
      on public.queue_dead_letters
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
