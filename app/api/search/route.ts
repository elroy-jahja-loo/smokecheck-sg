import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { searchAdapter } from "@/lib/search/search-adapter";
import { appendCorsHeaders, preflightResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const limited = await enforceRateLimit(request, "search", 60, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length > 120) return appendCorsHeaders(badRequest("Search query is too long."), request, corsOptions);

  const cacheKey = `search:v1:${normalizeQuery(query)}`;
  const cached = await cacheAdapter.get<Awaited<ReturnType<typeof searchAdapter.search>>>(cacheKey);
  if (cached) {
    observeApiRequest("/api/search", startedAt, { cacheHit: true, queryLength: query.length });
    return appendCorsHeaders(jsonResponse({ ...cached, cache: { hit: true, key: cacheKey } }), request, corsOptions);
  }

  const result = await searchAdapter.search(query);
  await cacheAdapter.set(cacheKey, result, { ttlSeconds: 6 * 60 * 60 });
  observeApiRequest("/api/search", startedAt, { cacheHit: false, queryLength: query.length });

  return appendCorsHeaders(jsonResponse({ ...result, cache: { hit: false, key: cacheKey } }), request, corsOptions);
}

function normalizeQuery(value: string) {
  return encodeURIComponent(value.toLowerCase().replace(/\s+/g, " ").trim() || "all");
}
