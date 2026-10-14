import { loadMapFeaturesInView } from "@/lib/data/map-features-service";
import { parseMapFeatureBbox } from "@/lib/data/geospatial-repository";
import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { appendCorsHeaders, preflightResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const limited = await enforceRateLimit(request, "geospatial-map-features", 90, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const url = new URL(request.url);
  const bbox = parseMapFeatureBbox(url.searchParams);
  if (!bbox) return appendCorsHeaders(badRequest("Expected a valid Singapore viewport bbox with minLat, minLng, maxLat, maxLng, and zoom."), request, corsOptions);
  const layer = url.searchParams.get("layer");
  if (layer && layer !== "designated") return appendCorsHeaders(badRequest("Unknown map layer."), request, corsOptions);

  const result = await loadMapFeaturesInView(bbox, layer === "designated" ? "designated" : "all");
  observeApiRequest("/api/geospatial/map-features", startedAt, { cacheHit: result.cacheHit, count: result.features.length, layer: layer ?? "all" });
  return appendCorsHeaders(jsonResponse({
    features: result.features,
    cache: { hit: result.cacheHit, key: result.cacheKey },
    sanitized: true,
    degraded: result.degraded,
  }), request, corsOptions);
}
