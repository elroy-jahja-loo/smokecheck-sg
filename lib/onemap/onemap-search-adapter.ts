import { createHash } from "node:crypto";

import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { oneMapClient, type OneMapClient } from "@/lib/onemap/onemap-client";
import type { OneMapSearchCandidate } from "@/lib/onemap/onemap-types";
import { isSingaporeCoordinate } from "@/lib/onemap/onemap-validation";
import { getCircuitBreaker } from "@/lib/reliability/circuit-breaker";

type OneMapRawSearchResponse = {
  found?: number;
  totalNumPages?: number;
  results?: OneMapRawSearchResult[];
};

type OneMapRawSearchResult = {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

export class OneMapSearchAdapter {
  constructor(private readonly client: OneMapClient = oneMapClient) {}

  async search(query: string) {
    const normalizedQuery = normalizeSearchQuery(query);
    const cacheKey = getSearchCacheKey(normalizedQuery);
    const cached = await cacheAdapter.get<OneMapSearchCandidate[]>(cacheKey);
    if (cached) return { candidates: cached, cache: { hit: true, key: cacheKey } };

    const params = new URLSearchParams({
      searchVal: normalizedQuery,
      returnGeom: "Y",
      getAddrDetails: "Y",
      pageNum: "1",
    });
    const payload = await getCircuitBreaker("onemap-search", () =>
      this.client.getJson<OneMapRawSearchResponse>("/api/common/elastic/search", params)
    ).fire() as OneMapRawSearchResponse;
    const candidates = normalizeOneMapSearchResponse(payload);
    await cacheAdapter.set(cacheKey, candidates, { ttlSeconds: 6 * 60 * 60 });
    return { candidates, cache: { hit: false, key: cacheKey } };
  }
}

export function normalizeSearchQuery(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Search query is required.");
  if (normalized.length > 120) throw new Error("Search query is too long.");
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Search query contains unsupported characters.");
  return normalized;
}

function getSearchCacheKey(normalizedQuery: string) {
  return `onemap:search:v1:${hashKey(normalizedQuery.toLowerCase())}`;
}

export function normalizeOneMapSearchResponse(payload: OneMapRawSearchResponse): OneMapSearchCandidate[] {
  return (payload.results ?? [])
    .map((result, index) => {
      const lat = Number(result.LATITUDE);
      const lng = Number(result.LONGITUDE);
      if (!isSingaporeCoordinate({ lat, lng })) return undefined;
      const label = text(result.SEARCHVAL) || text(result.BUILDING) || text(result.ADDRESS) || "OneMap result";
      const address = text(result.ADDRESS) || [result.BLK_NO, result.ROAD_NAME, result.POSTAL].map(text).filter(Boolean).join(" ") || label;
      return {
        id: `onemap-${hashKey(`${label}:${lat}:${lng}:${index}`)}`,
        label,
        address,
        ...(text(result.POSTAL) ? { postal: text(result.POSTAL) } : {}),
        ...(text(result.BUILDING) ? { building: text(result.BUILDING) } : {}),
        ...(text(result.ROAD_NAME) ? { roadName: text(result.ROAD_NAME) } : {}),
        lat,
        lng,
        source: "onemap" as const,
      };
    })
    .filter((candidate): candidate is OneMapSearchCandidate => Boolean(candidate));
}

function text(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed && trimmed !== "NIL" ? trimmed : "";
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export const oneMapSearchAdapter = new OneMapSearchAdapter();
