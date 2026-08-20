create table if not exists public.community_designated_areas (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null default 'Community smoking area',
  location extensions.geography(Point, 4326) not null,
  radius_m double precision not null default 10 check (radius_m > 0 and radius_m <= 10),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_designated_areas_location_idx
  on public.community_designated_areas using gist (location);

create table if not exists public.community_prohibited_zones (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null default 'Community no-smoking area',
  geometry extensions.geography(Geometry, 4326) not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_prohibited_zones_geometry_idx
  on public.community_prohibited_zones using gist (geometry);

insert into public.source_metadata (id, name, agency, source_url, authority, is_official, notes)
values (
  'community-reports',
  'Community reports',
  'SmokeCheck SG community',
  'https://smokecheck-sg.vercel.app/',
  'prototype',
  false,
  'User-submitted smoking and no-smoking areas. Unverified until community or officer confirmation.'
)
on conflict (id) do update set
  is_official = false,
  notes = excluded.notes;

alter table public.community_designated_areas enable row level security;
alter table public.community_prohibited_zones enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_designated_areas' and policyname = 'deny_client_community_designated_areas') then
    create policy deny_client_community_designated_areas on public.community_designated_areas for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_prohibited_zones' and policyname = 'deny_client_community_prohibited_zones') then
    create policy deny_client_community_prohibited_zones on public.community_prohibited_zones for all to anon, authenticated using (false) with check (false);
  end if;
end $$;
