create extension if not exists vector with schema extensions;

create table if not exists public.rag_document_chunks (
  chunk_id text primary key,
  source_id text not null references public.source_metadata(id),
  source_url text not null,
  source_version text,
  retrieved_at timestamptz not null,
  authority text not null check (authority in ('official-agency', 'legislation', 'open-data', 'prototype')),
  checksum text not null,
  content text not null,
  embedding extensions.vector(256) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rag_document_chunks_embedding_idx
  on public.rag_document_chunks using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 32);

create table if not exists public.audit_log_chain (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  payload_hash text not null,
  previous_hash text,
  chain_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_chain_created_at_idx on public.audit_log_chain(created_at desc);

create table if not exists public.retention_jobs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null unique,
  target_table text not null,
  retention_days integer not null check (retention_days > 0),
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  status text not null default 'scheduled'
);

create unique index if not exists retention_jobs_job_name_idx
  on public.retention_jobs(job_name);

insert into public.retention_jobs (job_name, target_table, retention_days)
values
  ('expire_officer_sessions', 'officer_sessions', 1),
  ('expire_demo_reports', 'demo_officer_reports', 365),
  ('expire_audit_logs', 'audit_log_chain', 2555),
  ('expire_rag_chunks', 'rag_document_chunks', 730),
  ('expire_source_snapshots', 'dataset_versions', 2555)
on conflict (job_name) do update set
  target_table = excluded.target_table,
  retention_days = excluded.retention_days;

alter table public.rag_document_chunks enable row level security;
alter table public.audit_log_chain enable row level security;
alter table public.retention_jobs enable row level security;

revoke all on public.rag_document_chunks from public, anon, authenticated;
revoke all on public.audit_log_chain from public, anon, authenticated;
revoke all on public.retention_jobs from public, anon, authenticated;
