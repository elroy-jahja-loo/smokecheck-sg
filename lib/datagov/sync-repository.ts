import type { Pool, PoolClient } from "pg";

import { getPostgisPool } from "@/lib/db/postgis";
import type { NormalizedDataset, PublishedDatasetVersion, SyncRunRecord } from "@/lib/datagov/types";

export interface DataGovSyncRepository {
  startRun(dataset: NormalizedDataset["config"]): Promise<SyncRunRecord>;
  publishDataset(dataset: NormalizedDataset): Promise<PublishedDatasetVersion>;
  finishRun(runId: string, update: Partial<SyncRunRecord> & { status: "success" | "failed" }): Promise<void>;
}

export class PostgisDataGovSyncRepository implements DataGovSyncRepository {
  constructor(private readonly pool: Pool = getPostgisPool()) {}

  async startRun(dataset: NormalizedDataset["config"]) {
    await this.upsertSource(dataset);
    const { rows } = await this.pool.query<{
      id: string;
      source_id: string;
      dataset_id: string;
      status: "started";
      started_at: Date;
    }>(
      `insert into public.sync_runs (source_id, dataset_id, status)
       values ($1, $2, 'started')
       returning id, source_id, dataset_id, status, started_at`,
      [dataset.sourceId, dataset.datasetId],
    );

    return {
      id: rows[0].id,
      sourceId: rows[0].source_id,
      datasetId: rows[0].dataset_id,
      status: rows[0].status,
      startedAt: rows[0].started_at.toISOString(),
    };
  }

  async publishDataset(dataset: NormalizedDataset) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.upsertSource(dataset.config, client);
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [dataset.config.sourceId]);

      const existing = await client.query<{ id: string; source_id: string; dataset_id: string; checksum: string }>(
        `select id, source_id, dataset_id, checksum
         from public.dataset_versions
         where source_id = $1 and checksum = $2
         limit 1`,
        [dataset.config.sourceId, dataset.checksum],
      );
      if (existing.rows[0]) {
        await client.query(`update public.dataset_versions set is_active = (id = $2) where source_id = $1`, [dataset.config.sourceId, existing.rows[0].id]);
        await client.query("commit");
        return { ...existing.rows[0], sourceId: existing.rows[0].source_id, datasetId: existing.rows[0].dataset_id, isActive: true } satisfies PublishedDatasetVersion;
      }

      const { rows } = await client.query<{ id: string; source_id: string; dataset_id: string; checksum: string; is_active: boolean }>(
        `insert into public.dataset_versions (
           source_id, dataset_id, dataset_name, retrieved_at, source_last_updated,
           checksum, feature_count, storage_path, metadata_storage_path, is_active
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
         returning id, source_id, dataset_id, checksum, is_active`,
        [
          dataset.config.sourceId,
          dataset.config.datasetId,
          dataset.config.datasetName,
          dataset.retrievedAt,
          dataset.sourceLastUpdated,
          dataset.checksum,
          dataset.featureCount,
          dataset.storagePath,
          dataset.metadataStoragePath,
        ],
      );

      const version = rows[0];
      for (const area of dataset.designatedAreas) {
        await client.query(
          `insert into public.designated_areas (
             id, dataset_version_id, object_id, building_name, description, photo_url,
             source_updated_at, location, raw_properties
           ) values ($1, $2, $3, $4, $5, $6, $7, extensions.st_setsrid(extensions.st_makepoint($8, $9), 4326)::extensions.geography, $10::jsonb)`,
          [
            area.id,
            version.id,
            area.objectId,
            area.buildingName,
            area.description,
            area.photoUrl,
            area.sourceUpdatedAt,
            area.lng,
            area.lat,
            JSON.stringify(area.rawProperties),
          ],
        );
      }

      for (const zone of dataset.prohibitedZones) {
        await client.query(
          `insert into public.prohibited_zones (
             id, dataset_version_id, object_id, name, zone_type, source_updated_at,
             geometry, raw_properties
           ) values ($1, $2, $3, $4, $5, $6, extensions.st_geomfromgeojson($7)::extensions.geography, $8::jsonb)`,
          [
            zone.id,
            version.id,
            zone.objectId,
            zone.name,
            zone.zoneType,
            zone.sourceUpdatedAt,
            JSON.stringify(zone.geometry),
            JSON.stringify(zone.rawProperties),
          ],
        );
      }

      await client.query(`update public.dataset_versions set is_active = false where source_id = $1 and id <> $2`, [dataset.config.sourceId, version.id]);
      await client.query(`update public.dataset_versions set is_active = true where id = $1`, [version.id]);
      await client.query("commit");

      return {
        id: version.id,
        sourceId: version.source_id,
        datasetId: version.dataset_id,
        checksum: version.checksum,
        isActive: true,
      } satisfies PublishedDatasetVersion;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async finishRun(runId: string, update: Partial<SyncRunRecord> & { status: "success" | "failed" }) {
    await this.pool.query(
      `update public.sync_runs
       set status = $2,
           finished_at = now(),
           message = $3,
           feature_count = $4,
           checksum = $5,
           storage_path = $6,
           metadata_storage_path = $7,
           dataset_version_id = $8
       where id = $1`,
      [
        runId,
        update.status,
        update.message,
        update.featureCount,
        update.checksum,
        update.storagePath,
        update.metadataStoragePath,
        update.datasetVersionId,
      ],
    );
  }

  private async upsertSource(dataset: NormalizedDataset["config"], client?: PoolClient) {
    const executor = client ?? this.pool;
    await executor.query(
      `insert into public.source_metadata (id, name, agency, source_url, authority, is_official, notes)
       values ($1, $2, $3, $4, 'open-data', true, $5)
       on conflict (id) do update set
         name = excluded.name,
         agency = excluded.agency,
         source_url = excluded.source_url,
         authority = excluded.authority,
         is_official = excluded.is_official,
         notes = excluded.notes,
         updated_at = now()`,
      [dataset.sourceId, dataset.datasetName, dataset.agency, dataset.sourceUrl, dataCaveat(dataset.key)],
    );
  }
}

function dataCaveat(key: NormalizedDataset["config"]["key"]) {
  if (key === "nsz") return "Data.gov.sg NEA No Smoking Zones; source page notes this dataset may be outdated.";
  if (key === "nparks-no-smoking") return "Data.gov.sg NParks no-smoking polygons; large dataset served through PostGIS, not shipped wholesale to the browser.";
  return "Data.gov.sg Designated Smoking Areas; source snapshots retained with checksum provenance.";
}
