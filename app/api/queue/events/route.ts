import { jsonResponse } from "@/lib/http";
import { queueEventNames } from "@/lib/queue/queue-adapter";
import { claimQueueDelivery, completeQueueDelivery } from "@/lib/queue/delivery-receipts";
import { processQueueEvent } from "@/lib/queue/event-processor";
import { verifyQStashRequest } from "@/lib/queue/qstash-signature";
import { logEvent, observeMetric } from "@/lib/observability/logging";
import type { QueueEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const clone = request.clone();
  const body = await clone.text();
  
  const expectedUrl = process.env.QSTASH_PUBLISH_DESTINATION_URL ?? request.url;
  const verified = await verifyQStashRequest(request, body, expectedUrl);
  if (!verified) {
    logEvent("warn", "queue.events.unverified", {
      hasSignature: Boolean(request.headers.get("upstash-signature")),
    });
    return jsonResponse({ error: "unauthorized", message: "QStash signature verification required." }, { status: 401 });
  }

  const parsed = await parseQueueEvent(body);
  if (!parsed) return jsonResponse({ error: "bad_request", message: "Invalid queue event." }, { status: 400 });

  try {
    const deliveryKey = `${parsed.name}:${parsed.idempotencyKey}`;
    const claim = await claimQueueDelivery(deliveryKey, parsed.name, request.headers.get("upstash-message-id") ?? undefined);
    if (claim.status === "completed") {
      return jsonResponse({ accepted: true, duplicate: true, eventName: parsed.name, idempotencyKey: parsed.idempotencyKey });
    }
    if (claim.status === "busy") {
      return jsonResponse({ error: "delivery_in_progress" }, { status: 503, headers: { "Retry-After": "5" } });
    }

    const completedAtomically = await processQueueEvent(parsed, deliveryKey, claim.owner);
    observeMetric("queue.events.received", 1, { event_name: parsed.name });
    logEvent("info", "queue.events.consumed", {
      eventName: parsed.name,
      idempotencyKey: parsed.idempotencyKey,
      providerMessageId: request.headers.get("upstash-message-id"),
    });
    if (!completedAtomically) await completeQueueDelivery(deliveryKey, claim.owner);
    return jsonResponse({ accepted: true, eventName: parsed.name, idempotencyKey: parsed.idempotencyKey });
  } catch (error) {
    logEvent("error", "queue.events.processing_failed", {
      eventName: parsed.name,
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse({ error: "processing_failed" }, { status: 503, headers: { "Retry-After": "5" } });
  }
}

const validEventNames = new Set(Object.values(queueEventNames));

function isQueueEvent(value: Partial<QueueEvent>): value is QueueEvent {
  return typeof value.name === "string"
    && validEventNames.has(value.name as QueueEvent["name"])
    && typeof value.idempotencyKey === "string"
    && value.idempotencyKey.length > 0
    && value.idempotencyKey.length <= 200
    && typeof value.occurredAt === "string"
    && Number.isFinite(Date.parse(value.occurredAt))
    && value.source === "smokecheck-sg-prototype";
}

async function parseQueueEvent(body: string) {
  try {
    const value = JSON.parse(body) as Partial<QueueEvent>;
    return isQueueEvent(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
