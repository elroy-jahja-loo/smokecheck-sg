import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInstrumentationPlan } from "@/lib/observability/instrumentation-config";

test("instrumentation plan always registers Vercel OTEL and reports exporter mode", () => {
  const enabled = buildInstrumentationPlan({
    NODE_ENV: "test",
    NEXT_RUNTIME: "nodejs",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1",
    OTEL_SERVICE_NAME: "smokecheck-prod",
  });
  assert.equal(enabled.shouldRegisterOtel, true);
  assert.equal(enabled.mode, "otel_exporter");
  assert.equal(enabled.serviceName, "smokecheck-prod");

  const fallback = buildInstrumentationPlan({
    NODE_ENV: "test",
    NEXT_RUNTIME: "nodejs",
  });
  assert.equal(fallback.shouldRegisterOtel, true);
  assert.equal(fallback.mode, "in_memory_fallback");
  assert.equal(fallback.serviceName, "smokecheck-sg");
});
