import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContentSecurityPolicy } from "./security-headers";

test("direct Sentry telemetry allows only the configured ingestion origin without exposing the DSN", () => {
  const policy = buildContentSecurityPolicy({ NODE_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: "https://public-key@o123.ingest.sentry.io/456" });
  assert.match(policy, /connect-src 'self' https:\/\/o123\.ingest\.sentry\.io;/);
  assert.doesNotMatch(policy, /public-key|456|unsafe-eval|connect-src[^;]*\*/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
});

test("missing, invalid and unsafe DSNs keep connections restricted to the app", () => {
  for (const dsn of [undefined, "invalid", "javascript:alert(1)", "http://insecure.example/123"]) {
    assert.match(buildContentSecurityPolicy({ NODE_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: dsn }), /connect-src 'self';/);
  }
});

test("development preserves local Sentry and eval support", () => {
  const policy = buildContentSecurityPolicy({ NODE_ENV: "development", NEXT_PUBLIC_SENTRY_DSN: "http://key@localhost:8080/1" });
  assert.match(policy, /connect-src 'self' http:\/\/localhost:8080;/);
  assert.match(policy, /'unsafe-eval'/);
});
