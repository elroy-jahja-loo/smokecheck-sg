import assert from "node:assert/strict";
import { test } from "node:test";

import { getObservabilityMode, getObservabilityServiceName, isOtelExporterConfigured } from "@/lib/observability/provider";

test("observability provider helpers resolve mode and service name", () => {
  const configured: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1/traces",
    OTEL_SERVICE_NAME: "smokecheck-custom",
  };
  assert.equal(isOtelExporterConfigured(configured), true);
  assert.equal(getObservabilityMode(configured), "otel_exporter");
  assert.equal(getObservabilityServiceName(configured), "smokecheck-custom");

  const fallback: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
  };
  assert.equal(isOtelExporterConfigured(fallback), false);
  assert.equal(getObservabilityMode(fallback), "in_memory_fallback");
  assert.equal(getObservabilityServiceName(fallback), "smokecheck-sg");
});
