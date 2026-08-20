import { createSourceRepository } from "../lib/data/source-repository";
import { createEmbeddingProvider } from "../lib/rag/embedding-provider";
import { collectRagIngestionDocuments } from "../lib/rag/ingestion";
import { buildChunksFromDocuments, createRagVectorStore } from "../lib/rag/vector-store";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const repository = createSourceRepository();
  const vectorStore = createRagVectorStore();
  const embeddingProvider = createEmbeddingProvider();

  const sources = await repository.listSources();
  const documents = await collectRagIngestionDocuments(sources);
  const chunks = await buildChunksFromDocuments(documents, { provider: embeddingProvider });

  if (!dryRun) {
    await vectorStore.upsertChunks(chunks);
  }

  console.log(JSON.stringify({
    dryRun,
    embeddingProvider: process.env.SMOKECHECK_RAG_EMBEDDING_PROVIDER ?? "deterministic",
    embeddingDimensions: embeddingProvider.dimensions,
    documents: documents.length,
    chunks: chunks.length,
    chunkIds: chunks.slice(0, 10).map((chunk) => chunk.chunkId),
  }, null, 2));
}

void main();
