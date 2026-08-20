import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryDeadLetterStore } from "@/lib/queue/dead-letter-store";
import { createQueueEvent, queueEventNames } from "@/lib/queue/queue-adapter";

test("in-memory dead letter store supports add, resolve, and delete lifecycle", async () => {
  const store = new InMemoryDeadLetterStore();
  const created = await store.add({
    event: createQueueEvent(queueEventNames.datasetSyncFailed, "dlq-lifecycle", { sample: true }),
    provider: "in_memory",
    failureReason: "unit test",
    retryable: true,
  });

  assert.equal(created.status, "open");

  const resolved = await store.markResolved(created.id);
  assert.equal(resolved?.status, "resolved");

  await store.delete(created.id);
  const afterDelete = await store.getById(created.id);
  assert.equal(afterDelete, undefined);
});

test("in-memory dead letter store upserts provider dlq records by provider and dlq id", async () => {
  const store = new InMemoryDeadLetterStore();
  const event = createQueueEvent(queueEventNames.datasetSyncFailed, "provider-dlq", { source: "qstash" });

  const first = await store.upsertProviderRecord({
    event,
    provider: "qstash_dlq",
    providerMessageId: "msg-1",
    providerDlqId: "dlq-1",
    failureReason: "retry exhausted",
    retryable: true,
  });
  const second = await store.upsertProviderRecord({
    event,
    provider: "qstash_dlq",
    providerMessageId: "msg-2",
    providerDlqId: "dlq-1",
    failureReason: "retry exhausted",
    retryable: true,
  });

  assert.equal(first.id, second.id);
  assert.equal((await store.list()).length, 1);
});
