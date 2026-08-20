import { createSourceRepository } from "@/lib/data/source-repository";
import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import { featureFlags } from "@/lib/feature-flags";
import { getObservabilityMode, isOtelExporterConfigured } from "@/lib/observability/provider";
import type { SourceMetadata } from "@/lib/types";
import { getVectorTileRuntimeStatus } from "@/lib/vector-tiles/manifest";

export type SyncStatusRecord = {
  sourceId: string;
  status: "success" | "failed" | "started" | "seed_fallback";
  lastSuccessfulSyncAt?: string;
  lastRunAt?: string;
  datasetVersion?: string;
  featureCount?: number;
  checksum?: string;
  stale: boolean;
  source?: SourceMetadata;
};

const staleAfterDays = 45;

export async function getDataSyncStatus(): Promise<SyncStatusRecord[]> {
  const sources = await createSourceRepository().listSources();
  const byId = new Map(sources.map((source) => [source.id, source]));
  if (!hasPostgisConfig()) {
    return sources.map((source) => ({
      sourceId: source.id,
      status: "seed_fallback",
      lastSuccessfulSyncAt: source.retrievedAt,
      datasetVersion: source.versionLabel,
      stale: isStale(source.retrievedAt),
      source,
    }));
  }

  const { rows } = await getPostgisPool().query<{
    source_id: string;
    last_run_at: Date | null;
    last_successful_sync_at: Date | null;
    status: "success" | "failed" | "started" | null;
    dataset_name: string | null;
    feature_count: number | null;
    checksum: string | null;
  }>(
    `with latest_run as (
       select distinct on (source_id) source_id, started_at, status
       from public.sync_runs
       order by source_id, started_at desc
     ), latest_success as (
       select distinct on (source_id) source_id, finished_at, feature_count, checksum
       from public.sync_runs
       where status = 'success'
       order by source_id, finished_at desc nulls last
     ), active_versions as (
       select source_id, dataset_name, feature_count, checksum, retrieved_at
       from public.dataset_versions
       where is_active
     )
     select sm.id as source_id,
            lr.started_at as last_run_at,
            coalesce(ls.finished_at, av.retrieved_at) as last_successful_sync_at,
            lr.status,
            av.dataset_name,
            coalesce(av.feature_count, ls.feature_count) as feature_count,
            coalesce(av.checksum, ls.checksum) as checksum
     from public.source_metadata sm
     left join latest_run lr on lr.source_id = sm.id
     left join latest_success ls on ls.source_id = sm.id
     left join active_versions av on av.source_id = sm.id
     order by sm.id`,
  );

  return rows.map((row) => {
    const lastSuccessfulSyncAt = row.last_successful_sync_at?.toISOString();
    return {
      sourceId: row.source_id,
      status: row.status ?? "started",
      lastRunAt: row.last_run_at?.toISOString(),
      lastSuccessfulSyncAt,
      datasetVersion: row.dataset_name ?? undefined,
      featureCount: row.feature_count ?? undefined,
      checksum: row.checksum ?? undefined,
      stale: isStale(lastSuccessfulSyncAt),
      source: byId.get(row.source_id),
    };
  });
}

export async function getOperationalMetrics() {
  const sync = await getDataSyncStatus().catch(() => []);
  const vectorTiles = await getVectorTileRuntimeStatus().catch(() => ({ status: "not_configured" as const }));
  return {
    syncFreshness: {
      staleSources: sync.filter((entry) => entry.stale).length,
      totalSources: sync.length,
    },
    security: {
      csrfForOfficerMutations: true,
      nricCollectionEnabled: false,
      prototypeQueryBypassEnabled: false,
    },
    releaseReadiness: {
      featureFlags,
      postgisConfigured: hasPostgisConfig(),
      redisConfigured: Boolean(process.env.REDIS_URL && process.env.REDIS_TOKEN),
      queueConfigured: Boolean(process.env.QSTASH_TOKEN),
      objectStorageConfigured: hasRemoteObjectStorageConfig(),
      observabilityConfigured: Boolean(process.env.SENTRY_DSN || process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
      observabilityMode: getObservabilityMode(),
      otelExporterConfigured: isOtelExporterConfigured(),
      vectorTiles,
    },
  };
}

function hasRemoteObjectStorageConfig() {
  return Boolean(
    process.env.OBJECT_STORAGE_ENDPOINT
      && process.env.OBJECT_STORAGE_REGION
      && process.env.OBJECT_STORAGE_BUCKET
      && process.env.OBJECT_STORAGE_ACCESS_KEY_ID
      && process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  );
}

function isStale(value: string | undefined) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > staleAfterDays * 24 * 60 * 60 * 1000;
}
