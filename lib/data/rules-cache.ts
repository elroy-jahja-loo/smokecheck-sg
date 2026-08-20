import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { haversineMeters } from "@/lib/geospatial/haversine";
import { logEvent } from "@/lib/observability/logging";
import type { DesignatedArea, LocationResult, SourceMetadata } from "@/lib/types";

export type CachedRulesPayload = {
  version: 1;
  cachedAt: string;
  ruleSummaries: string[];
  designatedAreas: DesignatedArea[];
  sourceMetadata: SourceMetadata[];
  disclaimer: string;
  freshnessLabel: string;
};

const CACHE_KEY = "smokecheck:cached-rules";

export async function getCachedRules(): Promise<CachedRulesPayload | undefined> {
  try {
    const cached = await cacheAdapter.get<CachedRulesPayload>(CACHE_KEY);
    if (cached && cached.version === 1 && Array.isArray(cached.designatedAreas)) {
      return cached;
    }
  } catch {
    logEvent("warn", "rules.cache.read_failed");
  }
  return undefined;
}

export function buildLocationResultFromCache(
  lat: number,
  lng: number,
  selectedAddress: string,
  cached: CachedRulesPayload,
): LocationResult {
  const sorted = [...cached.designatedAreas].sort((a, b) => {
    return haversineMeters(lat, lng, a.lat, a.lng) - haversineMeters(lat, lng, b.lat, b.lng);
  });

  const nearest = sorted[0];
  const distanceM = nearest ? Math.round(haversineMeters(lat, lng, nearest.lat, nearest.lng)) : undefined;

  return {
    status: nearest && distanceM && distanceM < 500 ? "designated-nearby" : "uncertain",
    selectedAddress,
    lat,
    lng,
    nearestDesignatedArea: nearest,
    distanceM,
    sourceIds: cached.sourceMetadata.map((s) => s.id),
    freshnessLabel: `${cached.freshnessLabel} (offline cached)`,
    disclaimer: `${cached.disclaimer} Offline: showing cached rules data.`,
    sources: cached.sourceMetadata.slice(0, 5),
  };
}

export function getNearestDesignatedAreas(
  lat: number,
  lng: number,
  areas: DesignatedArea[],
  limit = 5,
): Array<DesignatedArea & { distanceM: number }> {
  return areas
    .map((area) => ({ ...area, distanceM: Math.round(haversineMeters(lat, lng, area.lat, area.lng)) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}
