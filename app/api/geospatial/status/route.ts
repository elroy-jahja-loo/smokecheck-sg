import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { geospatialStatusAdapter } from "@/lib/geospatial/status-adapter";
import { observeApiRequest } from "@/lib/observability/logging";
import { appendCorsHeaders, preflightResponse, requireJsonRequest } from "@/lib/security";
import { parseCoordinatePayload } from "@/lib/validation";
import { getCircuitBreaker, isCircuitOpen } from "@/lib/reliability/circuit-breaker";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["POST", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);

  const limited = await enforceRateLimit(request, "geospatial-status", 120, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const payload = parseCoordinatePayload(await request.json().catch(() => undefined));
  if (!payload) return appendCorsHeaders(badRequest("Expected latitude and longitude inside Singapore prototype bounds."), request, corsOptions);

  if (isCircuitOpen("geospatial-status")) {
    return appendCorsHeaders(jsonResponse({
      error: "service_degraded",
      message: "Geospatial status service is temporarily degraded. Please retry or check physical signs and NEA guidance.",
    }, { status: 503 }), request, corsOptions);
  }

  const result = await getCircuitBreaker("geospatial-status", () =>
    geospatialStatusAdapter.getStatus(payload)
  ).fire() as Awaited<ReturnType<typeof geospatialStatusAdapter.getStatus>>;
  observeApiRequest("/api/geospatial/status", startedAt, { status: result.status, sourceIds: result.sourceIds });

  const publicResult = {
    ...result,
    matchedProhibitedZone: result.matchedProhibitedZone
      ? {
        id: result.matchedProhibitedZone.id,
        name: result.matchedProhibitedZone.name,
        ruleSummary: result.matchedProhibitedZone.ruleSummary,
        sourceId: result.matchedProhibitedZone.sourceId,
        freshnessLabel: result.matchedProhibitedZone.freshnessLabel,
        isPrototype: result.matchedProhibitedZone.isPrototype,
      }
      : undefined,
  };

  return appendCorsHeaders(jsonResponse({
    result: publicResult,
    privacy: {
      precisePublicLocationStored: false,
      note: "The prototype computes status from request payload and does not persist public precise location by default.",
    },
  }), request, corsOptions);
}
