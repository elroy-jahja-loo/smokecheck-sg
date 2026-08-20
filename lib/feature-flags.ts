export const featureFlags = {
  dataSourceMode: enumFlag("SMOKECHECK_DATA_SOURCE_MODE", ["seed", "postgis"], process.env.USE_POSTGIS_DATA === "true" ? "postgis" : "seed"),
  officerAuthMode: enumFlag("SMOKECHECK_OFFICER_AUTH_MODE", ["mockpass", "oidc"], "mockpass"),
  cacheMode: enumFlag("SMOKECHECK_CACHE_MODE", ["memory", "redis"], process.env.REDIS_URL ? "redis" : "memory"),
  queueMode: enumFlag("SMOKECHECK_QUEUE_MODE", ["memory", "qstash", "kafka-compatible"], process.env.QSTASH_TOKEN ? "qstash" : "memory"),
  objectStorageMode: enumFlag("SMOKECHECK_OBJECT_STORAGE_MODE", ["local", "remote"], hasRemoteObjectStorageConfig() ? "remote" : "local"),
  ragMode: enumFlag("SMOKECHECK_RAG_MODE", ["memory-vector", "pgvector"], process.env.ENABLE_PGVECTOR_RAG === "true" ? "pgvector" : "memory-vector"),
  vectorTileMode: enumFlag("SMOKECHECK_VECTOR_TILE_MODE", ["viewport", "generated"], process.env.VECTOR_TILE_BASE_URL ? "generated" : "viewport"),
} as const;

function enumFlag<TValue extends string>(name: string, allowed: readonly TValue[], fallback: TValue): TValue {
  const value = process.env[name] as TValue | undefined;
  return value && allowed.includes(value) ? value : fallback;
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
