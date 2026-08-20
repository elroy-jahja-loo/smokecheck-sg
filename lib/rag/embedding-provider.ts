import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  dimensions: number;
  embed(text: string): Promise<number[]>;
}

export const STABLE_RAG_EMBEDDING_DIMENSIONS = 256;

export class DeterministicTestEmbeddingProvider implements EmbeddingProvider {
  constructor(readonly dimensions = STABLE_RAG_EMBEDDING_DIMENSIONS) {}

  async embed(text: string) {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const token of tokens) {
      const digest = createHash("sha256").update(token).digest();
      for (let i = 0; i < this.dimensions; i += 1) {
        const byte = digest[i % digest.length] ?? 0;
        vector[i] += ((byte / 255) * 2 - 1) * (((i + byte) % 2 === 0) ? 1 : -1);
      }
    }

    const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(8)));
  }
}

export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(
    private readonly options: {
      apiUrl: string;
      apiKey: string;
      model: string;
      dimensions: number;
      fetchImpl?: typeof fetch;
    } = requiredProductionOptions(),
  ) {
    this.dimensions = options.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const response = await (this.options.fetchImpl ?? fetch)(normalizeEmbeddingsUrl(this.options.apiUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        input: text,
        dimensions: this.options.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Embedding provider request failed with ${response.status}${body ? `: ${body}` : ""}`);
    }

    const payload = await response.json().catch(() => undefined) as { data?: Array<{ embedding?: number[] }> } | undefined;
    const embedding = payload?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Embedding provider returned an invalid embedding payload.");
    }
    if (embedding.length !== this.options.dimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${this.options.dimensions}, got ${embedding.length}.`);
    }
    return embedding;
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = (process.env.SMOKECHECK_RAG_EMBEDDING_PROVIDER ?? "deterministic").trim().toLowerCase();
  if (provider === "deterministic") return new DeterministicTestEmbeddingProvider();
  if (provider === "openai-compatible") return new OpenAiCompatibleEmbeddingProvider();
  throw new Error(`Unsupported SMOKECHECK_RAG_EMBEDDING_PROVIDER value: ${provider}`);
}

function requiredProductionOptions() {
  const dimensions = requirePositiveInt("RAG_EMBEDDING_DIMENSIONS");
  return {
    apiUrl: requireEnv("RAG_EMBEDDING_API_URL"),
    apiKey: requireEnv("RAG_EMBEDDING_API_KEY"),
    model: requireEnv("RAG_EMBEDDING_MODEL"),
    dimensions,
  };
}

function normalizeEmbeddingsUrl(input: string) {
  const base = input.replace(/\/$/, "");
  return base.endsWith("/embeddings") ? base : `${base}/embeddings`;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when production embedding provider mode is enabled.`);
  return value;
}

function requirePositiveInt(name: string) {
  const value = requireEnv(name);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
