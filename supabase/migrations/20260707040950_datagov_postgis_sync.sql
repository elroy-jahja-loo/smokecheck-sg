create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.source_metadata (
  id text primary key,
  name text not null,
  agency text not null,
  source_url text not null,
  authority text not null check (authority in ('official-agency', 'legislation', 'open-data', 'prototype')),
  is_official boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dataset_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id text not null references public.source_metadata(id),
  dataset_id text not null,
  dataset_name text not null,
  retrieved_at timestamptz not null default now(),
  source_last_updated text,
  checksum text not null,
  feature_count integer not null check (feature_count >= 0),
  storage_path text not null,
  metadata_storage_path text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_id, checksum)
);

create unique index if not exists dataset_versions_one_active_per_source_idx
  on public.dataset_versions (source_id)
  where is_active;

create index if not exists dataset_versions_source_active_idx
  on public.dataset_versions (source_id, is_active, retrieved_at desc);

create table if not exists public.designated_areas (
  id text primary key,
  dataset_version_id uuid not null references public.dataset_versions(id) on delete cascade,
  object_id text,
  building_name text,
  description text,
  photo_url text,
  source_updated_at text,
  location extensions.geography(Point, 4326) not null,
  raw_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists designated_areas_dataset_version_idx
  on public.designated_areas (dataset_version_id);

create index if not exists designated_areas_location_idx
  on public.designated_areas using gist (location);

create table if not exists public.prohibited_zones (
  id text primary key,
  dataset_version_id uuid not null references public.dataset_versions(id) on delete cascade,
  object_id text,
  name text,
  zone_type text not null check (zone_type in ('nea_no_smoking_zone', 'nparks_no_smoking_location')),
  source_updated_at text,
  geometry extensions.geography(Geometry, 4326) not null,
  raw_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prohibited_zones_dataset_version_idx
  on public.prohibited_zones (dataset_version_id);

create index if not exists prohibited_zones_zone_type_idx
  on public.prohibited_zones (zone_type);

create index if not exists prohibited_zones_geometry_idx
  on public.prohibited_zones using gist (geometry);

create table if not exists public.sync_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id text not null references public.source_metadata(id),
  dataset_id text not null,
  status text not null check (status in ('started', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text,
  feature_count integer,
  checksum text,
  storage_path text,
  metadata_storage_path text,
  dataset_version_id uuid references public.dataset_versions(id)
);

create index if not exists sync_runs_source_started_idx
  on public.sync_runs (source_id, started_at desc);

create or replace function public.nearby_designated_areas(
  lat double precision,
  lng double precision,
  radius_m double precision default 500
)
returns table (
  id text,
  building_name text,
  description text,
  photo_url text,
  source_updated_at text,
  dataset_version_id uuid,
  source_id text,
  distance_m double precision,
  lat double precision,
  lng double precision
)
language sql
stable
as $$
  with point as (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as geog
  )
  select
    da.id,
    da.building_name,
    da.description,
    da.photo_url,
    da.source_updated_at,
    da.dataset_version_id,
    dv.source_id,
    extensions.st_distance(da.location, point.geog) as distance_m,
    extensions.st_y(da.location::extensions.geometry) as lat,
    extensions.st_x(da.location::extensions.geometry) as lng
  from public.designated_areas da
  join public.dataset_versions dv on dv.id = da.dataset_version_id and dv.is_active
  cross join point
  where extensions.st_dwithin(da.location, point.geog, radius_m)
  order by da.location <-> point.geog;
$$;

create or replace function public.prohibited_zones_containing_point(
  lat double precision,
  lng double precision
)
returns table (
  id text,
  name text,
  zone_type text,
  source_updated_at text,
  dataset_version_id uuid,
  source_id text,
  geometry_geojson jsonb
)
language sql
stable
as $$
  with point as (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as geog
  )
  select
    pz.id,
    pz.name,
    pz.zone_type,
    pz.source_updated_at,
    pz.dataset_version_id,
    dv.source_id,
    extensions.st_asgeojson(pz.geometry::extensions.geometry)::jsonb as geometry_geojson
  from public.prohibited_zones pz
  join public.dataset_versions dv on dv.id = pz.dataset_version_id and dv.is_active
  cross join point
  where extensions.st_intersects(pz.geometry, point.geog);
$$;

create or replace function public.map_features_in_view(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
returns table (
  feature_kind text,
  id text,
  name text,
  zone_type text,
  source_id text,
  geometry_geojson jsonb
)
language sql
stable
as $$
  with bbox as (
    select extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography as geog
  )
  select
    'designated_area'::text as feature_kind,
    da.id,
    coalesce(da.building_name, da.description, 'Designated smoking area') as name,
    null::text as zone_type,
    dv.source_id,
    extensions.st_asgeojson(da.location::extensions.geometry)::jsonb as geometry_geojson
  from public.designated_areas da
  join public.dataset_versions dv on dv.id = da.dataset_version_id and dv.is_active
  cross join bbox
  where extensions.st_intersects(da.location, bbox.geog)
  union all
  select
    'prohibited_zone'::text,
    pz.id,
    pz.name,
    pz.zone_type,
    dv.source_id,
    extensions.st_asgeojson(pz.geometry::extensions.geometry)::jsonb
  from public.prohibited_zones pz
  join public.dataset_versions dv on dv.id = pz.dataset_version_id and dv.is_active
  cross join bbox
  where extensions.st_intersects(pz.geometry, bbox.geog);
$$;
