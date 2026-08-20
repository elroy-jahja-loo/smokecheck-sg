import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { oneMapTokenService } from "@/lib/onemap/onemap-token-service";
import { logEvent } from "@/lib/observability/logging";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!cronSecret || !safeEqual(authorization, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const checkInId = Sentry.captureCheckIn({
    monitorSlug: "onemap-token-refresh",
    status: "in_progress",
  }, {
    schedule: { type: "crontab", value: "0 0 */2 * *" },
    checkinMargin: 60,
    maxRuntime: 10,
    timezone: "UTC",
  });

  try {
    const result = await oneMapTokenService.forceRefresh();

    if (!result) {
      logEvent("warn", "onemap.cron.refresh_failed", {});
      Sentry.captureMessage("OneMap token refresh cron failed", "error");
      Sentry.captureCheckIn({ monitorSlug: "onemap-token-refresh", checkInId, status: "error", duration: (Date.now() - startedAt) / 1000 });
      return NextResponse.json(
        { status: "failed", reason: "Could not refresh OneMap token. Check ONEMAP_EMAIL and ONEMAP_EMAIL_PASSWORD." },
        { status: 500 },
      );
    }

    logEvent("info", "onemap.cron.refresh_succeeded", {
      expiresAt: new Date(result.expiresAt).toISOString(),
    });
    Sentry.captureCheckIn({ monitorSlug: "onemap-token-refresh", checkInId, status: "ok", duration: (Date.now() - startedAt) / 1000 });

    return NextResponse.json({
      status: "ok",
      expiresAt: new Date(result.expiresAt).toISOString(),
      cachedInRedis: Boolean(process.env.REDIS_URL),
    });
  } catch (error) {
    Sentry.captureException(error);
    Sentry.captureCheckIn({ monitorSlug: "onemap-token-refresh", checkInId, status: "error", duration: (Date.now() - startedAt) / 1000 });
    logEvent("error", "onemap.cron.unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ status: "error", message: "Unexpected error during token refresh." }, { status: 500 });
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
