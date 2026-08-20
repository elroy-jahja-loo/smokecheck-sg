import { timingSafeEqual } from "node:crypto";

import { logEvent, observeMetric } from "@/lib/observability/logging";
import { jsonResponse } from "@/lib/http";
import { queueAdapter, queueProvider } from "@/lib/queue/queue-adapter";
import { getDataGovDatasetConfigs } from "@/lib/datagov/config";
import { DataGovSyncService } from "@/lib/datagov/sync-service";
import { ragService } from "@/lib/rag/rag-service";
import { getVectorTileRuntimeStatus } from "@/lib/vector-tiles/manifest";

export const dynamic = "force-dynamic";
const WORKER_SECRET_HEADER = "x-worker-secret";

function verifyWorkerAuth(request: Request): boolean {
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const provided = request.headers.get(WORKER_SECRET_HEADER) ?? "";
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

type WorkerJob = {
  job: "datagov-sync" | "rag-ingestion" | "tile-generation" | "health-check" | "evaluate-alerts";
  payload?: Record<string, unknown>;
};

export async function POST(request: Request) {
  if (!verifyWorkerAuth(request)) {
    return jsonResponse({ error: "unauthorized", message: "Worker authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => undefined) as WorkerJob | undefined;
  if (!body?.job) {
    return jsonResponse({ error: "bad_request", message: "Worker job type required." }, { status: 400 });
  }

  const startedAt = Date.now();
  let result: Record<string, unknown>;

  try {
    switch (body.job) {
      case "datagov-sync":
        result = await runDataGovSync();
        break;
      case "rag-ingestion":
        result = await runRagIngestion();
        break;
      case "tile-generation":
        result = await runTileGenerationCheck();
        break;
      case "health-check":
        result = { ok: true, provider: queueProvider, timestamp: new Date().toISOString() };
        break;
      case "evaluate-alerts":
        result = await runAlertEvaluation();
        break;
      default:
        return jsonResponse({ error: "unknown_job", message: `Unknown worker job: ${body.job}` }, { status: 400 });
    }

    observeMetric("worker.job.completed", 1, { job: body.job });
    logEvent("info", "worker.job.completed", { job: body.job, durationMs: Date.now() - startedAt });

    return jsonResponse({ ok: true, job: body.job, durationMs: Date.now() - startedAt, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    logEvent("error", "worker.job.failed", { job: body.job, message });
    observeMetric("worker.job.failed", 1, { job: body.job });

    return jsonResponse({
      ok: false,
      job: body.job,
      error: message,
      durationMs: Date.now() - startedAt,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!verifyWorkerAuth(request)) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const deadLetters = await queueAdapter.listDeadLetters();
  return jsonResponse({
    status: "ok",
    timestamp: new Date().toISOString(),
    provider: queueProvider,
    pendingDeadLetters: deadLetters.filter((d) => d.retryable).length,
  });
}

async function runDataGovSync() {
  const service = new DataGovSyncService();
  const configs = getDataGovDatasetConfigs();
  const summaries = await service.syncAll(configs);
  const failed = summaries.filter((s) => s.status === "failed").length;
  return { datasets: summaries.length, synced: summaries.length - failed, failed };
}

async function runRagIngestion() {
  await ragService.query({ question: "What are the smoking rules in Singapore?" });
  return { status: "ingestion_verified" };
}

async function runTileGenerationCheck() {
  const status = await getVectorTileRuntimeStatus();
  return { status: status.status, manifestPresent: Boolean(status.manifest) };
}

async function runAlertEvaluation() {
  const { evaluateAlerts } = await import("@/lib/reliability/alerting");
  const { listMetrics } = await import("@/lib/observability/logging");
  const metrics = listMetrics();
  const fired = evaluateAlerts(metrics.map((m) => ({ name: m.name, value: m.value, tags: m.tags })));
  return { evaluated: metrics.length, alertsFired: fired.length, alerts: fired.map((a) => a.ruleId) };
}
