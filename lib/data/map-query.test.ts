import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";

import { PostgisGeospatialRepository } from "./geospatial-repository";

test("viewport query returns official polygons without reparsing GeoJSON to compute unused centroids", async () => {
  const queries: string[] = [];
  const geometry = { type: "Polygon", coordinates: [[[103.8, 1.3], [103.81, 1.3], [103.81, 1.31], [103.8, 1.3]]] };
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: sql.includes("public.map_features_in_view")
        ? [{ feature_kind: "prohibited_zone", id: "zone-1", name: "Zone", zone_type: "nea_no_smoking_zone", source_id: "nea", geometry_geojson: geometry }]
        : [] };
    },
  } as unknown as Pool;

  const features = await new PostgisGeospatialRepository(pool).listMapFeaturesInView({
    minLat: 1.29, minLng: 103.79, maxLat: 1.32, maxLng: 103.82, zoom: 14,
  });

  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries[0], /st_geomfromgeojson|st_centroid/i);
  assert.deepEqual(features, [{
    id: "zone-1", kind: "prohibited-zone", name: "Zone", sourceId: "nea",
    zoneType: "nea_no_smoking_zone", geometry,
  }]);
});

test("quick designated-area query returns official and unverified community points without fetching polygons", async () => {
  const queries: string[] = [];
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: sql.includes("public.community_designated_areas")
        ? [{ id: "abc", name: "Community smoking area", verified: false, radius_m: 10, lat: 1.3, lng: 103.8 }]
        : [{ id: "official", name: "Designated area", source_id: "nea", lat: 1.3, lng: 103.8 }] };
    },
  } as unknown as Pool;

  const features = await new PostgisGeospatialRepository(pool).listDesignatedMapFeaturesInView({
    minLat: 1.29, minLng: 103.79, maxLat: 1.32, maxLng: 103.82, zoom: 14,
  });

  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => !/public\.map_features_in_view|public\.prohibited_zones/.test(sql)));
  assert.deepEqual(features, [
    { id: "official", kind: "designated-area", name: "Designated area", sourceId: "nea", lat: 1.3, lng: 103.8 },
    { id: "community-abc", kind: "designated-area", name: "Community smoking area", sourceId: "community-reports", lat: 1.3, lng: 103.8, verified: false, radiusM: 10 },
  ]);
});
