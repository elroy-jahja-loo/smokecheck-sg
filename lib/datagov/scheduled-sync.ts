import type { DataGovDatasetConfig, DatasetSyncSummary } from "./types";

type CheckIn = { monitorSlug: string; status: "in_progress" }
  | { monitorSlug: string; checkInId: string; status: "ok" | "error"; duration: number };

type MonitorConfig = {
  schedule: { type: "crontab"; value: string };
  checkinMargin: number;
  maxRuntime: number;
  timezone: string;
};

export function requireScheduledSyncEnvironment(env: Record<string, string | undefined>, selectedKey?: string) {
  if (env.VERCEL_ENV === "production" && !selectedKey && !env.SENTRY_DSN) {
    throw new Error("SENTRY_DSN is required for the production Data.gov.sg scheduled sync");
  }
}

export async function runScheduledDataGovSync(
  configs: DataGovDatasetConfig[],
  sync: (configs: DataGovDatasetConfig[]) => Promise<DatasetSyncSummary[]>,
  captureCheckIn: (checkIn: CheckIn, config?: MonitorConfig) => string,
  now: () => number = Date.now,
) {
  const monitorSlug = "datagov-daily-sync";
  const startedAt = now();
  const checkInId = captureCheckIn({ monitorSlug, status: "in_progress" }, {
    schedule: { type: "crontab", value: "0 2 * * *" },
    checkinMargin: 60,
    maxRuntime: 45,
    timezone: "UTC",
  });
  const finish = (status: "ok" | "error") => captureCheckIn({
    monitorSlug, checkInId, status, duration: Math.max(0, (now() - startedAt) / 1000),
  });

  try {
    const summaries = await sync(configs);
    finish(summaries.some((summary) => summary.status === "failed") ? "error" : "ok");
    return summaries;
  } catch (error) {
    finish("error");
    throw error;
  }
}
