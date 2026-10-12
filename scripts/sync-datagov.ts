import { loadEnvConfig } from "@next/env";
import * as Sentry from "@sentry/nextjs";

import { getDataGovDatasetConfigs } from "@/lib/datagov/config";
import { DataGovSyncService } from "@/lib/datagov/sync-service";
import { requireScheduledSyncEnvironment, runScheduledDataGovSync } from "@/lib/datagov/scheduled-sync";

loadEnvConfig(process.cwd());

async function main() {
  const selectedKey = process.argv[2];
  const configs = getDataGovDatasetConfigs();
  const selectedConfigs = selectedKey ? configs.filter((config) => config.key === selectedKey) : configs;
  if (selectedKey && selectedConfigs.length === 0) {
    throw new Error(`Unknown Data.gov.sg dataset key: ${selectedKey}`);
  }
  requireScheduledSyncEnvironment(process.env, selectedKey);

  const service = new DataGovSyncService();
  const summaries = !selectedKey && process.env.SENTRY_DSN
    ? await runScheduledDataGovSync(selectedConfigs, (items) => service.syncAll(items), Sentry.captureCheckIn)
    : await service.syncAll(selectedConfigs);
  console.log(JSON.stringify({ summaries }, null, 2));

  if (summaries.some((summary) => summary.status === "failed")) {
    process.exitCode = 1;
  }
}

if (process.env.SENTRY_DSN) Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
});

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  Sentry.captureException(error);
  process.exitCode = 1;
}).finally(async () => {
  if (process.env.SENTRY_DSN) await Sentry.flush(5_000);
});
