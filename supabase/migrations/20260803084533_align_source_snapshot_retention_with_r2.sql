-- R2 expires every datagov/ object after 15 days. Keep only inactive database
-- version records for the same period; the active version remains for map continuity.
update public.retention_jobs
set retention_days = 15
where job_name = 'expire_source_snapshots';

create or replace function public.run_smokecheck_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('smokecheck-retention-v1'));

  delete from public.officer_sessions
  where expires_at < pg_catalog.now() - interval '1 day';

  delete from public.demo_officer_sessions
  where expires_at < pg_catalog.now() - interval '1 day';

  delete from public.demo_officer_reports
  where created_at < pg_catalog.now() - interval '365 days';

  delete from public.rag_document_chunks
  where created_at < pg_catalog.now() - interval '730 days';

  delete from public.audit_log_chain
  where created_at < pg_catalog.now() - interval '2555 days';

  delete from public.queue_event_receipts
  where status = 'completed'
    and completed_at < pg_catalog.now() - interval '30 days';

  delete from public.queue_dead_letters
  where status in ('retried', 'resolved')
    and created_at < pg_catalog.now() - interval '90 days';

  delete from public.sync_runs
  where finished_at < pg_catalog.now() - interval '365 days';

  delete from public.dataset_versions
  where not is_active
    and created_at < pg_catalog.now() - interval '15 days';

  update public.retention_jobs
  set last_run_at = pg_catalog.now(),
      next_run_at = pg_catalog.now() + interval '1 day',
      status = 'scheduled';
end;
$$;

revoke all on function public.run_smokecheck_retention() from public, anon, authenticated;
