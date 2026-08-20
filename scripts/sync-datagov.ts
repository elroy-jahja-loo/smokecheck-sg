import { loadEnvConfig } from "@next/env";

import { getDataGovDatasetConfigs } from "@/lib/datagov/config";
import { DataGovSyncService } from "@/lib/datagov/sync-service";

loadEnvConfig(process.cwd());

async function main() {
  const selectedKey = process.argv[2];
  const configs = getDataGovDatasetConfigs();
  const selectedConfigs = selectedKey ? configs.filter((config) => config.key === selectedKey) : configs;
  if (selectedKey && selectedConfigs.length === 0) {
    throw new Error(`Unknown Data.gov.sg dataset key: ${selectedKey}`);
  }

  const service = new DataGovSyncService();
  const summaries = await service.syncAll(selectedConfigs);
  console.log(JSON.stringify({ summaries }, null, 2));

  if (summaries.some((summary) => summary.status === "failed")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
