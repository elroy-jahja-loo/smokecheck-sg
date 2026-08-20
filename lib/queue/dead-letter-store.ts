import { randomUUID } from "node:crypto";

import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import type { QueueEvent, QueueEventName } from "@/lib/types";

export type DeadLetterStatus = "open" | "retried" | "resolved";

export type DeadLetterQueueRecord = {
  id: string;
  event: QueueEvent;
  provider: string;
  providerMessageId?: string;
  providerDlqId?: string;
  failureReason: string;
  retryable: boolean;
  status: DeadLetterStatus;
  createdAt: string;
  retriedAt?: string;
  resolvedAt?: string;
};

export interface DeadLetterStore {
  add(record: Omit<DeadLetterQueueRecord, "id" | "createdAt" | "retriedAt" | "resolvedAt" | "status">): Promise<DeadLetterQueueRecord>;
  upsertProviderRecord(record: Omit<DeadLetterQueueRecord, "id" | "createdAt" | "retriedAt" | "resolvedAt" | "status"> & { providerDlqId: string }): Promise<DeadLetterQueueRecord>;
  list(): Promise<DeadLetterQueueRecord[]>;
  getById(id: string): Promise<DeadLetterQueueRecord | undefined>;
  markRetried(id: string): Promise<DeadLetterQueueRecord | undefined>;
  markResolved(id: string): Promise<DeadLetterQueueRecord | undefined>;
  delete(id: string): Promise<void>;
}

const inMemoryDeadLetters = new Map<string, DeadLetterQueueRecord>();

export class InMemoryDeadLetterStore implements DeadLetterStore {
  async add(record: Omit<DeadLetterQueueRecord, "id" | "createdAt" | "retriedAt" | "resolvedAt" | "status">) {
    const created: DeadLetterQueueRecord = {
      id: randomUUID(),
      ...record,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    inMemoryDeadLetters.set(created.id, created);
    return created;
  }

  async upsertProviderRecord(record: Omit<DeadLetterQueueRecord, "id" | "createdAt" | "retriedAt" | "resolvedAt" | "status"> & { providerDlqId: string }) {
    const existing = Array.from(inMemoryDeadLetters.values()).find(
      (entry) => entry.provider === record.provider && entry.providerDlqId === record.providerDlqId,
    );
    if (existing) return existing;
    return this.add(record);
  }

  async list() {
    return Array.from(inMemoryDeadLetters.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getById(id: string) {
    return inMemoryDeadLetters.get(id);
  }

  async markRetried(id: string) {
    const record = inMemoryDeadLetters.get(id);
    if (!record) return undefined;
    const updated = { ...record, status: "retried" as const, retriedAt: new Date().toISOString() };
    inMemoryDeadLetters.set(id, updated);
    return updated;
  }

  async markResolved(id: string) {
    const record = inMemoryDeadLetters.get(id);
    if (!record) return undefined;
    const updated = { ...record, status: "resolved" as const, resolvedAt: new Date().toISOString() };
    inMemoryDeadLetters.set(id, updated);
    return updated;
  }

  async delete(id: string) {
    inMemoryDeadLetters.delete(id);
  }
}

class PostgresDeadLetterStore implements DeadLetterStore {
  async add(record: Omit<DeadLetterQueueRecord, "id" | "createdAt" | "retriedAt" | "resolvedAt" | "status">) {
    const { rows } = await getPostgisPool().query<QueueDeadLetterRow>(
      `insert into public.queue_dead_letters
         (event_name, idempotency_key, payload, occurred_at, source, provider, provider_message_id, provider_dlq_id, failure_reason, retryable, status)
       values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, 'open')
       returning *`,
      [
        record.event.name,
        record.event.idempotencyKey,
        JSON.stringify(record.event.payload ?? {}),
        record.event.occurredAt,
        record.event.source,
        record.provider,
        record.providerMessageId ?? null,
        record.providerDlqId ?? null,
        record.failureReason,
        record.retryable,
      ],
    );
    return mapRow(rows[0]);
  }

  async upsertProviderRecord(record: Omit<DeadLetterQueueRecord, "id" | "createdAt" | "retriedAt" | "resolvedAt" | "status"> & { providerDlqId: string }) {
    const { rows } = await getPostgisPool().query<QueueDeadLetterRow>(
      `insert into public.queue_dead_letters
         (event_name, idempotency_key, payload, occurred_at, source, provider, provider_message_id, provider_dlq_id, failure_reason, retryable, status)
       values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, 'open')
       on conflict (provider, provider_dlq_id) do update
         set provider_message_id = excluded.provider_message_id,
             failure_reason = excluded.failure_reason,
             retryable = excluded.retryable,
             payload = excluded.payload,
             occurred_at = excluded.occurred_at
       returning *`,
      [
        record.event.name,
        record.event.idempotencyKey,
        JSON.stringify(record.event.payload ?? {}),
        record.event.occurredAt,
        record.event.source,
        record.provider,
        record.providerMessageId ?? null,
        record.providerDlqId,
        record.failureReason,
        record.retryable,
      ],
    );
    return mapRow(rows[0]);
  }

  async list() {
    const { rows } = await getPostgisPool().query<QueueDeadLetterRow>(
      `select * from public.queue_dead_letters order by created_at desc`,
    );
    return rows.map(mapRow);
  }

  async getById(id: string) {
    const { rows } = await getPostgisPool().query<QueueDeadLetterRow>(
      `select * from public.queue_dead_letters where id = $1 limit 1`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : undefined;
  }

  async markRetried(id: string) {
    const { rows } = await getPostgisPool().query<QueueDeadLetterRow>(
      `update public.queue_dead_letters
       set status = 'retried', retried_at = now()
       where id = $1
       returning *`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : undefined;
  }

  async markResolved(id: string) {
    const { rows } = await getPostgisPool().query<QueueDeadLetterRow>(
      `update public.queue_dead_letters
       set status = 'resolved', resolved_at = now()
       where id = $1
       returning *`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : undefined;
  }

  async delete(id: string) {
    await getPostgisPool().query(`delete from public.queue_dead_letters where id = $1`, [id]);
  }
}

export function createDeadLetterStore(): DeadLetterStore {
  return hasPostgisConfig() ? new PostgresDeadLetterStore() : new InMemoryDeadLetterStore();
}

type QueueDeadLetterRow = {
  id: string;
  event_name: string;
  idempotency_key: string;
  payload: unknown;
  occurred_at: Date;
  source: string;
  provider: string;
  provider_message_id: string | null;
  provider_dlq_id: string | null;
  failure_reason: string;
  retryable: boolean;
  status: DeadLetterStatus;
  created_at: Date;
  retried_at: Date | null;
  resolved_at: Date | null;
};

function mapRow(row: QueueDeadLetterRow): DeadLetterQueueRecord {
  return {
    id: row.id,
    event: {
      name: row.event_name as QueueEventName,
      idempotencyKey: row.idempotency_key,
      payload: row.payload,
      occurredAt: row.occurred_at.toISOString(),
      source: row.source as QueueEvent["source"],
    },
    provider: row.provider,
    providerMessageId: row.provider_message_id ?? undefined,
    providerDlqId: row.provider_dlq_id ?? undefined,
    failureReason: row.failure_reason,
    retryable: row.retryable,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    retriedAt: row.retried_at?.toISOString(),
    resolvedAt: row.resolved_at?.toISOString(),
  };
}
