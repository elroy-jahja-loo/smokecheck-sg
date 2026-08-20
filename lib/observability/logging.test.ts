import assert from "node:assert/strict";
import { test } from "node:test";

import { clearMetricsForTesting, listMetrics, observeMetric, redactForLog } from "./logging";

test("structured logging redacts precise GPS, officer identifiers, tokens, and report notes", () => {
  const redacted = redactForLog({
    lat: 1.3048,
    lng: 103.8318,
    officerId: "officer-123",
    authorization: "Bearer secret",
    notes: "free-text report note",
    nested: { coordinates: { lat: 1.3, lng: 103.8 }, safe: "kept" },
  });

  assert.deepEqual(redacted, {
    lat: "[REDACTED]",
    lng: "[REDACTED]",
    officerId: "[REDACTED]",
    authorization: "[REDACTED]",
    notes: "[REDACTED]",
    nested: { coordinates: "[REDACTED]", safe: "kept" },
  });
});

test("metrics keep in-memory fallback shape when OTEL is not configured", () => {
  const previousEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  clearMetricsForTesting();

  observeMetric("api.request.duration_ms", 42, { route: "/api/health" });
  const records = listMetrics();

  assert.equal(records.length, 1);
  assert.equal(records[0]?.name, "api.request.duration_ms");
  assert.equal(records[0]?.providerExportedAt, undefined);

  if (previousEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousEndpoint;
  else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  clearMetricsForTesting();
});

test("metrics mark provider-exported when OTEL endpoint exists", () => {
  const previousEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel.example/v1/metrics";
  clearMetricsForTesting();

  observeMetric("rag.citation_coverage", 0.9, { route: "/api/rag/query" });
  const records = listMetrics();

  assert.equal(records.length, 1);
  assert.equal(records[0]?.name, "rag.citation_coverage");
  assert.equal(typeof records[0]?.providerExportedAt, "string");
  assert.equal(records[0]?.providerExportError, undefined);

  if (previousEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousEndpoint;
  else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  clearMetricsForTesting();
});
