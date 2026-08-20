import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmbeddingProvider,
  DeterministicTestEmbeddingProvider,
  OpenAiCompatibleEmbeddingProvider,
  STABLE_RAG_EMBEDDING_DIMENSIONS,
} from "@/lib/rag/embedding-provider";

test("deterministic embedding provider returns stable configured dimensions", async () => {
  const provider = new DeterministicTestEmbeddingProvider();
  const embedding = await provider.embed("Bus stop smoking restrictions guidance");

  assert.equal(provider.dimensions, STABLE_RAG_EMBEDDING_DIMENSIONS);
  assert.equal(embedding.length, STABLE_RAG_EMBEDDING_DIMENSIONS);
});

test("openai-compatible provider fails closed when required env is missing", () => {
  withEnvironment({
    SMOKECHECK_RAG_EMBEDDING_PROVIDER: "openai-compatible",
    RAG_EMBEDDING_API_URL: undefined,
    RAG_EMBEDDING_API_KEY: undefined,
    RAG_EMBEDDING_MODEL: undefined,
    RAG_EMBEDDING_DIMENSIONS: undefined,
  }, () => {
    assert.throws(() => createEmbeddingProvider(), /is required when production embedding provider mode is enabled/);
  });
});

test("openai-compatible provider validates embedding dimension", async () => {
  const provider = new OpenAiCompatibleEmbeddingProvider({
    apiUrl: "https://example.test/v1",
    apiKey: "token",
    model: "text-embedding-3-large",
    dimensions: STABLE_RAG_EMBEDDING_DIMENSIONS,
    fetchImpl: async () => Response.json({
      data: [{ embedding: Array.from({ length: STABLE_RAG_EMBEDDING_DIMENSIONS }, (_, index) => index / 1000) }],
    }),
  });

  const embedding = await provider.embed("Smoking prohibited at bus stops");
  assert.equal(embedding.length, STABLE_RAG_EMBEDDING_DIMENSIONS);
});

test("openai-compatible provider rejects mismatched embedding dimensions", async () => {
  const provider = new OpenAiCompatibleEmbeddingProvider({
    apiUrl: "https://example.test/v1",
    apiKey: "token",
    model: "text-embedding-3-large",
    dimensions: STABLE_RAG_EMBEDDING_DIMENSIONS,
    fetchImpl: async () => Response.json({
      data: [{ embedding: Array.from({ length: 64 }, () => 0.1) }],
    }),
  });

  await assert.rejects(() => provider.embed("bus stop"), /Embedding dimension mismatch/);
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
