create index if not exists rag_document_chunks_source_id_idx
  on public.rag_document_chunks(source_id);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rag_document_chunks' and policyname = 'deny_client_rag_document_chunks') then
    create policy deny_client_rag_document_chunks on public.rag_document_chunks for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log_chain' and policyname = 'deny_client_audit_log_chain') then
    create policy deny_client_audit_log_chain on public.audit_log_chain for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'retention_jobs' and policyname = 'deny_client_retention_jobs') then
    create policy deny_client_retention_jobs on public.retention_jobs for all to anon, authenticated using (false) with check (false);
  end if;
end $$;
