import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { appendCorsHeaders, preflightResponse, requireJsonRequest } from "@/lib/security";
import { track } from "@vercel/analytics/server";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["POST", "DELETE", "OPTIONS"] };

type CommunitySubmitPayload = {
  designatedAreas: { lat: number; lng: number }[];
  prohibitedZones: { lat: number; lng: number }[][];
};

const MAX_POINTS_PER_KIND = 10;
const MAX_ZONE_VERTICES = 64;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) {
    await trackCommunityOutcome("invalid_content_type");
    return appendCorsHeaders(jsonError, request, corsOptions);
  }

  const limited = await enforceRateLimit(request, "community-submit", 5, 3600);
  if (limited) {
    await trackCommunityOutcome("rate_limited");
    return appendCorsHeaders(limited, request, corsOptions);
  }

  const body = await request.json().catch(() => undefined);
  const payload = parseCommunityPayload(body);
  if (!payload) {
    await trackCommunityOutcome("invalid_payload");
    return appendCorsHeaders(
      badRequest("Expected up to 10 smoking area points and up to 10 no-smoking area outlines inside Singapore prototype bounds."),
      request,
      corsOptions,
    );
  }

  if (!hasPostgisConfig()) {
    await trackCommunityOutcome("unavailable", payload);
    return appendCorsHeaders(
      jsonResponse({ error: "unavailable", message: "Community submissions are temporarily unavailable." }, { status: 503 }),
      request,
      corsOptions,
    );
  }

  const pool = getPostgisPool();
  const client = await pool.connect();
  let addedDesignated = 0;
  let addedProhibited = 0;
  try {
    await client.query("begin");
    for (const point of payload.designatedAreas) {
      await client.query(
        `insert into public.community_designated_areas (name, location, radius_m, verified)
         values ('Community smoking area', extensions.st_setsrid(extensions.st_makepoint($1, $2), 4326)::extensions.geography, 10, false)`,
        [point.lng, point.lat],
      );
      addedDesignated += 1;
    }
    for (const ring of payload.prohibitedZones) {
      const closedRing = ring.length > 0 && (ring[0].lat !== ring[ring.length - 1].lat || ring[0].lng !== ring[ring.length - 1].lng)
        ? [...ring, ring[0]]
        : ring;
      const geojson = JSON.stringify({ type: "Polygon", coordinates: [closedRing.map(({ lat, lng }) => [lng, lat])] });
      await client.query(
        `insert into public.community_prohibited_zones (name, geometry, verified)
         values ('Community no-smoking area', extensions.st_geomfromgeojson($1)::extensions.geography, false)`,
        [geojson],
      );
      addedProhibited += 1;
    }
    await client.query("commit");
  } catch {
    await client.query("rollback").catch(() => undefined);
    observeApiRequest("/api/community/areas", startedAt, { failed: true });
    await trackCommunityOutcome("failed", payload);
    return appendCorsHeaders(
      jsonResponse({ error: "submission_failed", message: "Could not store the community areas. Please try again." }, { status: 500 }),
      request,
      corsOptions,
    );
  } finally {
    client.release();
  }

  await cacheAdapter.invalidatePrefix("viewport:v1:");
  observeApiRequest("/api/community/areas", startedAt, { addedDesignated, addedProhibited });
  await trackCommunityOutcome("succeeded", payload);
  return appendCorsHeaders(jsonResponse({ added: { designatedAreas: addedDesignated, prohibitedZones: addedProhibited } }), request, corsOptions);
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);

  const limited = await enforceRateLimit(request, "community-remove", 5, 3600);
  if (limited) {
    await trackCommunityRemoval("rate_limited");
    return appendCorsHeaders(limited, request, corsOptions);
  }

  const payload = await request.json().catch(() => undefined) as { id?: string; kind?: "designated-area" | "prohibited-zone" } | undefined;
  if (!payload || !uuidPattern.test(payload.id ?? "") || (payload.kind !== "designated-area" && payload.kind !== "prohibited-zone")) {
    await trackCommunityRemoval("invalid_payload");
    return appendCorsHeaders(badRequest("Expected an unverified community area id and type."), request, corsOptions);
  }
  if (!hasPostgisConfig()) {
    await trackCommunityRemoval("unavailable");
    return appendCorsHeaders(jsonResponse({ error: "unavailable", message: "Community areas are temporarily unavailable." }, { status: 503 }), request, corsOptions);
  }

  const table = payload.kind === "designated-area" ? "community_designated_areas" : "community_prohibited_zones";
  try {
    const result = await getPostgisPool().query(`delete from public.${table} where id = $1 and verified = false`, [payload.id]);
    if (result.rowCount === 0) {
      await trackCommunityRemoval("not_found_or_verified", payload.kind);
      return appendCorsHeaders(jsonResponse({ error: "not_found", message: "This community area is unavailable for removal." }, { status: 404 }), request, corsOptions);
    }
  } catch {
    observeApiRequest("/api/community/areas", startedAt, { removalFailed: true });
    await trackCommunityRemoval("failed", payload.kind);
    return appendCorsHeaders(jsonResponse({ error: "removal_failed", message: "Could not remove the community area. Please try again." }, { status: 500 }), request, corsOptions);
  }

  await cacheAdapter.invalidatePrefix("viewport:v1:");
  observeApiRequest("/api/community/areas", startedAt, { removedCommunityArea: true, kind: payload.kind });
  await trackCommunityRemoval("succeeded", payload.kind);
  return appendCorsHeaders(jsonResponse({ deleted: true }), request, corsOptions);
}

async function trackCommunityOutcome(outcome: "failed" | "invalid_content_type" | "invalid_payload" | "rate_limited" | "succeeded" | "unavailable", payload?: CommunitySubmitPayload) {
  const designatedCount = payload?.designatedAreas.length ?? 0;
  const prohibitedCount = payload?.prohibitedZones.length ?? 0;
  const submissionKind = designatedCount > 0 && prohibitedCount > 0 ? "mixed" : designatedCount > 0 ? "smoking" : prohibitedCount > 0 ? "no-smoking" : "unknown";
  const totalCount = designatedCount + prohibitedCount;
  const itemCountBucket = totalCount === 0 ? "0" : totalCount === 1 ? "1" : totalCount <= 3 ? "2-3" : "4-plus";
  await track("community_submission_completed", { outcome, submission_kind: submissionKind, item_count_bucket: itemCountBucket }).catch(() => undefined);
}

async function trackCommunityRemoval(outcome: "failed" | "invalid_payload" | "not_found_or_verified" | "rate_limited" | "succeeded" | "unavailable", kind?: "designated-area" | "prohibited-zone") {
  await track("community_removal_completed", { outcome, area_kind: kind ?? "unknown" }).catch(() => undefined);
}

function parseCommunityPayload(body: unknown): CommunitySubmitPayload | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = body as { designatedAreas?: unknown; prohibitedZones?: unknown };
  if (!Array.isArray(raw.designatedAreas) || !Array.isArray(raw.prohibitedZones)) return undefined;
  if (raw.designatedAreas.length === 0 && raw.prohibitedZones.length === 0) return undefined;
  if (raw.designatedAreas.length > MAX_POINTS_PER_KIND || raw.prohibitedZones.length > MAX_POINTS_PER_KIND) return undefined;

  const designatedAreas: { lat: number; lng: number }[] = [];
  for (const entry of raw.designatedAreas) {
    const point = parseCoordinate(entry);
    if (!point) return undefined;
    designatedAreas.push(point);
  }

  const prohibitedZones: { lat: number; lng: number }[][] = [];
  for (const entry of raw.prohibitedZones) {
    if (!Array.isArray(entry) || entry.length < 3 || entry.length > MAX_ZONE_VERTICES) return undefined;
    const ring: { lat: number; lng: number }[] = [];
    for (const vertex of entry) {
      const point = parseCoordinate(vertex);
      if (!point) return undefined;
      ring.push(point);
    }
    if (new Set(ring.map((point) => `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`)).size < 3) return undefined;
    prohibitedZones.push(ring);
  }

  return { designatedAreas, prohibitedZones };
}

function parseCoordinate(value: unknown): { lat: number; lng: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const lat = Number((value as { lat?: unknown }).lat);
  const lng = Number((value as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < 1.1 || lat > 1.5 || lng < 103.5 || lng > 104.1) return undefined;
  return { lat, lng };
}
