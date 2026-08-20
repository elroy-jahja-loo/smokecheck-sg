import assert from "node:assert/strict";
import test from "node:test";

import { createVectorTileManifest } from "@/lib/vector-tiles/manifest";

test("vector tile manifest generation keeps expected production fields", () => {
  const manifest = createVectorTileManifest({
    generatedAt: "2026-07-10T00:00:00.000Z",
    sourcePath: "data/generated/map-features.geojson",
    outputDirectory: ".local/vector-tiles",
    tilePathTemplate: "./tiles/{z}/{x}/{y}.mvt",
    minZoom: 10,
    maxZoom: 16,
    bounds: [103.5, 1.1, 104.1, 1.5],
    layers: ["designated_areas", "prohibited_zones"],
    tileCount: 512,
    totalBytes: 84532,
  });

  assert.equal(manifest.format, "mvt-directory");
  assert.equal(manifest.minZoom, 10);
  assert.equal(manifest.maxZoom, 16);
  assert.deepEqual(manifest.layers, ["designated_areas", "prohibited_zones"]);
  assert.equal(manifest.tilePathTemplate, "./tiles/{z}/{x}/{y}.mvt");
  assert.equal(manifest.tileCount, 512);
  assert.equal(manifest.totalBytes, 84532);
});
