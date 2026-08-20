import { createHash } from "node:crypto";

import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import {
  createEmbeddingProvider,
  STABLE_RAG_EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
} from "@/lib/rag/embedding-provider";
import type { SourceAuthority, SourceMetadata } from "@/lib/types";

export type RagDocumentChunk = {
  chunkId: string;
  sourceId: string;
  sourceUrl: string;
  sourceVersion?: string;
  retrievedAt: string;
  authority: SourceAuthority;
  checksum: string;
  content: string;
  embedding: number[];
};

export type RagIngestionDocument = {
  source: SourceMetadata;
  text: string;
};

export interface RagVectorStore {
  upsertChunks(chunks: RagDocumentChunk[]): Promise<void>;
  search(question: string, limit: number): Promise<RagDocumentChunk[]>;
  citationCoverage(chunks: RagDocumentChunk[]): number;
}

const memoryChunks = new Map<string, RagDocumentChunk>();

class PostgresRagVectorStore implements RagVectorStore {
  constructor(private readonly embeddingProvider: EmbeddingProvider = createEmbeddingProvider()) {}

  async upsertChunks(chunks: RagDocumentChunk[]) {
    if (chunks.length === 0) return;
    const pool = getPostgisPool();
    for (const chunk of chunks) {
      await pool.query(
        `insert into public.rag_document_chunks
           (chunk_id, source_id, source_url, source_version, retrieved_at, authority, checksum, content, embedding)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::extensions.vector)
         on conflict (chunk_id) do update set
           source_id = excluded.source_id,
           source_url = excluded.source_url,
           source_version = excluded.source_version,
           retrieved_at = excluded.retrieved_at,
           authority = excluded.authority,
           checksum = excluded.checksum,
           content = excluded.content,
           embedding = excluded.embedding,
           updated_at = now()`,
        [
          chunk.chunkId,
          chunk.sourceId,
          chunk.sourceUrl,
          chunk.sourceVersion ?? null,
          chunk.retrievedAt,
          chunk.authority,
          chunk.checksum,
          chunk.content,
          `[${chunk.embedding.join(",")}]`,
        ],
      );
    }
  }

  async search(question: string, limit: number) {
    const queryEmbedding = await this.embeddingProvider.embed(question);
    assertEmbeddingDimensions(queryEmbedding.length, this.embeddingProvider.dimensions);
    const embedding = `[${queryEmbedding.join(",")}]`;
    const { rows } = await getPostgisPool().query<{
      chunk_id: string;
      source_id: string;
      source_url: string;
      source_version: string | null;
      retrieved_at: Date;
      authority: SourceAuthority;
      checksum: string;
      content: string;
      embedding: string;
    }>(
      `select chunk_id, source_id, source_url, source_version, retrieved_at, authority, checksum, content, embedding::text as embedding
       from public.rag_document_chunks
        order by embedding <=> $1::extensions.vector
       limit $2`,
      [embedding, limit],
    );
    return rows.map((row) => ({
      chunkId: row.chunk_id,
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      sourceVersion: row.source_version ?? undefined,
      retrievedAt: row.retrieved_at.toISOString(),
      authority: row.authority,
      checksum: row.checksum,
      content: row.content,
      embedding: parseVector(row.embedding),
    }));
  }

  citationCoverage(chunks: RagDocumentChunk[]) {
    return citationCoverage(chunks);
  }
}

export class MemoryRagVectorStore implements RagVectorStore {
  constructor(private readonly embeddingProvider: EmbeddingProvider = createEmbeddingProvider()) {}

  async upsertChunks(chunks: RagDocumentChunk[]) {
    for (const chunk of chunks) memoryChunks.set(chunk.chunkId, { ...chunk });
  }

  async search(question: string, limit: number) {
    const queryEmbedding = await this.embeddingProvider.embed(question);
    return Array.from(memoryChunks.values())
      .map((chunk) => ({ chunk, distance: cosineDistance(queryEmbedding, chunk.embedding) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit)
      .map((entry) => entry.chunk);
  }

  citationCoverage(chunks: RagDocumentChunk[]) {
    return citationCoverage(chunks);
  }
}

export function createRagVectorStore(): RagVectorStore {
  const embeddingProvider = createEmbeddingProvider();
  return hasPostgisConfig() && process.env.ENABLE_PGVECTOR_RAG === "true"
    ? new PostgresRagVectorStore(embeddingProvider)
    : new MemoryRagVectorStore(embeddingProvider);
}

async function buildChunk(input: Omit<RagDocumentChunk, "checksum" | "embedding">, provider = createEmbeddingProvider()): Promise<RagDocumentChunk> {
  const embedding = await provider.embed(input.content);
  assertEmbeddingDimensions(embedding.length, provider.dimensions);
  return {
    ...input,
    checksum: createHash("sha256").update(input.content).digest("hex"),
    embedding,
  };
}

export async function buildChunksFromDocuments(
  documents: RagIngestionDocument[],
  options: { chunkSize?: number; chunkOverlap?: number; provider?: EmbeddingProvider } = {},
) {
  const chunkSize = Math.max(240, options.chunkSize ?? 480);
  const chunkOverlap = Math.max(40, options.chunkOverlap ?? 80);
  if (chunkOverlap >= chunkSize) throw new Error("chunkOverlap must be smaller than chunkSize.");
  const provider = options.provider ?? createEmbeddingProvider();

  const chunks: RagDocumentChunk[] = [];
  for (const document of documents) {
    const slices = chunkText(document.text, chunkSize, chunkOverlap);
    for (const [index, content] of slices.entries()) {
      chunks.push(await buildChunk({
        chunkId: `${document.source.id}:${index + 1}`,
        sourceId: document.source.id,
        sourceUrl: document.source.url,
        sourceVersion: document.source.versionLabel,
        retrievedAt: document.source.retrievedAt,
        authority: document.source.authority,
        content,
      }, provider));
    }
  }
  return chunks;
}

function chunkText(text: string, chunkSize: number, chunkOverlap: number) {
  const sanitized = text.replace(/\r\n/g, "\n").trim();
  if (!sanitized) return [];
  const normalized = sanitized.replace(/\n{3,}/g, "\n\n");
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    let boundary = findBoundary(normalized, start, end);
    if (boundary <= start) boundary = end;
    const section = normalized.slice(start, boundary).trim();
    if (section) chunks.push(section);
    if (boundary >= normalized.length) break;
    start = Math.max(0, boundary - chunkOverlap);
  }
  return chunks;
}

function findBoundary(text: string, start: number, end: number) {
  const paragraphBreak = text.lastIndexOf("\n\n", end);
  if (paragraphBreak > start + 80) return paragraphBreak;
  const sentenceBoundary = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("\n", end));
  if (sentenceBoundary > start + 80) return sentenceBoundary + 1;
  return end;
}

function citationCoverage(chunks: RagDocumentChunk[]) {
  if (chunks.length === 0) return 0;
  return chunks.filter((chunk) => chunk.sourceUrl && chunk.sourceId && chunk.checksum && chunk.chunkId).length / chunks.length;
}

function cosineDistance(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1;
  return 1 - dot / denominator;
}

function parseVector(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed.slice(1, -1).split(",").map((entry) => Number(entry.trim())).filter(Number.isFinite);
}

function assertEmbeddingDimensions(actual: number, providerDimensions: number) {
  if (actual !== providerDimensions) {
    throw new Error(`RAG embedding dimensions mismatch: expected provider dimension ${providerDimensions}, got ${actual}.`);
  }
  if (actual !== STABLE_RAG_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `RAG embedding dimensions mismatch: expected ${STABLE_RAG_EMBEDDING_DIMENSIONS} to match rag_document_chunks.embedding dimension, got ${actual}.`,
    );
  }
}
