import type { OfficerReportDraft, OfficerReportHandoffRecord } from "@/lib/types";
import { createQueueEvent, queueAdapter, queueEventNames, type QueueAdapter } from "@/lib/queue/queue-adapter";

export interface ReportHandoffStore {
  get(idempotencyKey: string): Promise<OfficerReportHandoffRecord | undefined>;
  save(record: OfficerReportHandoffRecord): Promise<void>;
}

export interface ReportHandoffService {
  submit(draft: OfficerReportDraft): Promise<OfficerReportHandoffRecord>;
}

const reportStore = new Map<string, OfficerReportHandoffRecord>();

class InMemoryReportHandoffStore implements ReportHandoffStore {
  async get(idempotencyKey: string) {
    return reportStore.get(idempotencyKey);
  }

  async save(record: OfficerReportHandoffRecord) {
    reportStore.set(record.idempotencyKey, record);
  }
}

export class PrototypeReportHandoffService implements ReportHandoffService {
  constructor(
    private readonly store: ReportHandoffStore = new InMemoryReportHandoffStore(),
    private readonly queue: QueueAdapter = queueAdapter,
  ) {}

  async submit(draft: OfficerReportDraft): Promise<OfficerReportHandoffRecord> {
    const existing = await this.store.get(draft.idempotencyKey);
    if (existing) return { ...existing, status: "duplicate" as const };

    const acceptedAt = new Date().toISOString();
    const record: OfficerReportHandoffRecord = {
      ...draft,
      handoffId: `handoff_${stableHash(draft.idempotencyKey)}`,
      status: "accepted",
      acceptedAt,
      eventName: queueEventNames.officerReportSubmitted,
      auditEventName: queueEventNames.auditEventCreated,
      handoffUrl: "https://form.gov.sg/prototype-smokecheck-handoff",
    };

    await this.store.save(record);
    await Promise.all([
      this.queue.publish(createQueueEvent(queueEventNames.officerReportSubmitted, draft.idempotencyKey, redactReportPayload(record))),
      this.queue.publish(createQueueEvent(queueEventNames.auditEventCreated, `audit:${draft.idempotencyKey}`, {
        handoffId: record.handoffId,
        action: "officer_report_handoff_accepted",
        occurredAt: acceptedAt,
        note: "Precise coordinates and free-text notes are redacted from prototype audit payload.",
      })),
    ]).catch(() => undefined);

    return record;
  }
}

function redactReportPayload(record: OfficerReportHandoffRecord) {
  return {
    handoffId: record.handoffId,
    status: record.status,
    boundaryStatus: record.boundaryStatus,
    incidentType: record.incidentType,
    occurredAt: record.occurredAt,
    acceptedAt: record.acceptedAt,
    isPrototype: record.isPrototype,
  };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export const reportHandoffService: ReportHandoffService = new PrototypeReportHandoffService();
