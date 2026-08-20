import { Pool } from "pg";

let pool: Pool | undefined;

export function hasPostgisConfig() {
  return process.env.USE_POSTGIS_DATA === "true" && Boolean(process.env.POSTGIS_DATABASE_URL);
}

export function getPostgisPool() {
  const connectionString = process.env.POSTGIS_DATABASE_URL;
  if (!connectionString) throw new Error("POSTGIS_DATABASE_URL is required for PostGIS data access");
  const isSupabase = connectionString.includes("supabase.co") || connectionString.includes("supabase.com");
  const sslCa = process.env.POSTGIS_SSL_CA?.replace(/\\n/g, "\n");

  pool ??= new Pool({
    connectionString,
    max: Number(process.env.POSTGIS_POOL_SIZE ?? 1),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    application_name: `smokecheck-sg-${process.env.VERCEL_ENV ?? "local"}`,
    ssl: isSupabase ? { rejectUnauthorized: false, ...(sslCa ? { ca: sslCa, rejectUnauthorized: true } : {}) } : undefined,
  });

  return pool;
}
