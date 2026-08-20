import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { oneMapClient, type OneMapClient } from "@/lib/onemap/onemap-client";
import type { OneMapReverseGeocodeResult } from "@/lib/onemap/onemap-types";
import { roundedCoordinate } from "@/lib/onemap/onemap-validation";
import { getCircuitBreaker } from "@/lib/reliability/circuit-breaker";

type ReverseInput = {
  lat: number;
  lng: number;
  buffer: number;
  addressType: "All" | "HDB";
};

type OneMapRawReverseResponse = {
  GeocodeInfo?: OneMapRawReverseResult[];
};

type OneMapRawReverseResult = {
  BUILDINGNAME?: string;
  BLOCK?: string;
  ROAD?: string;
  POSTALCODE?: string;
  ADDRESS?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

export class OneMapReverseGeocodeAdapter {
  constructor(private readonly client: OneMapClient = oneMapClient) {}

  async reverseGeocode(input: ReverseInput) {
    const cacheKey = getReverseGeocodeCacheKey(input);
    const cached = await cacheAdapter.get<OneMapReverseGeocodeResult>(cacheKey);
    if (cached) return { result: cached, cache: { hit: true, key: cacheKey } };

    const params = new URLSearchParams({
      location: `${input.lat},${input.lng}`,
      buffer: String(input.buffer),
      addressType: input.addressType,
    });
    const payload = await getCircuitBreaker("onemap-reverse-geocode", () =>
      this.client.getJson<OneMapRawReverseResponse>("/api/public/revgeocode", params)
    ).fire() as OneMapRawReverseResponse;
    const result = normalizeReverseGeocodeResponse(payload, input.lat, input.lng);
    await cacheAdapter.set(cacheKey, result, { ttlSeconds: 24 * 60 * 60 });
    return { result, cache: { hit: false, key: cacheKey } };
  }
}

export function getReverseGeocodeCacheKey(input: ReverseInput) {
  return `onemap:revgeo:v1:${roundedCoordinate(input)}:${input.buffer}:${input.addressType}`;
}

export function normalizeReverseGeocodeResponse(payload: OneMapRawReverseResponse, fallbackLat: number, fallbackLng: number): OneMapReverseGeocodeResult {
  const first = payload.GeocodeInfo?.[0];
  if (!first) return { status: "not_found", lat: fallbackLat, lng: fallbackLng, source: "onemap" };
  const building = text(first.BUILDINGNAME);
  const block = text(first.BLOCK);
  const roadName = text(first.ROAD);
  const postal = text(first.POSTALCODE);
  const address = text(first.ADDRESS) || [building, block, roadName, postal ? `Singapore ${postal}` : ""].filter(Boolean).join(", ");
  return {
    status: address ? "found" : "not_found",
    ...(address ? { address } : {}),
    ...(building ? { building } : {}),
    ...(block ? { block } : {}),
    ...(roadName ? { roadName } : {}),
    ...(postal ? { postal } : {}),
    lat: Number(first.LATITUDE) || fallbackLat,
    lng: Number(first.LONGITUDE) || fallbackLng,
    source: "onemap",
  };
}

function text(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed && trimmed !== "NIL" ? trimmed : "";
}

export const oneMapReverseGeocodeAdapter = new OneMapReverseGeocodeAdapter();
