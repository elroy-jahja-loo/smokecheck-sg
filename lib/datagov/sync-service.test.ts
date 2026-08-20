import assert from "node:assert/strict";
import { test } from "node:test";

import { DataGovClient } from "@/lib/datagov/client";
import { sha256Hex } from "@/lib/datagov/checksum";
import { parseGeoJsonFeatureCollection } from "@/lib/datagov/geojson";
import { MemoryDataGovSyncRepository } from "@/lib/datagov/memory-sync-repository";
import { normalizeDataGovDataset } from "@/lib/datagov/normalizers";
import { DataGovSyncService } from "@/lib/datagov/sync-service";
import type { DataGovDatasetConfig } from "@/lib/datagov/types";
import type { SnapshotStorageAdapter } from "@/lib/storage/snapshot-storage";

const dsaConfig: DataGovDatasetConfig = {
  key: "dsa",
  sourceId: "datagov-dsa",
  datasetId: "d_dsa_fixture",
  datasetName: "Designated Smoking Areas",
  agency: "NEA",
  sourceUrl: "https://data.gov.sg/datasets/d_dsa_fixture/view",
};

const nszConfig: DataGovDatasetConfig = {
  key: "nsz",
  sourceId: "datagov-nea-no-smoking-zones",
  datasetId: "d_nsz_fixture",
  datasetName: "No Smoking Zones",
  agency: "NEA",
  sourceUrl: "https://data.gov.sg/datasets/d_nsz_fixture/view",
};

const nparksConfig: DataGovDatasetConfig = {
  key: "nparks-no-smoking",
  sourceId: "datagov-nparks-no-smoking",
  datasetId: "d_nparks_fixture",
  datasetName: "NParks No-Smoking Locations",
  agency: "NParks",
  sourceUrl: "https://data.gov.sg/datasets/d_nparks_fixture/view",
};

const dsaFixture = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        OBJECTID: 123,
        BUILDING_N: "Fixture DSA",
        DESCRIPTION: "Near fixture building",
        PHOTOURL: "https://example.test/photo.jpg",
        FMEL_UPD_D: "2026-03-19",
      },
      geometry: { type: "Point", coordinates: [103.851, 1.29] },
    },
  ],
});

const nszFixture = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { OBJECTID: "7", NAME: "Fixture no smoking zone", FMEL_UPD_D: "2025-11-13" },
      geometry: {
        type: "Polygon",
        coordinates: [[[103.8, 1.3], [103.81, 1.3], [103.81, 1.31], [103.8, 1.31], [103.8, 1.3]]],
      },
    },
  ],
});

const nparksFixture = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { OBJECTID: 9, L_CODE: "Fixture Park", FMEL_UPD_D: "2026-07-05" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[103.9, 1.35], [103.91, 1.35], [103.91, 1.36], [103.9, 1.36], [103.9, 1.35]]]],
      },
    },
  ],
});

test("poll-download parsing returns the resolved download URL", async () => {
  const client = new DataGovClient({
    baseUrl: "https://api-open.data.gov.sg",
    fetchImpl: async () => Response.json({ code: 0, data: { url: "https://download.test/dsa.geojson", lastUpdated: "2026-03-19" } }),
  });

  const result = await client.pollDownload("fixture-dataset");
  assert.equal(result.downloadUrl, "https://download.test/dsa.geojson");
  assert.equal(result.sourceLastUpdated, "2026-03-19");
});

test("GeoJSON validation rejects non FeatureCollection payloads", () => {
  assert.throws(() => parseGeoJsonFeatureCollection(JSON.stringify({ type: "Feature", features: [] })), /FeatureCollection/);
});

test("checksum stability uses SHA-256 over raw snapshot bytes", () => {
  assert.equal(sha256Hex(dsaFixture), sha256Hex(dsaFixture));
  assert.notEqual(sha256Hex(dsaFixture), sha256Hex(`${dsaFixture}\n`));
});

test("DSA normalization maps Data.gov.sg properties and point coordinates", () => {
  const collection = parseGeoJsonFeatureCollection(dsaFixture);
  const normalized = normalizeDataGovDataset({
    config: dsaConfig,
    collection,
    checksum: sha256Hex(dsaFixture),
    retrievedAt: "2026-07-07T00:00:00.000Z",
    storagePath: "local://fixture/dsa.geojson",
  });

  assert.equal(normalized.designatedAreas[0].objectId, "123");
  assert.equal(normalized.designatedAreas[0].buildingName, "Fixture DSA");
  assert.equal(normalized.designatedAreas[0].lng, 103.851);
  assert.equal(normalized.designatedAreas[0].lat, 1.29);
});

test("NSZ normalization maps polygons and source caveat fields", () => {
  const normalized = normalizeDataGovDataset({
    config: nszConfig,
    collection: parseGeoJsonFeatureCollection(nszFixture),
    checksum: sha256Hex(nszFixture),
    retrievedAt: "2026-07-07T00:00:00.000Z",
    storagePath: "local://fixture/nsz.geojson",
  });

  assert.equal(normalized.prohibitedZones[0].objectId, "7");
  assert.equal(normalized.prohibitedZones[0].name, "Fixture no smoking zone");
  assert.equal(normalized.prohibitedZones[0].zoneType, "nea_no_smoking_zone");
  assert.equal(normalized.prohibitedZones[0].geometry.type, "Polygon");
});

test("NParks normalization maps L_CODE to name and keeps MultiPolygon geometry", () => {
  const normalized = normalizeDataGovDataset({
    config: nparksConfig,
    collection: parseGeoJsonFeatureCollection(nparksFixture),
    checksum: sha256Hex(nparksFixture),
    retrievedAt: "2026-07-07T00:00:00.000Z",
    storagePath: "local://fixture/nparks.geojson",
  });

  assert.equal(normalized.prohibitedZones[0].objectId, "9");
  assert.equal(normalized.prohibitedZones[0].name, "Fixture Park");
  assert.equal(normalized.prohibitedZones[0].zoneType, "nparks_no_smoking_location");
  assert.equal(normalized.prohibitedZones[0].geometry.type, "MultiPolygon");
});

test("sync service stores local snapshot metadata and activates only the published version", async () => {
  const repository = new MemoryDataGovSyncRepository();
  const storage = new MemorySnapshotStorage();
  const service = new DataGovSyncService({
    client: fixtureClient(dsaFixture),
    repository,
    storage,
    now: () => new Date("2026-07-07T03:00:00.000Z"),
  });

  const first = await service.syncDataset(dsaConfig);
  const second = await service.syncDataset(dsaConfig);

  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  assert.equal(repository.versions.filter((version) => version.isActive).length, 1);
  assert.equal(repository.versions.at(-1)?.isActive, true);
  assert.match(first.storagePath ?? "", /^memory:\/\/datagov\/dsa\/2026\/07\/07\/030000-[a-f0-9]{16}\.geojson$/);
  assert.match(first.metadataStoragePath ?? "", /030000-[a-f0-9]{16}\.metadata\.json$/);
});

test("failed sync does not replace the currently active version", async () => {
  const repository = new MemoryDataGovSyncRepository();
  const service = new DataGovSyncService({ client: fixtureClient(dsaFixture), repository, storage: new MemorySnapshotStorage() });

  await service.syncDataset(dsaConfig);
  const activeBeforeFailure = repository.versions.find((version) => version.isActive);
  repository.failPublish = true;
  const failed = await service.syncDataset(dsaConfig);

  assert.equal(failed.status, "failed");
  assert.equal(repository.versions.find((version) => version.isActive)?.id, activeBeforeFailure?.id);
  assert.equal(repository.runs.at(-1)?.status, "failed");
});

function fixtureClient(geoJson: string) {
  return new DataGovClient({
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("poll-download")) return Response.json({ code: 0, data: { url: "https://download.test/fixture.geojson" } });
      return new Response(geoJson, { status: 200, headers: { "content-type": "application/geo+json" } });
    },
  });
}

class MemorySnapshotStorage implements SnapshotStorageAdapter {
  readonly objects = new Map<string, string>();

  async putObject(path: string, body: string) {
    this.objects.set(path, body);
    return { path: `memory://${path}`, remoteStored: false, note: "Stored in test memory adapter." };
  }
}
