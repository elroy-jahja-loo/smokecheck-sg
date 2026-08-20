import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { haversineMeters } from "@/lib/geospatial/haversine";
import { oneMapClient, type OneMapClient } from "@/lib/onemap/onemap-client";
import type { OneMapRouteInstruction, OneMapWalkingRoute, SingaporeCoordinate } from "@/lib/onemap/onemap-types";
import { isSingaporeCoordinate, roundedCoordinate } from "@/lib/onemap/onemap-validation";
import { getCircuitBreaker } from "@/lib/reliability/circuit-breaker";

type WalkingRouteInput = {
  start: SingaporeCoordinate;
  end: SingaporeCoordinate;
  routeType: "walk";
};

type OneMapRawRouteResponse = {
  status_message?: string;
  route_summary?: {
    total_time?: number;
    total_distance?: number;
  };
  route_geometry?: string;
  route_instructions?: unknown[];
};

const maxWalkingRouteDistanceM = 2000;

export class OneMapRoutingAdapter {
  constructor(private readonly client: OneMapClient = oneMapClient) {}

  async getWalkingRoute(input: WalkingRouteInput) {
    const directDistanceM = haversineMeters(input.start.lat, input.start.lng, input.end.lat, input.end.lng);
    if (directDistanceM > maxWalkingRouteDistanceM) {
      return {
        route: {
          status: "not_found",
          instructions: [],
          message: "The nearest designated area is outside the walking-route limit for this prototype.",
        } satisfies OneMapWalkingRoute,
        cache: { hit: false, key: "distance-guardrail" },
      };
    }

    const cacheKey = getWalkingRouteCacheKey(input);
    const cached = await cacheAdapter.get<OneMapWalkingRoute>(cacheKey);
    if (cached) return { route: cached, cache: { hit: true, key: cacheKey } };

    const params = new URLSearchParams({
      start: `${input.start.lat},${input.start.lng}`,
      end: `${input.end.lat},${input.end.lng}`,
      routeType: "walk",
    });
    const payload = await getCircuitBreaker("onemap-route", () =>
      this.client.getJson<OneMapRawRouteResponse>("/api/public/routingsvc/route", params)
    ).fire() as OneMapRawRouteResponse;
    const route = normalizeWalkingRouteResponse(payload);
    await cacheAdapter.set(cacheKey, route, { ttlSeconds: 15 * 60 });
    return { route, cache: { hit: false, key: cacheKey } };
  }
}

export function getWalkingRouteCacheKey(input: WalkingRouteInput) {
  return `onemap:route:walk:v1:${roundedCoordinate(input.start)}:${roundedCoordinate(input.end)}`;
}

export function normalizeWalkingRouteResponse(payload: OneMapRawRouteResponse): OneMapWalkingRoute {
  const instructions = normalizeRouteInstructions(payload.route_instructions ?? []);
  const totalDistanceMeters = numeric(payload.route_summary?.total_distance);
  const totalTimeSeconds = numeric(payload.route_summary?.total_time);
  if (!totalDistanceMeters && !totalTimeSeconds && instructions.length === 0) {
    return { status: "not_found", instructions: [], message: payload.status_message ?? "No walking route found." };
  }

  return {
    status: "found",
    ...(totalTimeSeconds !== undefined ? { totalTimeSeconds } : {}),
    ...(totalDistanceMeters !== undefined ? { totalDistanceMeters } : {}),
    ...(typeof payload.route_geometry === "string" && payload.route_geometry ? { encodedGeometry: payload.route_geometry } : {}),
    instructions,
  };
}

function normalizeRouteInstructions(values: unknown[]): OneMapRouteInstruction[] {
  return values
    .map((value) => {
      if (Array.isArray(value)) return normalizeInstructionArray(value);
      if (value && typeof value === "object") return normalizeInstructionObject(value as Record<string, unknown>);
      return undefined;
    })
    .filter((instruction): instruction is OneMapRouteInstruction => Boolean(instruction));
}

function normalizeInstructionArray(value: unknown[]) {
  const instruction = stringAt(value, 9) || stringAt(value, 0) || "Continue walking";
  const distance = numeric(value[5]) ?? numeric(value[2]);
  const direction = stringAt(value, 6) || stringAt(value, 7) || "walk";
  const lat = numeric(value[3]);
  const lng = numeric(value[4]);
  const coordinate = lat !== undefined && lng !== undefined && isSingaporeCoordinate({ lat, lng }) ? { lat, lng } : undefined;
  return {
    direction,
    distanceText: distance !== undefined ? `${Math.round(distance)}m` : "Distance not provided",
    instruction,
    ...coordinate,
  };
}

function normalizeInstructionObject(value: Record<string, unknown>) {
  const instruction = text(value.instruction) || text(value.text) || text(value.html_instructions) || "Continue walking";
  const distance = numeric(value.distance) ?? numeric(value.distance_meters);
  return {
    direction: text(value.direction) || text(value.type) || "walk",
    distanceText: text(value.distanceText) || (distance !== undefined ? `${Math.round(distance)}m` : "Distance not provided"),
    instruction,
    ...validCoordinate(numeric(value.lat), numeric(value.lng)),
  };
}

function validCoordinate(lat: number | undefined, lng: number | undefined) {
  if (lat === undefined || lng === undefined) return undefined;
  return isSingaporeCoordinate({ lat, lng }) ? { lat, lng } : undefined;
}

function stringAt(values: unknown[], index: number) {
  return text(values[index]);
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "").trim() : "";
}

function numeric(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export const oneMapRoutingAdapter = new OneMapRoutingAdapter();
