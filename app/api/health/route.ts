import { jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";

export const dynamic = "force-dynamic";

export function GET() {
  const startedAt = Date.now();
  observeApiRequest("/api/health", startedAt, { healthy: true });
  return jsonResponse(
    { status: "ok", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
