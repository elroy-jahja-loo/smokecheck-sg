alter table public.queue_event_receipts
  add column if not exists lease_owner text;

update public.queue_event_receipts
set lease_owner = gen_random_uuid()::text
where lease_owner is null;

alter table public.queue_event_receipts
  alter column lease_owner set not null;
