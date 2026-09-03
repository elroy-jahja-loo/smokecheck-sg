const requiredVars = [
  "NEXT_PUBLIC_APP_URL",
] as const;

const recommendedVars = [
  "REDIS_URL",
  "REDIS_TOKEN",
  "POSTGIS_DATABASE_URL",
  "POSTGIS_SSL_CA",
  "QSTASH_TOKEN",
  "QSTASH_URL",
  "TURNSTILE_SECRET_KEY",
  "RESEND_API_KEY",
] as const;

const productionVars = [
  "SMOKECHECK_ALLOWED_ORIGINS",
  "USE_POSTGIS_DATA",
  "POSTGIS_DATABASE_URL",
  "POSTGIS_SSL_CA",
  "POSTGIS_POOL_SIZE",
  "REDIS_URL",
  "REDIS_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "QSTASH_PUBLISH_DESTINATION_URL",
  "CRON_SECRET",
  "WORKER_INTERNAL_SECRET",
  "ONEMAP_EMAIL",
  "ONEMAP_EMAIL_PASSWORD",
  "SMOKECHECK_OBJECT_STORAGE_MODE",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "BOT_PROTECTION_MODE",
  "BOT_PROTECTION_ALLOWED_HOSTNAMES",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "RESEND_API_KEY",
] as const;

type EnvCheckResult = {
  valid: boolean;
  missing: string[];
  warnings: string[];
};

let cachedEnvCheck: EnvCheckResult | undefined;

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): EnvCheckResult {
  if (env === process.env && cachedEnvCheck) return cachedEnvCheck;

  const missing: string[] = [];
  const warnings: string[] = [];

  for (const name of requiredVars) {
    if (!env[name]) missing.push(name);
  }

  for (const name of recommendedVars) {
    if (!env[name]) warnings.push(`Optional ${name} is not set - some features will degrade`);
  }

  if (env.REDIS_URL && !env.REDIS_TOKEN) {
    warnings.push("REDIS_URL is set but REDIS_TOKEN is missing - Redis features will fall back to in-memory");
  }

  if (env.QSTASH_URL && !env.QSTASH_TOKEN) {
    warnings.push("QSTASH_URL is set but QSTASH_TOKEN is missing - queue features will fall back to in-memory");
  }

  if (!env.SMOKECHECK_INTERNAL_SECRET && !env.DATAGOV_SYNC_INTERNAL_SECRET) {
    warnings.push("No internal secret configured - cron endpoints may be accessible without authentication");
  }

  if (env.VERCEL_ENV === "production") {
    for (const name of productionVars) {
      if (!env[name]) missing.push(name);
    }
    if (env.USE_POSTGIS_DATA !== "true") missing.push("USE_POSTGIS_DATA=true");
    if (env.SMOKECHECK_OBJECT_STORAGE_MODE !== "remote") missing.push("SMOKECHECK_OBJECT_STORAGE_MODE=remote");
    if (env.BOT_PROTECTION_MODE !== "turnstile") missing.push("BOT_PROTECTION_MODE=turnstile");
  }

  const result: EnvCheckResult = {
    valid: missing.length === 0,
    missing,
    warnings,
  };

  if (env === process.env) cachedEnvCheck = result;

  if (env === process.env && missing.length > 0) {
    console.error(`[env] Missing required variables: ${missing.join(", ")}`);
    // Fail-closed only for the sync route's critical dependency; other features degrade gracefully
  }

  if (env === process.env && warnings.length > 0) {
    console.warn(`[env] Warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  }

  return result;
}
