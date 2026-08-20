revoke all on table public.source_metadata from public, anon, authenticated;
revoke all on table public.dataset_versions from public, anon, authenticated;
revoke all on table public.designated_areas from public, anon, authenticated;
revoke all on table public.prohibited_zones from public, anon, authenticated;
revoke all on table public.sync_runs from public, anon, authenticated;

drop policy if exists source_metadata_deny_client_access on public.source_metadata;
create policy source_metadata_deny_client_access
  on public.source_metadata
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists dataset_versions_deny_client_access on public.dataset_versions;
create policy dataset_versions_deny_client_access
  on public.dataset_versions
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists designated_areas_deny_client_access on public.designated_areas;
create policy designated_areas_deny_client_access
  on public.designated_areas
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists prohibited_zones_deny_client_access on public.prohibited_zones;
create policy prohibited_zones_deny_client_access
  on public.prohibited_zones
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists sync_runs_deny_client_access on public.sync_runs;
create policy sync_runs_deny_client_access
  on public.sync_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke execute on function public.nearby_designated_areas(double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.prohibited_zones_containing_point(double precision, double precision) from public, anon, authenticated;
revoke execute on function public.map_features_in_view(double precision, double precision, double precision, double precision) from public, anon, authenticated;
