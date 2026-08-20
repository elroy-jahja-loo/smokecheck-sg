import { timingSafeEqual } from "node:crypto";

import { cacheAdapter, cacheProvider } from "@/lib/cache/cache-adapter";
import { getPostgisPool } from "@/lib/db/postgis";
import { jsonResponse } from "@/lib/http";
import { queueProvider } from "@/lib/queue/queue-adapter";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.SMOKECHECK_INTERNAL_SECRET ?? process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(authorization, `Bearer ${secret}`)) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const checks: Record<string, "ok" | "failed" | "misconfigured"> = {
    database: "failed",
    cache: "failed",
    queue: queueProvider === "qstash" ? "ok" : "misconfigured",
  };

  await Promise.all([
    getPostgisPool().query("select 1").then(() => { checks.database = "ok"; }).catch(() => undefined),
    cacheAdapter.set("readiness:v1", { ok: true }, { ttlSeconds: 10 })
      .then(() => cacheAdapter.get<{ ok: boolean }>("readiness:v1"))
      .then((value) => { checks.cache = value?.ok && cacheProvider === "upstash_redis" ? "ok" : "failed"; })
      .catch(() => undefined),
  ]);

  const ready = Object.values(checks).every((status) => status === "ok");
  return jsonResponse(
    { status: ready ? "ready" : "not_ready", timestamp: new Date().toISOString(), checks },
    { status: ready ? 200 : 503 },
  );
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
