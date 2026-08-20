import assert from "node:assert/strict";
import { test } from "node:test";

import { geospatialStatusAdapter } from "./status-adapter";

test("geospatial status is deterministic and includes source metadata", async () => {
  const result = await geospatialStatusAdapter.getStatus({
    lat: 1.304,
    lng: 103.831,
    gpsAccuracyM: 10,
    selectedAddress: "Prototype Orchard point",
  });

  assert.equal(result.status, "likely-prohibited");
  assert.equal(result.matchedProhibitedZone?.id, "zone-orchard-demo");
  assert.ok(result.sources?.some((source) => source.id === "nea-smoking-guidance"));
  assert.ok(result.sources?.every((source) => source.name && source.url));
});

test("poor GPS accuracy returns uncertain even inside a seed zone", async () => {
  const result = await geospatialStatusAdapter.getStatus({
    lat: 1.304,
    lng: 103.831,
    gpsAccuracyM: 75,
  });

  assert.equal(result.status, "uncertain");
  assert.equal(result.lat, 1.304);
  assert.equal(result.lng, 103.831);
});
