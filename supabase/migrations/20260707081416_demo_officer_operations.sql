create extension if not exists pgcrypto with schema extensions;

create table if not exists public.demo_officer_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'demo_officer',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.demo_officer_sessions (
  token_hash text primary key,
  officer_id uuid not null references public.demo_officer_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.demo_complaint_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  incident_type text not null,
  report_count integer not null default 1,
  priority_score integer not null default 50,
  peak_time text not null,
  nearest_address text not null,
  boundary_status text not null,
  reason text not null,
  simulated_source text not null default 'Synthetic demo complaint data, not official enforcement data',
  location extensions.geography(Point, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_complaint_reports_location_idx
  on public.demo_complaint_reports using gist (location);

create table if not exists public.demo_officer_reports (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  officer_id uuid references public.demo_officer_accounts(id) on delete set null,
  nearest_address text not null,
  boundary_status text not null,
  occurred_at text not null,
  incident_type text not null,
  observation_subject text,
  notes text not null default '',
  location extensions.geography(Point, 4326) not null,
  status text not null default 'draft_saved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demo_officer_reports
  add column if not exists observation_subject text;

alter table public.demo_officer_accounts enable row level security;
alter table public.demo_officer_sessions enable row level security;
alter table public.demo_complaint_reports enable row level security;
alter table public.demo_officer_reports enable row level security;

revoke all on public.demo_officer_accounts from anon, authenticated;
revoke all on public.demo_officer_sessions from anon, authenticated;
revoke all on public.demo_complaint_reports from anon, authenticated;
revoke all on public.demo_officer_reports from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_officer_accounts' and policyname = 'deny_client_demo_officer_accounts') then
    create policy deny_client_demo_officer_accounts on public.demo_officer_accounts for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_officer_sessions' and policyname = 'deny_client_demo_officer_sessions') then
    create policy deny_client_demo_officer_sessions on public.demo_officer_sessions for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_complaint_reports' and policyname = 'deny_client_demo_complaint_reports') then
    create policy deny_client_demo_complaint_reports on public.demo_complaint_reports for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_officer_reports' and policyname = 'deny_client_demo_officer_reports') then
    create policy deny_client_demo_officer_reports on public.demo_officer_reports for all to anon, authenticated using (false) with check (false);
  end if;
end $$;

create unique index if not exists demo_complaint_reports_seed_title_idx
  on public.demo_complaint_reports(title);

insert into public.demo_complaint_reports (title, incident_type, report_count, priority_score, peak_time, nearest_address, boundary_status, reason, location)
values
  ('Priority area: Orchard Road precinct', 'Smoking in prohibited area', 28, 82, '6pm-9pm', '313 Orchard Road, Singapore 238895', 'Outside known designated area', 'Repeated simulated reports near a public walkway and retail entrances.', extensions.st_setsrid(extensions.st_makepoint(103.83836, 1.30101), 4326)::extensions.geography),
  ('Civic district sheltered walkway', 'Smoking in prohibited area', 11, 63, '12pm-3pm', 'Near City Hall MRT, Singapore', 'Near covered walkway caution area', 'Simulated reports cluster near pedestrian shelter and civic amenities.', extensions.st_setsrid(extensions.st_makepoint(103.8521, 1.2931), 4326)::extensions.geography),
  ('Tanglin retail frontage', 'Littering near smoking area', 8, 58, '5pm-8pm', 'Tanglin Road precinct, Singapore', 'Near known designated-area cluster', 'Simulated littering reports near retail frontage; requires on-site verification.', extensions.st_setsrid(extensions.st_makepoint(103.8247, 1.3051), 4326)::extensions.geography)
on conflict (title) do nothing;
