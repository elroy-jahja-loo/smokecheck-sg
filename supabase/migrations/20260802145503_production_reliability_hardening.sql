alter table public.designated_areas drop constraint if exists designated_areas_pkey;
alter table public.designated_areas add primary key (dataset_version_id, id);

alter table public.prohibited_zones drop constraint if exists prohibited_zones_pkey;
alter table public.prohibited_zones add primary key (dataset_version_id, id);

create index if not exists demo_officer_reports_officer_id_idx
  on public.demo_officer_reports(officer_id);
create index if not exists demo_officer_sessions_officer_id_idx
  on public.demo_officer_sessions(officer_id);

alter table public.source_metadata enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.designated_areas enable row level security;
alter table public.prohibited_zones enable row level security;
alter table public.sync_runs enable row level security;

revoke all on public.source_metadata from public, anon, authenticated;
revoke all on public.dataset_versions from public, anon, authenticated;
revoke all on public.designated_areas from public, anon, authenticated;
revoke all on public.prohibited_zones from public, anon, authenticated;
revoke all on public.sync_runs from public, anon, authenticated;
