import assert from "node:assert/strict";
import { test } from "node:test";

import { requireScheduledSyncEnvironment, runScheduledDataGovSync } from "./scheduled-sync";
import type { DataGovDatasetConfig, DatasetSyncSummary } from "./types";

const config: DataGovDatasetConfig = {
  key: "dsa", sourceId: "datagov-dsa", datasetId: "fixture", datasetName: "DSA", agency: "NEA", sourceUrl: "https://data.gov.sg/",
};

test("a production scheduled run fails visibly rather than silently skipping monitoring", () => {
  assert.throws(() => requireScheduledSyncEnvironment({ VERCEL_ENV: "production" }), /SENTRY_DSN/);
  assert.doesNotThrow(() => requireScheduledSyncEnvironment({ VERCEL_ENV: "production", SENTRY_DSN: "https://fixture.example/1" }));
  assert.doesNotThrow(() => requireScheduledSyncEnvironment({ VERCEL_ENV: "development" }));
});

test("a scheduled sync closes its Sentry check-in after successful publication", async () => {
  const checkIns: unknown[] = [];
  const summary = { key: "dsa", sourceId: config.sourceId, datasetId: config.datasetId, status: "success" } as DatasetSyncSummary;
  const result = await runScheduledDataGovSync([config], async (configs) => {
    assert.deepEqual(configs, [config]);
    return [summary];
  }, (checkIn, options) => {
    checkIns.push({ checkIn, options });
    return "start-id";
  }, () => 1000);

  assert.deepEqual(result, [summary]);
  assert.deepEqual(checkIns, [
    { checkIn: { monitorSlug: "datagov-daily-sync", status: "in_progress" }, options: {
      schedule: { type: "crontab", value: "0 2 * * *" }, checkinMargin: 60, maxRuntime: 45, timezone: "UTC",
    } },
    { checkIn: { monitorSlug: "datagov-daily-sync", checkInId: "start-id", status: "ok", duration: 0 }, options: undefined },
  ]);
});

test("partial failures and thrown errors both close the check-in as errors", async () => {
  for (const throwError of [false, true]) {
    const statuses: string[] = [];
    const run = runScheduledDataGovSync([config], async () => {
      if (throwError) throw new Error("connection lost");
      return [{ key: "dsa", sourceId: config.sourceId, datasetId: config.datasetId, status: "failed", message: "upstream failed" }] as DatasetSyncSummary[];
    }, (checkIn) => { statuses.push(checkIn.status); return "start-id"; }, () => 1000);
    if (throwError) await assert.rejects(run, /connection lost/);
    else assert.equal((await run)[0]?.status, "failed");
    assert.deepEqual(statuses, ["in_progress", "error"]);
  }
});
