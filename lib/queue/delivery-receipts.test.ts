import assert from "node:assert/strict";
import { test } from "node:test";

import { claimQueueDelivery, completeQueueDelivery } from "@/lib/queue/delivery-receipts";
import { processQueueEvent } from "@/lib/queue/event-processor";
import { createQueueEvent, queueEventNames } from "@/lib/queue/queue-adapter";

test("queue delivery receipts reject concurrent and stale-owner completion", async () => {
  const key = `receipt-${crypto.randomUUID()}`;
  const claim = await claimQueueDelivery(key, queueEventNames.auditEventCreated);
  assert.equal(claim.status, "claimed");
  if (claim.status !== "claimed") return;

  assert.deepEqual(await claimQueueDelivery(key, queueEventNames.auditEventCreated), { status: "busy" });
  await assert.rejects(() => completeQueueDelivery(key, crypto.randomUUID()), /lease was lost/);
  await completeQueueDelivery(key, claim.owner);
  assert.deepEqual(await claimQueueDelivery(key, queueEventNames.auditEventCreated), { status: "completed" });
});

test("queue processor fails closed for events without a registered handler", async () => {
  assert.equal(await processQueueEvent(createQueueEvent(queueEventNames.auditEventCreated, crypto.randomUUID(), { action: "test" })), false);
  await assert.rejects(
    () => processQueueEvent(createQueueEvent(queueEventNames.datasetSyncRequested, crypto.randomUUID(), {})),
    /No production handler is registered/,
  );
});
