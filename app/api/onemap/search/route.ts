import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { normalizeSearchQuery, oneMapSearchAdapter } from "@/lib/onemap/onemap-search-adapter";
import { OneMapSafeError } from "@/lib/onemap/onemap-types";
import { appendCorsHeaders, preflightResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const limited = await enforceRateLimit(request, "onemap-search", 45, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  try {
    const url = new URL(request.url);
    const query = normalizeSearchQuery(url.searchParams.get("q") ?? "");
    const result = await oneMapSearchAdapter.search(query);
    observeApiRequest("/api/onemap/search", startedAt, { cacheHit: result.cache.hit, queryLength: query.length, count: result.candidates.length });
    return appendCorsHeaders(jsonResponse({ ...result, source: "onemap", guidanceSource: "Data.gov.sg/PostGIS determines smoking guidance, not OneMap." }), request, corsOptions);
  } catch (error) {
    observeApiRequest("/api/onemap/search", startedAt, { error: error instanceof OneMapSafeError ? error.code : "validation" });
    if (error instanceof OneMapSafeError) return appendCorsHeaders(jsonResponse({ error: error.code, message: error.message }, { status: error.status }), request, corsOptions);
    return appendCorsHeaders(badRequest(error instanceof Error ? error.message : "Invalid OneMap search request."), request, corsOptions);
  }
}
