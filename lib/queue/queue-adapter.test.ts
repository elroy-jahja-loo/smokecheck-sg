import assert from "node:assert/strict";
import test from "node:test";

import {
  createQueueEvent,
  InMemoryQueueAdapter,
  QStashQueueAdapter,
  queueEventNames,
} from "@/lib/queue/queue-adapter";
import { InMemoryDeadLetterStore } from "@/lib/queue/dead-letter-store";

test("qstash adapter records failed publishes as dead letters", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "temporary upstream failure" }), { status: 503 });
  try {
    const adapter = new QStashQueueAdapter(
      "https://qstash.example",
      "token",
      "https://app.example/api/queue/events",
      new InMemoryDeadLetterStore(),
    );
    const event = createQueueEvent(queueEventNames.datasetSyncFailed, "dlq-test", { failed: true });
    await assert.rejects(() => adapter.publish(event), /temporary upstream failure/);
    const deadLetters = await adapter.listDeadLetters();
    assert.ok(deadLetters.some((entry) => entry.event.idempotencyKey === "dlq-test" && entry.retryable && entry.provider === "qstash_publish"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("qstash adapter records transport failures as dead letters", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  const store = new InMemoryDeadLetterStore();
  try {
    const adapter = new QStashQueueAdapter(
      "https://qstash.example",
      "token",
      "https://app.example/api/queue/events",
      store,
    );
    const event = createQueueEvent(queueEventNames.auditEventCreated, "transport-failure", {});
    await assert.rejects(() => adapter.publish(event), /fetch failed/);
    assert.equal((await store.list()).some((entry) => entry.event.idempotencyKey === "transport-failure"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("in-memory adapter persists and retries dead letters through durable store abstraction", async () => {
  const store = new InMemoryDeadLetterStore();
  const adapter = new InMemoryQueueAdapter(store);
  const failed = await store.add({
    event: createQueueEvent(queueEventNames.webhookHandoffRetry, "retry-me", { note: "replay" }),
    provider: "in_memory",
    failureReason: "temporary issue",
    retryable: true,
  });

  const retried = await adapter.retryDeadLetter(failed.id);
  assert.equal(retried?.status, "retried");
  assert.equal((await adapter.listPublished()).some((event) => event.idempotencyKey === "retry-me"), true);

  const resolved = await adapter.resolveDeadLetter(failed.id);
  assert.equal(resolved?.status, "resolved");
});

test("qstash adapter imports provider DLQ messages and retries by provider dlq id", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });

    if (url.includes("/v2/dlq?")) {
      return Response.json({
        messages: [
          {
            dlqId: "dlq-1",
            messageId: "msg-1",
            body: JSON.stringify(createQueueEvent(queueEventNames.datasetSyncFailed, "provider-key", { from: "provider" })),
            reason: "delivery retry exhausted",
          },
        ],
      });
    }
    if (url.endsWith("/v2/dlq/dlq-1/retry")) return new Response(null, { status: 200 });
    if (url.endsWith("/v2/dlq/dlq-1")) return new Response(null, { status: 200 });
    return new Response(null, { status: 200 });
  };

  try {
    const adapter = new QStashQueueAdapter(
      "https://qstash.example",
      "token",
      "https://app.example/api/queue/events",
      new InMemoryDeadLetterStore(),
    );
    const imported = await adapter.listDeadLetters();
    const entry = imported.find((record) => record.providerDlqId === "dlq-1");
    assert.ok(entry);

    const retried = await adapter.retryDeadLetter(entry!.id);
    assert.equal(retried?.status, "retried");
    assert.equal(calls.some((call) => call.url.endsWith("/v2/dlq/dlq-1/retry") && call.method === "POST"), true);

    const resolved = await adapter.resolveDeadLetter(entry!.id);
    assert.equal(resolved?.status, "resolved");
    assert.equal(calls.some((call) => call.url.endsWith("/v2/dlq/dlq-1") && call.method === "DELETE"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
