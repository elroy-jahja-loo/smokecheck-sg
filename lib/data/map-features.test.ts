import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMapFeatureBbox, SeedGeospatialRepository } from "./geospatial-repository";

test("map feature bbox validation rejects invalid or over-broad viewport requests", () => {
  assert.deepEqual(parseMapFeatureBbox(new URLSearchParams("minLat=1.29&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=14")), {
    minLat: 1.29,
    minLng: 103.82,
    maxLat: 1.31,
    maxLng: 103.84,
    zoom: 14,
  });
  assert.equal(parseMapFeatureBbox(new URLSearchParams("minLat=1.0&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=14")), undefined);
  assert.equal(parseMapFeatureBbox(new URLSearchParams("minLat=1.2&minLng=103.6&maxLat=1.4&maxLng=103.9&zoom=14")), undefined);
  assert.equal(parseMapFeatureBbox(new URLSearchParams("minLat=1.1&minLng=103.5&maxLat=1.5&maxLng=104.1&zoom=16")), undefined);
  assert.equal(parseMapFeatureBbox(new URLSearchParams("minLat=1.29&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=5")), undefined);
});

test("map feature responses are viewport-bounded and omit raw Data.gov properties", async () => {
  const features = await new SeedGeospatialRepository().listMapFeaturesInView({
    minLat: 1.29,
    minLng: 103.82,
    maxLat: 1.31,
    maxLng: 103.84,
    zoom: 14,
  });

  assert.ok(features.length > 0);
  assert.ok(features.every((feature) => !("raw_properties" in feature) && !("rawProperties" in feature)));
  assert.ok(features.some((feature) => feature.kind === "designated-area"));
  assert.ok(features.some((feature) => feature.kind === "prohibited-zone" && feature.geometry));
});
