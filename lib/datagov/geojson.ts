import type { GeoJsonFeatureCollection, GeoJsonGeometry } from "@/lib/datagov/types";

export function parseGeoJsonFeatureCollection(raw: string): GeoJsonFeatureCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GeoJSON snapshot is not valid JSON");
  }

  if (!isFeatureCollection(parsed)) {
    throw new Error("GeoJSON snapshot must be a FeatureCollection with valid features");
  }

  return parsed;
}

function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) return false;
  return value.features.every((feature) => {
    if (!isRecord(feature) || feature.type !== "Feature") return false;
    if (feature.properties !== null && feature.properties !== undefined && !isRecord(feature.properties)) return false;
    return feature.geometry === null || isGeometry(feature.geometry);
  });
}

function isGeometry(value: unknown): value is GeoJsonGeometry {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "Point") return isPosition(value.coordinates);
  if (value.type === "Polygon") return isPolygonCoordinates(value.coordinates);
  if (value.type === "MultiPolygon") return Array.isArray(value.coordinates) && value.coordinates.every(isPolygonCoordinates);
  return false;
}

function isPolygonCoordinates(value: unknown): value is [number, number][][] {
  return Array.isArray(value) && value.length > 0 && value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition));
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
