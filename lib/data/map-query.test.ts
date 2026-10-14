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
      return { rows: [
        { id: "official", name: "Designated area", source_id: "nea", lat: 1.3, lng: 103.8, verified: null, radius_m: null },
        { id: "abc", name: "Community smoking area", source_id: "community-reports", verified: false, radius_m: 10, lat: 1.3, lng: 103.8 },
      ] };
    },
  } as unknown as Pool;

  const features = await new PostgisGeospatialRepository(pool).listDesignatedMapFeaturesInView({
    minLat: 1.29, minLng: 103.79, maxLat: 1.32, maxLng: 103.82, zoom: 14,
  });

  assert.equal(queries.length, 1);
  assert.ok(queries.every((sql) => !/public\.map_features_in_view|public\.prohibited_zones/.test(sql)));
  assert.deepEqual(features, [
    { id: "official", kind: "designated-area", name: "Designated area", sourceId: "nea", lat: 1.3, lng: 103.8 },
    { id: "community-abc", kind: "designated-area", name: "Community smoking area", sourceId: "community-reports", lat: 1.3, lng: 103.8, verified: false, radiusM: 10 },
  ]);
});

test("prohibited-area query returns exact official and community polygon geometry in one request", async () => {
  const queries: string[] = [];
  const geometry = { type: "Polygon" as const, coordinates: [[[103.8, 1.3], [103.812345678, 1.3], [103.81, 1.31], [103.8, 1.3]]] };
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [
        { id: "official-zone", name: "Official no-smoking area", zone_type: "nea_no_smoking_zone", source_id: "nea", geometry_geojson: geometry, verified: null },
        { id: "community-zone", name: "Community no-smoking area", zone_type: "community_no_smoking_zone", source_id: "community-reports", geometry_geojson: geometry, verified: false },
        { id: "point-zone", name: "Not an outline", zone_type: "nparks_no_smoking_location", source_id: "nea", geometry_geojson: { type: "Point", coordinates: [103.8, 1.3] }, verified: null },
      ] };
    },
  } as unknown as Pool;

  const features = await new PostgisGeospatialRepository(pool).listProhibitedMapFeaturesInView({
    minLat: 1.29, minLng: 103.79, maxLat: 1.32, maxLng: 103.82, zoom: 14,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0], /public\.prohibited_zones/);
  assert.match(queries[0], /public\.community_prohibited_zones/);
  assert.doesNotMatch(queries[0], /st_simplify|st_intersection|st_clipbybox2d/i);
  assert.deepEqual(features, [
    { id: "official-zone", kind: "prohibited-zone", name: "Official no-smoking area", sourceId: "nea", zoneType: "nea_no_smoking_zone", geometry },
    { id: "community-community-zone", kind: "prohibited-zone", name: "Community no-smoking area", sourceId: "community-reports", zoneType: "community_no_smoking_zone", geometry, verified: false },
  ]);
});
