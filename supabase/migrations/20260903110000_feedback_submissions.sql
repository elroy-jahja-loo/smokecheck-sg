create table if not exists public.feedback_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null unique,
  feedback text not null check (char_length(feedback) between 1 and 2000),
  rating smallint not null check (rating between 1 and 5),
  rating_comment text not null default '' check (char_length(rating_comment) <= 2000),
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feedback_submissions_created_at_idx
  on public.feedback_submissions (created_at desc);

alter table public.feedback_submissions enable row level security;
revoke all on public.feedback_submissions from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedback_submissions' and policyname = 'deny_client_feedback_submissions') then
    create policy deny_client_feedback_submissions on public.feedback_submissions for all to anon, authenticated using (false) with check (false);
  end if;
end $$;
