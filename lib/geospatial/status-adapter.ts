import type { DesignatedArea, LocationResult, ProhibitedZone } from "@/lib/types";
import { geospatialRepository, SeedGeospatialRepository, type GeospatialRepository } from "@/lib/data/geospatial-repository";
import { SeedSourceRepository, sourceRepository, type SourceRepository } from "@/lib/data/source-repository";
import { haversineMeters } from "@/lib/geospatial/haversine";
import { logEvent } from "@/lib/observability/logging";

export type StatusInput = {
  lat: number;
  lng: number;
  gpsAccuracyM?: number;
  selectedAddress?: string;
};

export interface GeospatialStatusAdapter {
  getStatus(input: StatusInput): Promise<LocationResult>;
}

const DESIGNATED_NEARBY_M = 75;
const POOR_ACCURACY_M = 50;
const globalDisclaimer =
  "This tool provides guidance based on available map and rule data. Physical signs, current law, and NEA instructions prevail.";

class SeedGeospatialStatusAdapter implements GeospatialStatusAdapter {
  constructor(
    private readonly geospatial: GeospatialRepository = geospatialRepository,
    private readonly sources: SourceRepository = sourceRepository,
  ) {}

  async getStatus(input: StatusInput) {
    let degraded = false;
    let candidates;
    try {
      candidates = this.geospatial.getStatusCandidates
        ? await this.geospatial.getStatusCandidates(input.lat, input.lng)
        : await listCandidates(this.geospatial);
    } catch (error) {
      degraded = true;
      logEvent("error", "geospatial.status.fallback", { message: error instanceof Error ? error.message : "unknown" });
      candidates = await listCandidates(new SeedGeospatialRepository());
    }
    const { designatedAreas, prohibitedZones } = candidates;

    const nearestDesignatedArea = findNearestDesignatedArea(input, designatedAreas);
    const matchedProhibitedZone = prohibitedZones.find((zone) => geometryContainsPoint(zone.geometry, input));
    const sourceIds = new Set<string>(["nea-smoking-guidance", "sg-legislation-reference"]);

    if (matchedProhibitedZone) sourceIds.add(matchedProhibitedZone.sourceId);
    if (nearestDesignatedArea) sourceIds.add(nearestDesignatedArea.area.sourceId);
    if (!matchedProhibitedZone && !nearestDesignatedArea && designatedAreas.every((area) => area.isPrototype)) sourceIds.add("onemap-compatible-shell");

    const poorAccuracy = typeof input.gpsAccuracyM === "number" && input.gpsAccuracyM > POOR_ACCURACY_M;
    const status = degraded || poorAccuracy
      ? "uncertain"
      : matchedProhibitedZone
        ? "likely-prohibited"
        : nearestDesignatedArea && nearestDesignatedArea.distanceM <= (nearestDesignatedArea.area.coverageRadiusM ?? DESIGNATED_NEARBY_M)
          ? "designated-nearby"
          : "uncertain";

    const freshnessLabel = degraded
      ? "Live map data unavailable; showing prototype fallback data as uncertain"
      : buildFreshnessLabel(status, matchedProhibitedZone, nearestDesignatedArea?.area);
    const resultSourceIds = Array.from(sourceIds);
    let sources;
    try {
      sources = await this.sources.requireSources(resultSourceIds);
    } catch {
      degraded = true;
      sources = await new SeedSourceRepository().requireSources(resultSourceIds);
    }
    const resultStatus = degraded ? "uncertain" : status;
    const resultFreshnessLabel = degraded
      ? "Live map data unavailable; showing prototype fallback data as uncertain"
      : freshnessLabel;

    return {
      status: resultStatus,
      selectedAddress: input.selectedAddress ?? "Selected prototype map point",
      lat: input.lat,
      lng: input.lng,
      gpsAccuracyM: input.gpsAccuracyM,
      nearestDesignatedArea: nearestDesignatedArea?.area,
      distanceM: nearestDesignatedArea?.distanceM,
      sourceIds: resultSourceIds,
      sources,
      freshnessLabel: resultFreshnessLabel,
      disclaimer: globalDisclaimer,
      matchedProhibitedZone,
    } satisfies LocationResult;
  }
}

async function listCandidates(repository: GeospatialRepository) {
  const [designatedAreas, prohibitedZones] = await Promise.all([
    repository.listDesignatedAreas(),
    repository.listProhibitedZones(),
  ]);
  return { designatedAreas, prohibitedZones };
}

function buildFreshnessLabel(status: LocationResult["status"], zone?: ProhibitedZone, area?: DesignatedArea) {
  if (status === "likely-prohibited" && zone) return zone.freshnessLabel;
  if (status === "designated-nearby" && area) return area.freshnessLabel;
  return "Unable to confirm exact boundary in prototype seed data";
}

function findNearestDesignatedArea(input: StatusInput, areas: DesignatedArea[]) {
  return areas.reduce<{ area: DesignatedArea; distanceM: number } | undefined>((nearest, area) => {
    const distanceM = Math.round(haversineMeters(input.lat, input.lng, area.lat, area.lng));
    if (!nearest || distanceM < nearest.distanceM) return { area, distanceM };
    return nearest;
  }, undefined);
}

function geometryContainsPoint(geometry: ProhibitedZone["geometry"], point: { lat: number; lng: number }) {
  if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates, point);
  return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, point));
}

function polygonContainsPoint(rings: [number, number][][], point: { lat: number; lng: number }) {
  const [outerRing, ...holes] = rings;
  if (!ringContainsPoint(outerRing, point)) return false;
  return !holes.some((hole) => ringContainsPoint(hole, point));
}

function ringContainsPoint(ring: [number, number][], point: { lat: number; lng: number }) {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

export const geospatialStatusAdapter: GeospatialStatusAdapter = new SeedGeospatialStatusAdapter();
