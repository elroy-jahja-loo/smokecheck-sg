import assert from "node:assert/strict";
import { test } from "node:test";

import { loadMapFeaturesInView } from "./map-features-service";

test("separate map-layer caches reconstruct the same seed features as the original full response", async () => {
  const bbox = { minLat: 1.29, minLng: 103.82, maxLat: 1.31, maxLng: 103.84, zoom: 14 };
  const [designated, prohibited, all] = await Promise.all([
    loadMapFeaturesInView(bbox, "designated"),
    loadMapFeaturesInView(bbox, "prohibited"),
    loadMapFeaturesInView(bbox),
  ]);

  assert.deepEqual([...designated.features, ...prohibited.features], all.features);
  assert.equal(new Set([designated.cacheKey, prohibited.cacheKey, all.cacheKey]).size, 3);
  assert.ok([designated.cacheKey, prohibited.cacheKey, all.cacheKey].every((key) => key.startsWith("viewport:v1:")));
});
