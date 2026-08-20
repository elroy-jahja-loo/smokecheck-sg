import { createHash } from "node:crypto";

import type { QueueEvent, QueueEventName } from "@/lib/types";
import { createDeadLetterStore, type DeadLetterQueueRecord, type DeadLetterStore } from "@/lib/queue/dead-letter-store";

export const queueEventNames = {
  officerReportSubmitted: "officer.report.submitted",
  auditEventCreated: "audit.event.created",
  datasetSyncRequested: "dataset.sync.requested",
  datasetSyncFailed: "dataset.sync.failed",
  tileGenerationRequested: "tile.generation.requested",
  webhookHandoffRetry: "webhook.handoff.retry",
  ragIngestionRequested: "rag.ingestion.requested",
  analyticsEvent: "analytics.event.submitted",
  upstreamApiFailed: "upstream.api.failed",
} as const satisfies Record<string, QueueEventName>;

export interface QueueAdapter {
  publish<TPayload>(event: QueueEvent<TPayload>): Promise<void>;
  listPublished(): Promise<QueueEvent[]>;
  listDeadLetters(): Promise<DeadLetterQueueRecord[]>;
  retryDeadLetter(id: string): Promise<DeadLetterQueueRecord | undefined>;
  resolveDeadLetter(id: string): Promise<DeadLetterQueueRecord | undefined>;
  deleteDeadLetter(id: string): Promise<void>;
  syncProviderDeadLetters?(): Promise<number>;
}

const publishedEvents: QueueEvent[] = [];

export class InMemoryQueueAdapter implements QueueAdapter {
  constructor(private readonly deadLetters: DeadLetterStore = createDeadLetterStore()) {}

  async publish<TPayload>(event: QueueEvent<TPayload>) {
    publishedEvents.push(event as QueueEvent);
  }

  async listPublished() {
    return publishedEvents;
  }

  async listDeadLetters() {
    return this.deadLetters.list();
  }

  async retryDeadLetter(id: string) {
    const record = await this.deadLetters.getById(id);
    if (!record) return undefined;
    if (record.retryable) await this.publish(record.event);
    return this.deadLetters.markRetried(id);
  }

  async resolveDeadLetter(id: string) {
    return this.deadLetters.markResolved(id);
  }

  async deleteDeadLetter(id: string) {
    await this.deadLetters.delete(id);
  }
}

export type PublishedQueueRecord = QueueEvent & {
  provider?: string;
  providerMessageId?: string;
};

export class QStashQueueAdapter implements QueueAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly destinationUrl: string,
    private readonly deadLetters: DeadLetterStore = createDeadLetterStore(),
  ) {}

  async publish<TPayload>(event: QueueEvent<TPayload>) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v2/publish/${encodeURIComponent(this.destinationUrl)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Upstash-Forward-Queue-Event": event.name,
          "Upstash-Forward-Idempotency-Key": event.idempotencyKey,
          "Upstash-Deduplication-Id": createHash("sha256").update(`${event.name}:${event.idempotencyKey}`).digest("hex"),
          "Upstash-Retries": "3",
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      await this.deadLetters.add({
        event: event as QueueEvent,
        provider: "qstash_publish",
        failureReason: error instanceof Error ? error.message : "QStash publish transport failed",
        retryable: true,
      });
      throw error;
    }
    const payload = await response.json().catch(() => undefined) as { messageId?: string; error?: string } | undefined;
    if (!response.ok || payload?.error) {
      await this.deadLetters.add({
        event: event as QueueEvent,
        provider: "qstash_publish",
        providerMessageId: payload?.messageId,
        failureReason: payload?.error ?? `QStash publish failed with ${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      });
      throw new Error(payload?.error ?? `QStash publish failed with ${response.status}`);
    }
    publishedEvents.push({ ...event, provider: "qstash", providerMessageId: payload?.messageId } as PublishedQueueRecord);
  }

  async listPublished() {
    return publishedEvents;
  }

  async listDeadLetters() {
    await this.syncProviderDeadLetters().catch(() => undefined);
    return this.deadLetters.list();
  }

  async retryDeadLetter(id: string) {
    const record = await this.deadLetters.getById(id);
    if (!record) return undefined;

    if (record.provider === "qstash_dlq" && record.providerDlqId) {
      await this.retryProviderDlqMessage(record.providerDlqId);
    } else if (record.retryable) {
      await this.publish(record.event);
    }

    return this.deadLetters.markRetried(id);
  }

  async resolveDeadLetter(id: string) {
    const record = await this.deadLetters.getById(id);
    if (!record) return undefined;
    if (record.provider === "qstash_dlq" && record.providerDlqId) {
      await this.deleteProviderDlqMessage(record.providerDlqId);
    }
    return this.deadLetters.markResolved(id);
  }

  async deleteDeadLetter(id: string) {
    const record = await this.deadLetters.getById(id);
    if (record?.provider === "qstash_dlq" && record.providerDlqId) {
      await this.deleteProviderDlqMessage(record.providerDlqId);
    }
    await this.deadLetters.delete(id);
  }

  async syncProviderDeadLetters() {
    const providerRecords = await this.fetchProviderDeadLetters();
    for (const providerRecord of providerRecords) {
      await this.deadLetters.upsertProviderRecord(providerRecord);
    }
    return providerRecords.length;
  }

  private async fetchProviderDeadLetters() {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v2/dlq?count=50`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      if (response.status === 404 || response.status === 403) return [];
      throw new Error(`QStash DLQ list failed with ${response.status}`);
    }
    const payload = await response.json().catch(() => undefined) as {
      messages?: Array<{
        dlqId?: string;
        messageId?: string;
        body?: string;
        topicName?: string;
        url?: string;
        maxRetries?: number;
        retried?: number;
        createdAt?: string;
        reason?: string;
      }>;
    } | undefined;

    return (payload?.messages ?? []).flatMap((message) => {
      if (!message.dlqId || !message.body) return [];
      const parsed = parseQueueEventJson(message.body);
      if (!parsed) return [];
      return [{
        event: parsed,
        provider: "qstash_dlq",
        providerMessageId: message.messageId,
        providerDlqId: message.dlqId,
        failureReason: message.reason ?? "QStash moved message to DLQ after retry exhaustion.",
        retryable: true,
      }];
    });
  }

  private async retryProviderDlqMessage(dlqId: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v2/dlq/${encodeURIComponent(dlqId)}/retry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`QStash DLQ retry failed with ${response.status}`);
  }

  private async deleteProviderDlqMessage(dlqId: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v2/dlq/${encodeURIComponent(dlqId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`QStash DLQ delete failed with ${response.status}`);
    }
  }
}

export function createQueueEvent<TPayload>(name: QueueEventName, idempotencyKey: string, payload: TPayload): QueueEvent<TPayload> {
  return {
    name,
    idempotencyKey,
    payload,
    occurredAt: new Date().toISOString(),
    source: "smokecheck-sg-prototype",
  };
}

function createQueueAdapter() {
  const token = process.env.QSTASH_TOKEN?.replace(/^"|"$/g, "");
  const baseUrl = process.env.QSTASH_URL?.replace(/^"|"$/g, "") || "https://qstash.upstash.io";
  const configuredDestination = process.env.QSTASH_PUBLISH_DESTINATION_URL?.replace(/^"|"$/g, "");
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/^"|"$/g, "");
  const fallbackDestination = isHttpUrl(publicAppUrl) && !publicAppUrl.includes("localhost")
    ? `${publicAppUrl.replace(/\/$/, "")}/api/queue/events`
    : "https://smokecheck-sg.vercel.app/api/queue/events";
  if (!token) return { adapter: new InMemoryQueueAdapter(), provider: "in_memory" as const, destinationUrl: undefined };
  const destinationUrl = isHttpUrl(configuredDestination) ? configuredDestination : fallbackDestination;
  return { adapter: new QStashQueueAdapter(baseUrl, token, destinationUrl), provider: "qstash" as const, destinationUrl };
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const queue = createQueueAdapter();

export const queueAdapter: QueueAdapter = queue.adapter;
export const queueProvider = queue.provider;

function parseQueueEventJson(value: string) {
  try {
    const payload = JSON.parse(value) as Partial<QueueEvent>;
    if (!payload.name || !payload.idempotencyKey || !payload.occurredAt || !payload.source) return undefined;
    return payload as QueueEvent;
  } catch {
    return undefined;
  }
}
