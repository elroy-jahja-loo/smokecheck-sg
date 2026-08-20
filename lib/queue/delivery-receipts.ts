import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";

export type DeliveryClaim =
  | { status: "claimed"; owner: string }
  | { status: "completed" }
  | { status: "busy" };

const localReceipts = new Map<string, { status: "processing" | "completed"; owner: string }>();

export async function claimQueueDelivery(key: string, eventName: string, providerMessageId?: string): Promise<DeliveryClaim> {
  const owner = crypto.randomUUID();
  if (!hasPostgisConfig()) {
    const existing = localReceipts.get(key);
    if (existing?.status === "completed") return { status: "completed" };
    if (existing) return { status: "busy" };
    localReceipts.set(key, { status: "processing", owner });
    return { status: "claimed", owner };
  }

  const { rows } = await getPostgisPool().query<{ status: string }>(
    `insert into public.queue_event_receipts (
       delivery_key, event_name, provider_message_id, status, lease_owner, lease_until, attempts
     ) values ($1, $2, $3, 'processing', $4, now() + interval '5 minutes', 1)
     on conflict (delivery_key) do update set
       event_name = excluded.event_name,
       provider_message_id = coalesce(excluded.provider_message_id, public.queue_event_receipts.provider_message_id),
       status = 'processing',
       lease_owner = excluded.lease_owner,
       lease_until = now() + interval '5 minutes',
       attempts = public.queue_event_receipts.attempts + 1,
       updated_at = now()
     where public.queue_event_receipts.status <> 'completed'
       and public.queue_event_receipts.lease_until < now()
     returning status`,
    [key, eventName, providerMessageId ?? null, owner],
  );
  if (rows[0]) return { status: "claimed", owner };

  const existing = await getPostgisPool().query<{ status: string }>(
    `select status from public.queue_event_receipts where delivery_key = $1`,
    [key],
  );
  return { status: existing.rows[0]?.status === "completed" ? "completed" : "busy" };
}

export async function completeQueueDelivery(key: string, owner: string) {
  if (!hasPostgisConfig()) {
    const existing = localReceipts.get(key);
    if (!existing || existing.owner !== owner || existing.status !== "processing") throw new Error("Queue delivery lease was lost");
    localReceipts.set(key, { status: "completed", owner });
    return;
  }
  const result = await getPostgisPool().query(
    `update public.queue_event_receipts
     set status = 'completed', completed_at = now(), lease_until = now(), updated_at = now()
     where delivery_key = $1 and lease_owner = $2 and status = 'processing'`,
    [key, owner],
  );
  if (result.rowCount !== 1) throw new Error("Queue delivery lease was lost");
}
