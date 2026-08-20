import type { DataGovSyncRepository } from "@/lib/datagov/sync-repository";
import type { NormalizedDataset, PublishedDatasetVersion, SyncRunRecord } from "@/lib/datagov/types";

export class MemoryDataGovSyncRepository implements DataGovSyncRepository {
  readonly runs: SyncRunRecord[] = [];
  readonly versions: PublishedDatasetVersion[] = [];
  failPublish = false;

  async startRun(dataset: NormalizedDataset["config"]) {
    const run: SyncRunRecord = {
      id: `run-${this.runs.length + 1}`,
      sourceId: dataset.sourceId,
      datasetId: dataset.datasetId,
      status: "started",
      startedAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
    };
    this.runs.push(run);
    return run;
  }

  async publishDataset(dataset: NormalizedDataset) {
    if (this.failPublish) throw new Error("fixture publish failure");

    for (const version of this.versions) {
      if (version.sourceId === dataset.config.sourceId) version.isActive = false;
    }

    const version: PublishedDatasetVersion = {
      id: `version-${this.versions.length + 1}`,
      sourceId: dataset.config.sourceId,
      datasetId: dataset.config.datasetId,
      checksum: dataset.checksum,
      isActive: true,
    };
    this.versions.push(version);
    return version;
  }

  async finishRun(runId: string, update: Partial<SyncRunRecord> & { status: "success" | "failed" }) {
    const run = this.runs.find((entry) => entry.id === runId);
    if (!run) throw new Error(`Missing sync run ${runId}`);
    Object.assign(run, update, { finishedAt: new Date("2026-07-07T00:01:00.000Z").toISOString() });
  }
}
