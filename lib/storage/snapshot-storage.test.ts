import assert from "node:assert/strict";
import test from "node:test";

import { LocalSnapshotStorageAdapter, RemoteSnapshotStorageAdapter, createSnapshotStorageAdapter } from "@/lib/storage/snapshot-storage";

test("remote snapshot adapter uses PutObjectCommand with immutable metadata", async () => {
  const sentInputs: unknown[] = [];
  const adapter = new RemoteSnapshotStorageAdapter(
    {
      endpoint: "https://project-ref.storage.supabase.co/storage/v1/s3",
      region: "ap-southeast-1",
      bucket: "smokecheck-source-snapshots",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      forcePathStyle: true,
    },
    {
      send: async (command) => {
        sentInputs.push(command.input);
        return {};
      },
    },
  );

  const result = await adapter.putObject("datagov/nsz/2026/07/10/010203.geojson", "{\"type\":\"FeatureCollection\"}", "application/geo+json");

  assert.equal(sentInputs.length, 2);

  const putInput = sentInputs[0] as Record<string, unknown>;
  assert.equal(putInput.Bucket, "smokecheck-source-snapshots");
  assert.equal(putInput.Key, "datagov/nsz/2026/07/10/010203.geojson");
  assert.equal(putInput.Body, "{\"type\":\"FeatureCollection\"}");
  assert.equal(putInput.ContentType, "application/geo+json");
  assert.equal(putInput.CacheControl, "public, immutable, max-age=31536000");
  assert.ok(putInput.Metadata && typeof putInput.Metadata === "object");
  assert.equal((putInput.Metadata as Record<string,string>)["smokecheck-sha256"]?.length, 64);
  assert.ok((putInput.Metadata as Record<string,string>)["smokecheck-stored-at"]);

  const headInput = sentInputs[1] as Record<string, unknown>;
  assert.equal(headInput.Bucket, "smokecheck-source-snapshots");
  assert.equal(headInput.Key, "datagov/nsz/2026/07/10/010203.geojson");
  assert.equal(result.path, "s3://smokecheck-source-snapshots/datagov/nsz/2026/07/10/010203.geojson");
  assert.equal(result.providerUrl, "https://project-ref.storage.supabase.co/storage/v1/s3/smokecheck-source-snapshots/datagov/nsz/2026/07/10/010203.geojson");
  assert.equal(result.remoteStored, true);
});

test("createSnapshotStorageAdapter returns remote adapter only when full remote env is configured", () => {
  withEnvironment({
    OBJECT_STORAGE_ENDPOINT: "https://project-ref.storage.supabase.co/storage/v1/s3",
    OBJECT_STORAGE_REGION: "ap-southeast-1",
    OBJECT_STORAGE_BUCKET: "smokecheck-source-snapshots",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
    SMOKECHECK_OBJECT_STORAGE_MODE: undefined,
  }, () => {
    assert.equal(createSnapshotStorageAdapter() instanceof RemoteSnapshotStorageAdapter, true);
  });

  withEnvironment({
    OBJECT_STORAGE_ENDPOINT: "https://project-ref.storage.supabase.co/storage/v1/s3",
    OBJECT_STORAGE_REGION: "ap-southeast-1",
    OBJECT_STORAGE_BUCKET: "smokecheck-source-snapshots",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: undefined,
    SMOKECHECK_OBJECT_STORAGE_MODE: undefined,
  }, () => {
    assert.equal(createSnapshotStorageAdapter() instanceof LocalSnapshotStorageAdapter, true);
  });
});

function withEnvironment(overrides: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
