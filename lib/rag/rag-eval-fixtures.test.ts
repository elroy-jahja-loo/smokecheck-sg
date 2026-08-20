import assert from "node:assert/strict";
import test from "node:test";

import { seedSourceMetadata } from "@/data/seed-source-metadata";
import { STABLE_RAG_EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/rag/embedding-provider";
import { buildChunksFromDocuments, MemoryRagVectorStore } from "@/lib/rag/vector-store";

test("semantic retrieval ranks relevant chunk over unrelated chunk with deterministic provider", async () => {
  const provider = new KeywordFixtureEmbeddingProvider();
  const chunks = await buildChunksFromDocuments([
    {
      source: seedSourceMetadata[0],
      text: "Bus stops and shelters are places where smoking is prohibited. Physical no-smoking signs remain authoritative.",
    },
    {
      source: seedSourceMetadata[6],
      text: "OneMap basemap integration details for geocoding and route display.",
    },
  ], { provider, chunkSize: 260, chunkOverlap: 60 });
  const store = new MemoryRagVectorStore(provider);
  await store.upsertChunks(chunks);

  const result = await store.search("Can I smoke at bus stops?", 1);
  assert.equal(result[0]?.sourceId, "nea-smoking-guidance");
});

test("citation coverage fixture remains 100 percent for complete chunk metadata", async () => {
  const provider = new KeywordFixtureEmbeddingProvider();
  const chunks = await buildChunksFromDocuments([
    {
      source: seedSourceMetadata[1],
      text: "Legislation references should be cited and checksum-tracked for each chunk.",
    },
  ], { provider, chunkSize: 260, chunkOverlap: 60 });
  const store = new MemoryRagVectorStore(provider);
  await store.upsertChunks(chunks);

  const topChunks = await store.search("What does legislation say about smoking controls?", 3);
  assert.equal(store.citationCoverage(topChunks), 1);
});

class KeywordFixtureEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = STABLE_RAG_EMBEDDING_DIMENSIONS;

  async embed(text: string) {
    const value = text.toLowerCase();
    const signal = [
      value.includes("bus stop") ? 1 : 0,
      value.includes("smok") ? 1 : 0,
      value.includes("shelter") ? 1 : 0,
      value.includes("legislation") ? 1 : 0,
      value.includes("law") ? 1 : 0,
      value.includes("onemap") ? 1 : 0,
      value.includes("route") ? 1 : 0,
      value.includes("geocod") ? 1 : 0,
    ];
    return [...signal, ...Array.from({ length: this.dimensions - signal.length }, () => 0)];
  }
}
