export type DataGovDatasetKey = "dsa" | "nsz" | "nparks-no-smoking";

export type DataGovDatasetConfig = {
  key: DataGovDatasetKey;
  sourceId: string;
  datasetId: string;
  datasetName: string;
  agency: "NEA" | "NParks";
  sourceUrl: string;
};

export type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: [number, number][][][];
};

export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon;

export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties: Record<string, unknown> | null;
  geometry: GeoJsonGeometry | null;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type NormalizedDesignatedArea = {
  id: string;
  objectId?: string;
  buildingName?: string;
  description?: string;
  photoUrl?: string;
  sourceUpdatedAt?: string;
  lng: number;
  lat: number;
  rawProperties: Record<string, unknown>;
};

export type NormalizedProhibitedZone = {
  id: string;
  objectId?: string;
  name?: string;
  zoneType: "nea_no_smoking_zone" | "nparks_no_smoking_location";
  sourceUpdatedAt?: string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  rawProperties: Record<string, unknown>;
};

export type NormalizedDataset = {
  config: DataGovDatasetConfig;
  checksum: string;
  retrievedAt: string;
  sourceLastUpdated?: string;
  storagePath: string;
  metadataStoragePath?: string;
  featureCount: number;
  designatedAreas: NormalizedDesignatedArea[];
  prohibitedZones: NormalizedProhibitedZone[];
};

export type SyncRunRecord = {
  id: string;
  sourceId: string;
  datasetId: string;
  status: "started" | "success" | "failed";
  startedAt: string;
  finishedAt?: string;
  message?: string;
  featureCount?: number;
  checksum?: string;
  storagePath?: string;
  metadataStoragePath?: string;
  datasetVersionId?: string;
};

export type PublishedDatasetVersion = {
  id: string;
  sourceId: string;
  datasetId: string;
  checksum: string;
  isActive: boolean;
};

export type DatasetSyncSummary = {
  key: DataGovDatasetKey;
  sourceId: string;
  datasetId: string;
  status: "success" | "failed";
  featureCount?: number;
  checksum?: string;
  storagePath?: string;
  metadataStoragePath?: string;
  datasetVersionId?: string;
  message?: string;
};
