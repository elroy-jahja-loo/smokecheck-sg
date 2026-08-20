import type {
  DataGovDatasetConfig,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  NormalizedDataset,
  NormalizedDesignatedArea,
  NormalizedProhibitedZone,
} from "@/lib/datagov/types";

export function normalizeDataGovDataset(input: {
  config: DataGovDatasetConfig;
  collection: GeoJsonFeatureCollection;
  checksum: string;
  retrievedAt: string;
  storagePath: string;
  metadataStoragePath?: string;
}): NormalizedDataset {
  const sourceLastUpdated = firstSourceUpdatedAt(input.collection.features);

  if (input.config.key === "dsa") {
    return {
      config: input.config,
      checksum: input.checksum,
      retrievedAt: input.retrievedAt,
      sourceLastUpdated,
      storagePath: input.storagePath,
      metadataStoragePath: input.metadataStoragePath,
      featureCount: input.collection.features.length,
      designatedAreas: input.collection.features.map((feature, index) => normalizeDsaFeature(feature, input.config.sourceId, index)),
      prohibitedZones: [],
    };
  }

  const zoneType = input.config.key === "nsz" ? "nea_no_smoking_zone" : "nparks_no_smoking_location";
  return {
    config: input.config,
    checksum: input.checksum,
    retrievedAt: input.retrievedAt,
    sourceLastUpdated,
    storagePath: input.storagePath,
    metadataStoragePath: input.metadataStoragePath,
    featureCount: input.collection.features.length,
    designatedAreas: [],
    prohibitedZones: input.collection.features.map((feature, index) => normalizeZoneFeature(feature, input.config.sourceId, zoneType, index)),
  };
}

function normalizeDsaFeature(feature: GeoJsonFeature, sourceId: string, index = 0): NormalizedDesignatedArea {
  if (feature.geometry?.type !== "Point") throw new Error("DSA feature must have Point geometry");
  const properties = feature.properties ?? {};
  const objectId = asText(properties.OBJECTID);
  const [lng, lat] = feature.geometry.coordinates;

  return {
    id: stableFeatureId(sourceId, objectId, index),
    objectId,
    buildingName: asText(properties.BUILDING_N),
    description: asText(properties.DESCRIPTION),
    photoUrl: asText(properties.PHOTOURL),
    sourceUpdatedAt: asText(properties.FMEL_UPD_D),
    lng,
    lat,
    rawProperties: properties,
  };
}

function normalizeZoneFeature(
  feature: GeoJsonFeature,
  sourceId: string,
  zoneType: NormalizedProhibitedZone["zoneType"],
  index = 0,
): NormalizedProhibitedZone {
  if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") {
    throw new Error(`${zoneType} feature must have Polygon or MultiPolygon geometry`);
  }

  const properties = feature.properties ?? {};
  const objectId = asText(properties.OBJECTID);

  return {
    id: stableFeatureId(sourceId, objectId, index),
    objectId,
    name: zoneType === "nea_no_smoking_zone" ? asText(properties.NAME) : asText(properties.L_CODE),
    zoneType,
    sourceUpdatedAt: asText(properties.FMEL_UPD_D),
    geometry: feature.geometry as GeoJsonPolygon | GeoJsonMultiPolygon,
    rawProperties: properties,
  };
}

function firstSourceUpdatedAt(features: GeoJsonFeature[]) {
  for (const feature of features) {
    const value = asText(feature.properties?.FMEL_UPD_D);
    if (value) return value;
  }
  return undefined;
}

function stableFeatureId(sourceId: string, objectId: string | undefined, index: number) {
  return `${sourceId}-${objectId || `feature-${index + 1}`}`;
}

function asText(value: unknown) {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}
