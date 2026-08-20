import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { oneMapReverseGeocodeAdapter } from "@/lib/onemap/onemap-reverse-geocode-adapter";
import { OneMapSafeError } from "@/lib/onemap/onemap-types";
import { parseReverseGeocodeInput } from "@/lib/onemap/onemap-validation";
import { appendCorsHeaders, preflightResponse, requireJsonRequest } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["POST", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);

  const limited = await enforceRateLimit(request, "onemap-reverse-geocode", 60, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  try {
    const input = parseReverseGeocodeInput(await request.json().catch(() => undefined));
    const result = await oneMapReverseGeocodeAdapter.reverseGeocode(input);
    observeApiRequest("/api/onemap/reverse-geocode", startedAt, { cacheHit: result.cache.hit, status: result.result.status });
    return appendCorsHeaders(jsonResponse({ ...result, privacy: { cacheKeyUsesRoundedCoordinates: true, precisePublicLocationStored: false } }), request, corsOptions);
  } catch (error) {
    observeApiRequest("/api/onemap/reverse-geocode", startedAt, { error: error instanceof OneMapSafeError ? error.code : "validation" });
    if (error instanceof OneMapSafeError) return appendCorsHeaders(jsonResponse({ error: error.code, message: error.message }, { status: error.status }), request, corsOptions);
    return appendCorsHeaders(badRequest(error instanceof Error ? error.message : "Invalid reverse geocode request."), request, corsOptions);
  }
}
