import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

import { getDataGovDatasetConfigs } from "@/lib/datagov/config";
import { DataGovSyncService } from "@/lib/datagov/sync-service";
import { enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { verifyQStashRequest } from "@/lib/queue/qstash-signature";
import { appendCorsHeaders, preflightResponse } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const corsOptions = { methods: ["GET", "POST", "OPTIONS"], authenticated: true };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const authError = await requireSyncAuth(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const limited = await enforceRateLimit(request, "internal-sync", 10, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const checkInId = Sentry.captureCheckIn({
    monitorSlug: "datagov-daily-sync",
    status: "in_progress",
  }, {
    schedule: { type: "crontab", value: "0 2 * * *" },
    checkinMargin: 60,
    maxRuntime: 30,
    timezone: "UTC",
  });
  let summaries: Awaited<ReturnType<DataGovSyncService["syncAll"]>>;
  try {
    summaries = await new DataGovSyncService().syncAll(getDataGovDatasetConfigs());
  } catch (error) {
    Sentry.captureException(error);
    Sentry.captureCheckIn({ monitorSlug: "datagov-daily-sync", checkInId, status: "error", duration: (Date.now() - startedAt) / 1000 });
    return appendCorsHeaders(jsonResponse({ error: "sync_failed" }, { status: 503 }), request, corsOptions);
  }
  observeApiRequest("/api/internal/sync/datagov", startedAt, {
    statuses: summaries.map((summary) => summary.status),
  });

  const failed = summaries.some((summary) => summary.status === "failed");
  if (failed) {
    Sentry.captureMessage("Data.gov.sg cron sync partially or fully failed", { level: "error", extra: { summaries } });
    Sentry.captureCheckIn({ monitorSlug: "datagov-daily-sync", checkInId, status: "error", duration: (Date.now() - startedAt) / 1000 });
  } else {
    Sentry.captureCheckIn({ monitorSlug: "datagov-daily-sync", checkInId, status: "ok", duration: (Date.now() - startedAt) / 1000 });
  }
  return appendCorsHeaders(jsonResponse({ summaries }, { status: failed ? 503 : 200 }), request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const authError = await requireSyncAuth(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);

  const limited = await enforceRateLimit(request, "internal-sync", 10, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const service = new DataGovSyncService();
  const summaries = await service.syncAll(getDataGovDatasetConfigs());
  observeApiRequest("/api/internal/sync/datagov", startedAt, {
    statuses: summaries.map((summary) => summary.status),
  });

  const failed = summaries.some((summary) => summary.status === "failed");
  if (failed) Sentry.captureMessage("Data.gov.sg sync partially or fully failed", { level: "error", extra: { summaries } });
  return appendCorsHeaders(jsonResponse({ summaries }, { status: failed ? 503 : 200 }), request, corsOptions);
}

async function requireSyncAuth(request: Request) {
  const localSecret = process.env.DATAGOV_SYNC_INTERNAL_SECRET;
  const headerSecret = request.headers.get("x-smokecheck-internal-secret");
  if (localSecret && headerSecret && safeEqual(localSecret, headerSecret)) return undefined;

  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization") ?? "";
  if (cronSecret && safeEqual(bearer, `Bearer ${cronSecret}`)) return undefined;
  if (localSecret && safeEqual(bearer, `Bearer ${localSecret}`)) return undefined;

  if (request.method === "POST") {
    const body = await request.clone().text();
    if (await verifyQStashRequest(request, body)) return undefined;
  }

  return jsonResponse(
    {
      error: "unauthorized",
      message: "Data.gov.sg sync requires an internal bearer/header secret or a valid QStash signature.",
    },
    { status: 401 },
  );
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
