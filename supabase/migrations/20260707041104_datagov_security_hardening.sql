alter function public.nearby_designated_areas(double precision, double precision, double precision)
  set search_path = public, extensions;

alter function public.prohibited_zones_containing_point(double precision, double precision)
  set search_path = public, extensions;

alter function public.map_features_in_view(double precision, double precision, double precision, double precision)
  set search_path = public, extensions;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

create index if not exists sync_runs_dataset_version_idx
  on public.sync_runs (dataset_version_id);
