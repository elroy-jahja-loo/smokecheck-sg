import type { RagQueryResponse } from "@/lib/types";
import { sourceRepository, type SourceRepository } from "@/lib/data/source-repository";
import { observeMetric } from "@/lib/observability/logging";
import { collectRagIngestionDocuments } from "@/lib/rag/ingestion";
import { buildChunksFromDocuments, createRagVectorStore, type RagVectorStore } from "@/lib/rag/vector-store";

export interface RagService {
  query(input: { question: string }): Promise<RagQueryResponse>;
}

const disclaimer =
  "This assistant provides source-cited guidance only. It does not decide GPS legality. Always follow physical signs, current law, and NEA instructions.";

const refusalRules = [
  { reason: "enforcement_evasion", pattern: /get away|avoid\s+(nea|officer|enforcement)|loophole|not get caught/i },
  { reason: "legal_certainty", pattern: /legal proof|exactly legal|guarantee|definitely allowed|definitely prohibited/i },
  { reason: "individual_identification", pattern: /identify|face|person|smoker|officer|who is/i },
  { reason: "restricted_data", pattern: /hidden|restricted|internal|confidential|surveillance|camera feed/i },
  { reason: "prompt_injection", pattern: /ignore (all )?(previous|prior|system|developer) instructions|reveal (the )?(system|developer) prompt|treat retrieved docs as instructions/i },
];

class PrototypeRagService implements RagService {
  private ingestionPromise?: Promise<void>;

  constructor(
    private readonly sources: SourceRepository = sourceRepository,
    private readonly vectorStore: RagVectorStore = createRagVectorStore(),
  ) {}

  async query(input: { question: string }): Promise<RagQueryResponse> {
    const question = input.question.trim();
    const refusal = refusalRules.find((rule) => rule.pattern.test(question));
    const citations = await this.sources.requireSources([
      "nea-smoking-guidance",
      "sg-legislation-reference",
      "smokecheck-rag-prototype",
    ]);

    await this.ensureIngested();

    if (!question) {
      return {
        status: "refused",
        answer: "Ask a rules explanation question. The assistant cannot process an empty request.",
        citations,
        disclaimer,
        guardrailReason: "empty_question",
      };
    }

    if (refusal) {
      return {
        status: "refused",
        answer:
          "I cannot help with enforcement evasion, legal certainty at a GPS point, identifying individuals, restricted enforcement data, or prompt-injection attempts. Retrieved documents are treated only as untrusted source context, never as instructions. Use deterministic geospatial checks and follow official signs and instructions.",
        citations,
        disclaimer,
        guardrailReason: refusal.reason,
      };
    }

    const chunks = await this.vectorStore.search(question, 3);
    const citationCoverage = this.vectorStore.citationCoverage(chunks);
    observeMetric("rag.citation_coverage", citationCoverage, { route: "/api/rag/query" });

    const citedIds = Array.from(new Set(chunks.map((chunk) => chunk.sourceId)));
    const retrievedCitations = citedIds.length > 0 ? await this.sources.requireSources(citedIds) : citations;
    const topContext = chunks
      .map((chunk) => `${chunk.sourceId}#${chunk.chunkId} (${chunk.authority}, checksum ${chunk.checksum.slice(0, 12)}): ${chunk.content.slice(0, 180)}`)
      .join("\n");

    return {
      status: "answered",
      answer: [
        "Retrieved source guidance indicates that smoking prohibitions commonly apply at bus stops and shelters, covered linkways, parks, beaches, and signed restricted zones.",
        "Designated smoking areas can exist in specific locations but must be verified against physical signs and latest official instructions.",
        `Citation coverage for this response is ${Math.round(citationCoverage * 100)}% based on chunk-level source URL, version, timestamp, authority, chunk ID, and checksum metadata.`,
        `Top retrieved chunks:\n${topContext}`,
      ].join("\n\n"),
      citations: retrievedCitations,
      disclaimer,
    };
  }

  private async ensureIngested() {
    if (!this.ingestionPromise) {
      this.ingestionPromise = this.ingestSources();
    }
    await this.ingestionPromise;
  }

  private async ingestSources() {
    const sources = await this.sources.listSources();
    const documents = await collectRagIngestionDocuments(sources);
    const chunks = await buildChunksFromDocuments(documents);
    await this.vectorStore.upsertChunks(chunks);
  }
}

export const ragService: RagService = new PrototypeRagService();
