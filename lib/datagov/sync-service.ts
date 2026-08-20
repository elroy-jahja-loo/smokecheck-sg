import { DataGovClient } from "@/lib/datagov/client";
import { getDataGovDatasetConfigs } from "@/lib/datagov/config";
import { sha256Hex } from "@/lib/datagov/checksum";
import { parseGeoJsonFeatureCollection } from "@/lib/datagov/geojson";
import { normalizeDataGovDataset } from "@/lib/datagov/normalizers";
import { PostgisDataGovSyncRepository, type DataGovSyncRepository } from "@/lib/datagov/sync-repository";
import type { DataGovDatasetConfig, DatasetSyncSummary } from "@/lib/datagov/types";
import { createSnapshotStorageAdapter, type SnapshotStorageAdapter } from "@/lib/storage/snapshot-storage";

export class DataGovSyncService {
  constructor(
    private readonly options: {
      client?: DataGovClient;
      repository?: DataGovSyncRepository;
      storage?: SnapshotStorageAdapter;
      now?: () => Date;
    } = {},
  ) {}

  async syncAll(configs: DataGovDatasetConfig[] = getDataGovDatasetConfigs()) {
    const summaries: DatasetSyncSummary[] = [];
    for (const config of configs) {
      summaries.push(await this.syncDataset(config));
    }
    return summaries;
  }

  async syncDataset(config: DataGovDatasetConfig): Promise<DatasetSyncSummary> {
    const run = await this.repository.startRun(config);
    try {
      const retrievedAt = this.now().toISOString();
      const poll = await this.client.pollDownload(config.datasetId);
      const rawGeoJson = await this.client.downloadText(poll.downloadUrl);
      const checksum = sha256Hex(rawGeoJson);
      const collection = parseGeoJsonFeatureCollection(rawGeoJson);
      if (collection.features.length === 0) throw new Error("Data.gov.sg returned an empty dataset; refusing to replace active data");
      const objectPath = snapshotObjectPath(config.key, retrievedAt, checksum, "geojson");
      const metadataObjectPath = snapshotObjectPath(config.key, retrievedAt, checksum, "metadata.json");
      const snapshot = await this.storage.putObject(objectPath, rawGeoJson, "application/geo+json");
      if (process.env.VERCEL_ENV === "production" && (!snapshot.remoteStored || !snapshot.verifiedAt)) {
        throw new Error("Production Data.gov.sg sync requires verified remote snapshot storage.");
      }
      const metadata = {
        datasetId: config.datasetId,
        datasetName: config.datasetName,
        sourceAgency: config.agency,
        pollDownloadUrl: poll.pollUrl,
        resolvedDownloadUrl: poll.downloadUrl,
        retrievedAt,
        checksum,
        featureCount: collection.features.length,
        byteSize: Buffer.byteLength(rawGeoJson, "utf8"),
        appVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.npm_package_version ?? "local",
        storage: snapshot,
      };
      const metadataSnapshot = await this.storage.putObject(metadataObjectPath, JSON.stringify(metadata, null, 2), "application/json");
      if (process.env.VERCEL_ENV === "production" && (!metadataSnapshot.remoteStored || !metadataSnapshot.verifiedAt)) {
        throw new Error("Production Data.gov.sg sync requires verified remote metadata storage.");
      }
      const normalized = normalizeDataGovDataset({
        config,
        collection,
        checksum,
        retrievedAt,
        storagePath: snapshot.path,
        metadataStoragePath: metadataSnapshot.path,
      });
      normalized.sourceLastUpdated = poll.sourceLastUpdated ?? normalized.sourceLastUpdated;

      const version = await this.repository.publishDataset(normalized);
      await this.repository.finishRun(run.id, {
        status: "success",
        featureCount: normalized.featureCount,
        checksum,
        storagePath: snapshot.path,
        metadataStoragePath: metadataSnapshot.path,
        datasetVersionId: version.id,
        message: snapshot.remoteStored ? "Data.gov.sg dataset synced with remote snapshot storage." : snapshot.note,
      });

      return {
        key: config.key,
        sourceId: config.sourceId,
        datasetId: config.datasetId,
        status: "success",
        featureCount: normalized.featureCount,
        checksum,
        storagePath: snapshot.path,
        metadataStoragePath: metadataSnapshot.path,
        datasetVersionId: version.id,
        message: snapshot.remoteStored ? undefined : snapshot.note,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Data.gov.sg sync failure";
      await this.repository.finishRun(run.id, { status: "failed", message });
      return {
        key: config.key,
        sourceId: config.sourceId,
        datasetId: config.datasetId,
        status: "failed",
        message,
      };
    }
  }

  private get client() {
    return this.options.client ?? new DataGovClient({ apiKey: process.env.DATAGOV_API_KEY });
  }

  private get repository() {
    return this.options.repository ?? new PostgisDataGovSyncRepository();
  }

  private get storage() {
    return this.options.storage ?? createSnapshotStorageAdapter();
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }
}

function snapshotObjectPath(key: string, retrievedAt: string, checksum: string, extension: "geojson" | "metadata.json") {
  const date = new Date(retrievedAt);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `datagov/${key}/${year}/${month}/${day}/${hour}${minute}${second}-${checksum.slice(0, 16)}.${extension}`;
}
