import assert from "node:assert/strict";
import { test } from "node:test";

import { runInstrumentationRegistration } from "@/lib/observability/instrumentation-runtime";

test("registration calls registerOTel when OTLP endpoint is configured", async () => {
  const registerCalls: Array<{ serviceName: string }> = [];
  const logCalls: Array<{ level: string; event: string; fields: Record<string, unknown> | undefined }> = [];

  const plan = await runInstrumentationRegistration(
    {
      NODE_ENV: "test",
      NEXT_RUNTIME: "nodejs",
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1/traces",
      OTEL_SERVICE_NAME: "smokecheck-observability-prod",
    },
    {
      registerOTel: (config) => registerCalls.push(config),
      logEvent: (level, event, fields) => logCalls.push({ level, event, fields }),
    },
  );

  assert.equal(plan.shouldRegisterOtel, true);
  assert.deepEqual(registerCalls, [{ serviceName: "smokecheck-observability-prod" }]);
  assert.equal(logCalls.length, 1);
  assert.equal(logCalls[0]?.event, "otel.instrumentation.registered");
  assert.equal(logCalls[0]?.fields?.exporter, "otel_exporter");
});

test("registration uses Vercel OTEL even without a custom exporter", async () => {
  const registerCalls: Array<{ serviceName: string }> = [];
  const logCalls: Array<{ level: string; event: string; fields: Record<string, unknown> | undefined }> = [];

  const plan = await runInstrumentationRegistration(
    {
      NODE_ENV: "test",
      NEXT_RUNTIME: "nodejs",
    },
    {
      registerOTel: (config) => registerCalls.push(config),
      logEvent: (level, event, fields) => logCalls.push({ level, event, fields }),
    },
  );

  assert.equal(plan.shouldRegisterOtel, true);
  assert.deepEqual(registerCalls, [{ serviceName: "smokecheck-sg" }]);
  assert.equal(logCalls.length, 1);
  assert.equal(logCalls[0]?.event, "otel.instrumentation.registered");
  assert.equal(logCalls[0]?.fields?.exporter, "in_memory_fallback");
});
