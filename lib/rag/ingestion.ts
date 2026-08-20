import { readFile } from "node:fs/promises";
import path from "node:path";

import { ragSourceDocuments } from "@/data/rag-source-documents";
import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import type { RagIngestionDocument } from "@/lib/rag/vector-store";
import type { SourceMetadata } from "@/lib/types";

export async function collectRagIngestionDocuments(sources: SourceMetadata[]) {
  const documents: RagIngestionDocument[] = [];
  for (const source of sources) {
    const sourceText = ragSourceDocuments[source.id] ?? `${source.name}. ${source.versionLabel ?? ""}`;
    documents.push({ source, text: sourceText });
  }

  const snapshots = await collectSnapshotDocuments(sources);
  documents.push(...snapshots);
  return documents;
}

async function collectSnapshotDocuments(sources: SourceMetadata[]) {
  if (!hasPostgisConfig()) return [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const { rows } = await getPostgisPool().query<{
    source_id: string;
    dataset_name: string;
    retrieved_at: Date;
    source_last_updated: string | null;
    checksum: string;
    feature_count: number;
    storage_path: string;
    metadata_storage_path: string | null;
  }>(
    `select source_id, dataset_name, retrieved_at, source_last_updated, checksum, feature_count, storage_path, metadata_storage_path
     from public.dataset_versions
     where is_active
     order by retrieved_at desc`,
  );

  const documents: RagIngestionDocument[] = [];
  for (const row of rows) {
    const source = sourceById.get(row.source_id);
    if (!source) continue;

    const snapshotText = await readSnapshotText(row.storage_path);
    const metadataText = row.metadata_storage_path ? await readSnapshotText(row.metadata_storage_path) : "";
    const text = [
      `Active dataset snapshot for ${source.name}.`,
      `Dataset name: ${row.dataset_name}.`,
      `Retrieved at: ${row.retrieved_at.toISOString()}.`,
      `Source last updated: ${row.source_last_updated ?? "unknown"}.`,
      `Feature count: ${row.feature_count}.`,
      `Checksum: ${row.checksum}.`,
      snapshotText ? `Snapshot excerpt:\n${snapshotText}` : "",
      metadataText ? `Metadata excerpt:\n${metadataText}` : "",
    ].filter(Boolean).join("\n\n");

    documents.push({ source, text });
  }
  return documents;
}

async function readSnapshotText(storagePath: string) {
  const localPath = toLocalSnapshotFile(storagePath);
  if (!localPath) return "";
  try {
    const body = await readFile(localPath, "utf8");
    return body.slice(0, 8_000);
  } catch {
    return "";
  }
}

function toLocalSnapshotFile(storagePath: string) {
  if (!storagePath.startsWith("local://")) return undefined;
  const relative = storagePath.slice("local://".length).replace(/^\/+/, "");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), relative);
}
