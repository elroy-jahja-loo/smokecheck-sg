import assert from "node:assert/strict";
import test from "node:test";

import { validateEnvironment } from "@/lib/env";

const productionEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://smokecheck.example",
  SMOKECHECK_ALLOWED_ORIGINS: "https://smokecheck.example",
  USE_POSTGIS_DATA: "true",
  POSTGIS_DATABASE_URL: "postgres://example.invalid/database",
  POSTGIS_SSL_CA: "test-ca",
  POSTGIS_POOL_SIZE: "1",
  REDIS_URL: "https://redis.example",
  REDIS_TOKEN: "test-token",
  QSTASH_TOKEN: "test-token",
  QSTASH_CURRENT_SIGNING_KEY: "test-key",
  QSTASH_NEXT_SIGNING_KEY: "test-key",
  QSTASH_PUBLISH_DESTINATION_URL: "https://smokecheck.example/api/worker/jobs",
  CRON_SECRET: "test-secret",
  WORKER_INTERNAL_SECRET: "test-secret",
  ONEMAP_EMAIL: "service@example.test",
  ONEMAP_EMAIL_PASSWORD: "test-password",
  SMOKECHECK_OBJECT_STORAGE_MODE: "remote",
  OBJECT_STORAGE_ENDPOINT: "https://storage.example",
  OBJECT_STORAGE_REGION: "test-region",
  OBJECT_STORAGE_BUCKET: "smokecheck",
  OBJECT_STORAGE_ACCESS_KEY_ID: "test-access-key",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
  BOT_PROTECTION_MODE: "turnstile",
  BOT_PROTECTION_ALLOWED_HOSTNAMES: "smokecheck.example",
  TURNSTILE_SECRET_KEY: "test-secret",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-site-key",
  SENTRY_DSN: "https://public@example.invalid/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://public@example.invalid/1",
};

test("production environment requires every release dependency", () => {
  assert.equal(validateEnvironment(productionEnvironment).valid, true);

  const incomplete = { ...productionEnvironment, REDIS_TOKEN: "", BOT_PROTECTION_MODE: "off" };
  const result = validateEnvironment(incomplete);
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("REDIS_TOKEN"));
  assert.ok(result.missing.includes("BOT_PROTECTION_MODE=turnstile"));
});

test("non-production environments retain local fallback support", () => {
  const result = validateEnvironment({ NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
  assert.equal(result.valid, true);
});
