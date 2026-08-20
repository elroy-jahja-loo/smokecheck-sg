create table if not exists public.officers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text unique,
  role text not null default 'officer',
  agency text not null default 'SmokeCheck demo operations',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.officer_credentials (
  officer_id uuid primary key references public.officers(id) on delete cascade,
  username text not null unique,
  password_hash text not null,
  password_updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.officer_sessions (
  token_hash text primary key,
  officer_id uuid not null references public.officers(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists officer_sessions_officer_idx on public.officer_sessions(officer_id);
create index if not exists officer_sessions_expires_idx on public.officer_sessions(expires_at);

alter table public.demo_officer_reports
  add column if not exists production_officer_id uuid references public.officers(id) on delete set null;

create index if not exists demo_officer_reports_production_officer_idx
  on public.demo_officer_reports(production_officer_id);

alter table public.officers enable row level security;
alter table public.officer_credentials enable row level security;
alter table public.officer_sessions enable row level security;

revoke all on public.officers from anon, authenticated;
revoke all on public.officer_credentials from anon, authenticated;
revoke all on public.officer_sessions from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'officers' and policyname = 'deny_client_officers') then
    create policy deny_client_officers on public.officers for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'officer_credentials' and policyname = 'deny_client_officer_credentials') then
    create policy deny_client_officer_credentials on public.officer_credentials for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'officer_sessions' and policyname = 'deny_client_officer_sessions') then
    create policy deny_client_officer_sessions on public.officer_sessions for all to anon, authenticated using (false) with check (false);
  end if;
end $$;
