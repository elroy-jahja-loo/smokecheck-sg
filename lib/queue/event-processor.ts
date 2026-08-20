import { createHash } from "node:crypto";

import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import { queueEventNames } from "@/lib/queue/queue-adapter";
import type { QueueEvent } from "@/lib/types";

export async function processQueueEvent(event: QueueEvent, deliveryKey?: string, leaseOwner?: string) {
  if (event.name !== queueEventNames.officerReportSubmitted && event.name !== queueEventNames.auditEventCreated) {
    throw new Error(`No production handler is registered for ${event.name}`);
  }
  if (!hasPostgisConfig()) return false;
  if (!deliveryKey || !leaseOwner) throw new Error("Database queue processing requires delivery lease ownership");

  const payload = JSON.stringify(event.payload ?? null);
  const payloadHash = createHash("sha256").update(payload).digest("hex");
  const action = event.name === queueEventNames.auditEventCreated
    ? readPayloadString(event.payload, "action") ?? "audit_event_consumed"
    : "officer_report_event_consumed";
  const resourceId = readPayloadString(event.payload, "handoffId") ?? event.idempotencyKey;
  const client = await getPostgisPool().connect();
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtextextended('smokecheck-audit-chain', 0))`);
    const previous = await client.query<{ chain_hash: string }>(
      `select chain_hash from public.audit_log_chain order by created_at desc, id desc limit 1`,
    );
    const previousHash = previous.rows[0]?.chain_hash ?? "";
    const chainHash = createHash("sha256")
      .update([previousHash, action, event.name, resourceId, payloadHash, event.occurredAt].join("|"))
      .digest("hex");
    await client.query(
      `insert into public.audit_log_chain (
         action, resource_type, resource_id, payload_hash, previous_hash, chain_hash
       ) values ($1, $2, $3, $4, nullif($5, ''), $6)`,
      [action, event.name, resourceId, payloadHash, previousHash, chainHash],
    );
    const completed = await client.query(
      `update public.queue_event_receipts
       set status = 'completed', completed_at = now(), lease_until = now(), updated_at = now()
       where delivery_key = $1 and lease_owner = $2 and status = 'processing'`,
      [deliveryKey, leaseOwner],
    );
    if (completed.rowCount !== 1) throw new Error("Queue delivery lease was lost");
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function readPayloadString(payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length <= 200 ? value : undefined;
}
