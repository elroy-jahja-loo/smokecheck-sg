import { seedDesignatedAreas } from "@/data/seed-designated-areas";
import { seedProhibitedZones } from "@/data/seed-prohibited-zones";
import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import type { DesignatedArea, GeoJsonMultiPolygon, GeoJsonPolygon, ProhibitedZone } from "@/lib/types";

export interface GeospatialRepository {
  listDesignatedAreas(): Promise<DesignatedArea[]>;
  listProhibitedZones(): Promise<ProhibitedZone[]>;
  getStatusCandidates?(lat: number, lng: number): Promise<{ designatedAreas: DesignatedArea[]; prohibitedZones: ProhibitedZone[] }>;
  listMapFeaturesInView?(bbox: MapFeatureBbox): Promise<MapFeature[]>;
}

export type MapFeatureBbox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

export type MapFeature = {
  id: string;
  kind: "designated-area" | "prohibited-zone";
  name: string;
  sourceId: string;
  lat?: number;
  lng?: number;
  zoneType?: string;
  geometry?: GeoJsonPolygon | GeoJsonMultiPolygon;
  centroidLat?: number;
  centroidLng?: number;
  verified?: boolean;
  radiusM?: number;
};

const COMMUNITY_SOURCE_ID = "community-reports";

export class SeedGeospatialRepository implements GeospatialRepository {
  async listDesignatedAreas() {
    return seedDesignatedAreas;
  }

  async listProhibitedZones() {
    return seedProhibitedZones;
  }

  async listMapFeaturesInView(bbox: MapFeatureBbox) {
    const [areas, zones] = await Promise.all([this.listDesignatedAreas(), this.listProhibitedZones()]);
    const areaFeatures = areas
      .filter((area) => coordinateInBbox(area.lat, area.lng, bbox))
      .map<MapFeature>((area) => ({
        id: area.id,
        kind: "designated-area",
        name: area.name,
        sourceId: area.sourceId,
        lat: area.lat,
        lng: area.lng,
      }));
    const zoneFeatures = zones
      .filter((zone) => geometryTouchesBbox(zone.geometry, bbox))
      .map<MapFeature>((zone) => ({
        id: zone.id,
        kind: "prohibited-zone",
        name: zone.name,
        sourceId: zone.sourceId,
        zoneType: zone.ruleSummary,
        geometry: zone.geometry,
          ...geometryCentroid(zone.geometry),
      }));

    return [...areaFeatures, ...zoneFeatures];
  }
}

class PostgisGeospatialRepository implements GeospatialRepository {
  async getStatusCandidates(lat: number, lng: number) {
    const [areasResult, zonesResult, communityAreasResult, communityZonesResult] = await Promise.all([
      getPostgisPool().query<{
        id: string; building_name: string | null; description: string | null; source_updated_at: string | null;
        source_id: string; distance_m: number; lat: number; lng: number; retrieved_at: Date;
      }>(
        `select a.*, dv.retrieved_at
         from public.nearby_designated_areas($1, $2, 500) a
         join public.dataset_versions dv on dv.id = a.dataset_version_id
         order by a.distance_m
         limit 20`,
        [lat, lng],
      ),
      getPostgisPool().query<{
        id: string; name: string | null; zone_type: string; source_updated_at: string | null;
        source_id: string; geometry_geojson: ProhibitedZone["geometry"]; retrieved_at: Date;
      }>(
        `select z.*, dv.retrieved_at
         from public.prohibited_zones_containing_point($1, $2) z
         join public.dataset_versions dv on dv.id = z.dataset_version_id
         limit 20`,
        [lat, lng],
      ),
      getPostgisPool().query<{
        id: string; name: string; radius_m: number; distance_m: number; lat: number; lng: number;
      }>(
        `with point as (
           select extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography as geog
         )
         select
           c.id,
           c.name,
           c.radius_m,
           extensions.st_distance(c.location, point.geog) as distance_m,
           extensions.st_y(c.location::extensions.geometry) as lat,
           extensions.st_x(c.location::extensions.geometry) as lng
         from public.community_designated_areas c
         cross join point
         where extensions.st_dwithin(c.location, point.geog, 500)
         order by c.location <-> point.geog
         limit 20`,
        [lat, lng],
      ),
      getPostgisPool().query<{
        id: string; name: string; geometry_geojson: ProhibitedZone["geometry"];
      }>(
        `with point as (
           select extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography as geog
         )
         select
           c.id,
           c.name,
           extensions.st_asgeojson(c.geometry::extensions.geometry)::jsonb as geometry_geojson
         from public.community_prohibited_zones c
         cross join point
         where extensions.st_intersects(c.geometry, point.geog)
         limit 20`,
        [lat, lng],
      ),
    ]);

    return {
      designatedAreas: [
        ...areasResult.rows.map((row) => ({
          id: row.id,
          name: row.building_name ?? row.description ?? "Designated smoking area",
          address: row.description ?? row.building_name ?? "Data.gov.sg designated smoking area point",
          lat: Number(row.lat),
          lng: Number(row.lng),
          sourceId: row.source_id,
          freshnessLabel: buildFreshnessLabel(row.source_updated_at, row.retrieved_at),
          isPrototype: false,
        })),
        ...communityAreasResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          address: "Community-reported smoking area",
          lat: Number(row.lat),
          lng: Number(row.lng),
          sourceId: COMMUNITY_SOURCE_ID,
          freshnessLabel: "Community-reported smoking area (unverified). Confirm on-site signs.",
          isPrototype: true,
          coverageRadiusM: Number(row.radius_m),
        })),
      ],
      prohibitedZones: [
        ...zonesResult.rows.map((row) => ({
          id: row.id,
          name: row.name ?? zoneTypeLabel(row.zone_type),
          geometry: row.geometry_geojson,
          ruleSummary: zoneTypeLabel(row.zone_type),
          sourceId: row.source_id,
          freshnessLabel: buildFreshnessLabel(row.source_updated_at, row.retrieved_at),
          isPrototype: false,
        })),
        ...communityZonesResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          geometry: row.geometry_geojson,
          ruleSummary: "Community-reported no-smoking zone",
          sourceId: COMMUNITY_SOURCE_ID,
          freshnessLabel: "Community-reported no-smoking zone (unverified). Confirm on-site signs.",
          isPrototype: true,
        })),
      ],
    };
  }

  async listDesignatedAreas() {
    const { rows } = await getPostgisPool().query<{
      id: string;
      building_name: string | null;
      description: string | null;
      source_id: string;
      source_last_updated: string | null;
      retrieved_at: Date;
      lat: number;
      lng: number;
    }>(
      `select
         da.id,
         da.building_name,
         da.description,
         dv.source_id,
         coalesce(da.source_updated_at, dv.source_last_updated) as source_last_updated,
         dv.retrieved_at,
         extensions.st_y(da.location::extensions.geometry) as lat,
         extensions.st_x(da.location::extensions.geometry) as lng
       from public.designated_areas da
       join public.dataset_versions dv on dv.id = da.dataset_version_id
       where dv.is_active
       order by da.id`,
    );

    return rows.map<DesignatedArea>((row) => ({
      id: row.id,
      name: row.building_name ?? row.description ?? "Designated smoking area",
      address: row.description ?? row.building_name ?? "Data.gov.sg designated smoking area point",
      lat: Number(row.lat),
      lng: Number(row.lng),
      sourceId: row.source_id,
      freshnessLabel: buildFreshnessLabel(row.source_last_updated, row.retrieved_at),
      isPrototype: false,
    }));
  }

  async listProhibitedZones() {
    const { rows } = await getPostgisPool().query<{
      id: string;
      name: string | null;
      zone_type: string;
      source_id: string;
      source_last_updated: string | null;
      retrieved_at: Date;
      geometry_geojson: ProhibitedZone["geometry"];
    }>(
      `select
         pz.id,
         pz.name,
         pz.zone_type,
         dv.source_id,
         coalesce(pz.source_updated_at, dv.source_last_updated) as source_last_updated,
         dv.retrieved_at,
         extensions.st_asgeojson(pz.geometry::extensions.geometry)::jsonb as geometry_geojson
       from public.prohibited_zones pz
       join public.dataset_versions dv on dv.id = pz.dataset_version_id
       where dv.is_active
       order by pz.id`,
    );

    return rows.map<ProhibitedZone>((row) => ({
      id: row.id,
      name: row.name ?? zoneTypeLabel(row.zone_type),
      geometry: row.geometry_geojson,
      ruleSummary: zoneTypeLabel(row.zone_type),
      sourceId: row.source_id,
      freshnessLabel: buildFreshnessLabel(row.source_last_updated, row.retrieved_at),
      isPrototype: false,
    }));
  }

  async listMapFeaturesInView(bbox: MapFeatureBbox) {
    const [officialResult, communityResult] = await Promise.all([
      getPostgisPool().query<{
        feature_kind: "designated_area" | "prohibited_zone";
        id: string;
        name: string | null;
        zone_type: string | null;
        source_id: string;
        geometry_geojson: GeoJsonPolygon | GeoJsonMultiPolygon | { type: "Point"; coordinates: [number, number] };
        centroid_lat: number | null;
        centroid_lng: number | null;
      }>(
        `select
           feature_kind,
           id,
           name,
           zone_type,
           source_id,
           geometry_geojson,
           case when feature_kind = 'prohibited_zone' then extensions.st_y(extensions.st_centroid(extensions.st_geomfromgeojson(geometry_geojson::text))) else null end as centroid_lat,
           case when feature_kind = 'prohibited_zone' then extensions.st_x(extensions.st_centroid(extensions.st_geomfromgeojson(geometry_geojson::text))) else null end as centroid_lng
         from public.map_features_in_view($1, $2, $3, $4)
         limit 250`,
        [bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng],
      ),
      getPostgisPool().query<{
        feature_kind: "designated_area" | "prohibited_zone";
        id: string;
        name: string;
        zone_type: string | null;
        geometry_geojson: GeoJsonPolygon | GeoJsonMultiPolygon | { type: "Point"; coordinates: [number, number] };
        centroid_lat: number | null;
        centroid_lng: number | null;
        verified: boolean;
        radius_m: number | null;
      }>(
        `with bbox as (
           select extensions.st_makeenvelope($2, $1, $4, $3, 4326)::extensions.geography as geog
         )
         select
           'designated_area'::text as feature_kind,
           c.id::text as id,
           c.name,
           null::text as zone_type,
           extensions.st_asgeojson(c.location::extensions.geometry)::jsonb as geometry_geojson,
           null::double precision as centroid_lat,
           null::double precision as centroid_lng,
           c.verified,
           c.radius_m
         from public.community_designated_areas c
         cross join bbox
         where extensions.st_intersects(c.location, bbox.geog)
         union all
         select
           'prohibited_zone'::text,
           c.id::text as id,
           c.name,
           'community_no_smoking_zone'::text as zone_type,
           extensions.st_asgeojson(c.geometry::extensions.geometry)::jsonb as geometry_geojson,
           extensions.st_y(extensions.st_centroid(c.geometry::extensions.geometry)) as centroid_lat,
           extensions.st_x(extensions.st_centroid(c.geometry::extensions.geometry)) as centroid_lng,
           c.verified,
           null::double precision as radius_m
         from public.community_prohibited_zones c
         cross join bbox
         where extensions.st_intersects(c.geometry, bbox.geog)
         limit 250`,
        [bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng],
      ),
    ]);

    return [
      ...officialResult.rows.map<MapFeature | undefined>((row) => {
        if (row.feature_kind === "designated_area" && row.geometry_geojson.type === "Point") {
          const [lng, lat] = row.geometry_geojson.coordinates;
          return {
            id: row.id,
            kind: "designated-area",
            name: row.name ?? "Designated smoking area",
            sourceId: row.source_id,
            lat,
            lng,
          };
        }
        if (row.feature_kind === "prohibited_zone" && row.geometry_geojson.type !== "Point") {
          return {
            id: row.id,
            kind: "prohibited-zone",
            name: row.name ?? zoneTypeLabel(row.zone_type ?? ""),
            sourceId: row.source_id,
            ...(row.zone_type ? { zoneType: row.zone_type } : {}),
            geometry: row.geometry_geojson,
            ...(row.centroid_lat !== null && row.centroid_lng !== null ? { centroidLat: Number(row.centroid_lat), centroidLng: Number(row.centroid_lng) } : {}),
          };
        }
        return undefined;
      }),
      ...communityResult.rows.map<MapFeature | undefined>((row) => {
        if (row.feature_kind === "designated_area" && row.geometry_geojson.type === "Point") {
          const [lng, lat] = row.geometry_geojson.coordinates;
          return {
            id: `community-${row.id}`,
            kind: "designated-area",
            name: row.name,
            sourceId: COMMUNITY_SOURCE_ID,
            lat,
            lng,
            verified: row.verified,
            radiusM: Number(row.radius_m ?? 10),
          };
        }
        if (row.feature_kind === "prohibited_zone" && row.geometry_geojson.type !== "Point") {
          return {
            id: `community-${row.id}`,
            kind: "prohibited-zone",
            name: row.name,
            sourceId: COMMUNITY_SOURCE_ID,
            zoneType: "community_no_smoking_zone",
            geometry: row.geometry_geojson,
            ...(row.centroid_lat !== null && row.centroid_lng !== null ? { centroidLat: Number(row.centroid_lat), centroidLng: Number(row.centroid_lng) } : {}),
            verified: row.verified,
          };
        }
        return undefined;
      }),
    ].filter((feature): feature is MapFeature => Boolean(feature));
  }
}

function geometryCentroid(geometry: GeoJsonPolygon | GeoJsonMultiPolygon) {
  const positions = geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
  if (positions.length === 0) return {};
  const totals = positions.reduce((accumulator, [lng, lat]) => ({ lat: accumulator.lat + lat, lng: accumulator.lng + lng }), { lat: 0, lng: 0 });
  return {
    centroidLat: totals.lat / positions.length,
    centroidLng: totals.lng / positions.length,
  };
}

export function parseMapFeatureBbox(params: URLSearchParams): MapFeatureBbox | undefined {
  const minLat = numberParam(params, "minLat");
  const minLng = numberParam(params, "minLng");
  const maxLat = numberParam(params, "maxLat");
  const maxLng = numberParam(params, "maxLng");
  const zoom = numberParam(params, "zoom");
  if ([minLat, minLng, maxLat, maxLng, zoom].some((value) => value === undefined)) return undefined;
  const bbox = { minLat: minLat!, minLng: minLng!, maxLat: maxLat!, maxLng: maxLng!, zoom: zoom! };
  if (bbox.minLat < 1.1 || bbox.maxLat > 1.5 || bbox.minLng < 103.5 || bbox.maxLng > 104.1) return undefined;
  if (bbox.minLat >= bbox.maxLat || bbox.minLng >= bbox.maxLng) return undefined;
  if (bbox.maxLat - bbox.minLat > 0.12 || bbox.maxLng - bbox.minLng > 0.12) return undefined;
  if (!Number.isInteger(bbox.zoom) || bbox.zoom < 10 || bbox.zoom > 20) return undefined;
  return bbox;
}

function buildFreshnessLabel(sourceLastUpdated: string | null, retrievedAt: Date) {
  const retrievedLabel = retrievedAt.toISOString().slice(0, 10);
  return sourceLastUpdated
    ? `Data.gov.sg source updated ${sourceLastUpdated}; synced ${retrievedLabel}`
    : `Data.gov.sg synced ${retrievedLabel}`;
}

function zoneTypeLabel(zoneType: string) {
  if (zoneType === "nparks_no_smoking_location") return "NParks no-smoking location";
  return "NEA no-smoking zone";
}

function numberParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function coordinateInBbox(lat: number, lng: number, bbox: MapFeatureBbox) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
}

function geometryTouchesBbox(geometry: GeoJsonPolygon | GeoJsonMultiPolygon, bbox: MapFeatureBbox) {
  const positions = geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
  return positions.some(([lng, lat]) => coordinateInBbox(lat, lng, bbox));
}

function createGeospatialRepository(): GeospatialRepository {
  return hasPostgisConfig() ? new PostgisGeospatialRepository() : new SeedGeospatialRepository();
}

export const geospatialRepository: GeospatialRepository = createGeospatialRepository();
