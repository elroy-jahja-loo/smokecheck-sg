import assert from "node:assert/strict";
import { test } from "node:test";

import { createInMemoryOfficerSessionForTesting, loginMockSingpassOfficer } from "./officer/demo-auth";
import { officerRoles } from "./officer/roles";
import type { OfficerRole } from "./officer/roles";
import { requireAuthenticatedMutation, requireBotProtection, requireOfficerAuth, requireOfficerRole, verifyTurnstileToken } from "./security";

test("officer API helper rejects unauthenticated calls even in prototype", async () => {
  const request = new Request("https://smokecheck.sg/api/reports", { method: "POST" });

  const response = await requireOfficerAuth(request);

  assert.equal(response?.status, 401);
});

test("authenticated mutations require matching CSRF header and cookie", async () => {
  const login = await loginMockSingpassOfficer();
  assert.ok(login);
  const csrfToken = "csrf-token-with-enough-length";
  const request = new Request("https://smokecheck.sg/api/reports", {
    method: "POST",
    headers: {
      "x-csrf-token": csrfToken,
      cookie: `smokecheck_officer_session=${login.token}; smokecheck_csrf=${csrfToken}`,
      origin: "https://smokecheck.sg",
    },
  });

  assert.equal(await requireAuthenticatedMutation(request), undefined);
});

test("authenticated mutations reject unapproved origins", async () => {
  const login = await loginMockSingpassOfficer();
  assert.ok(login);
  const csrfToken = "csrf-token-with-enough-length";
  const request = new Request("https://smokecheck.sg/api/reports", {
    method: "POST",
    headers: {
      "x-csrf-token": csrfToken,
      cookie: `smokecheck_officer_session=${login.token}; smokecheck_csrf=${csrfToken}`,
      origin: "https://attacker.example",
    },
  });

  const response = await requireAuthenticatedMutation(request);

  assert.equal(response?.status, 403);
});

test("role helper denies officer role for admin-only route", async () => {
  const login = createInMemoryOfficerSessionForTesting(officerRoles.officer);
  const request = new Request("https://smokecheck.sg/api/queue/dead-letter", {
    headers: {
      cookie: `smokecheck_officer_session=${login.token}`,
    },
  });

  const response = await requireOfficerRole(request, [officerRoles.admin]);

  assert.equal(response?.status, 403);
});

test("role helper allows data-sync role for sync trigger route", async () => {
  const login = createInMemoryOfficerSessionForTesting(officerRoles.dataSync);
  const request = new Request("https://smokecheck.sg/api/internal/sync/datagov", {
    method: "POST",
    headers: {
      cookie: `smokecheck_officer_session=${login.token}`,
    },
  });

  const response = await requireOfficerRole(request, [officerRoles.admin, officerRoles.dataSync]);

  assert.equal(response, undefined);
});

test("role helper enforces route role matrix across edge cases", async () => {
  const routePolicies: Array<{ path: string; allowed: OfficerRole[] }> = [
    { path: "/api/operations/status", allowed: [officerRoles.admin, officerRoles.analyst, officerRoles.dataSync] },
    { path: "/api/queue/dead-letter", allowed: [officerRoles.admin, officerRoles.dataSync] },
    { path: "/api/observability/metrics", allowed: [officerRoles.admin, officerRoles.analyst] },
    { path: "/api/internal/sync/datagov", allowed: [officerRoles.admin, officerRoles.dataSync] },
  ];
  const roles = [officerRoles.officer, officerRoles.analyst, officerRoles.admin, officerRoles.dataSync] as const;

  for (const role of roles) {
    const login = createInMemoryOfficerSessionForTesting(role);
    for (const policy of routePolicies) {
      const response = await requireOfficerRole(
        new Request(`https://smokecheck.sg${policy.path}`, {
          headers: { cookie: `smokecheck_officer_session=${login.token}` },
        }),
        policy.allowed,
      );
      const expectedAllowed = policy.allowed.includes(role);
      assert.equal(
        response === undefined,
        expectedAllowed,
        `${role} should ${expectedAllowed ? "" : "not "}access ${policy.path}`,
      );
    }
  }
});

test("bot protection helper no-ops when mode is off", async () => {
  await withEnv({ BOT_PROTECTION_MODE: "off", TURNSTILE_SECRET_KEY: undefined }, async () => {
    const response = await requireBotProtection(new Request("https://smokecheck.sg/api/rag/query", { method: "POST" }), {
      action: "rag_query",
    });
    assert.equal(response, undefined);
  });
});

test("bot protection helper rejects missing token in turnstile mode", async () => {
  await withEnv({ BOT_PROTECTION_MODE: "turnstile", TURNSTILE_SECRET_KEY: "test-secret" }, async () => {
    const response = await requireBotProtection(new Request("https://smokecheck.sg/api/rag/query", { method: "POST" }), {
      action: "rag_query",
    });
    assert.equal(response?.status, 403);
  });
});

test("turnstile verifier supports non-production bypass token for local tests", async () => {
  await withEnv({
    NODE_ENV: "test",
    BOT_PROTECTION_MODE: "turnstile",
    TURNSTILE_SECRET_KEY: "test-secret",
    BOT_PROTECTION_TEST_BYPASS_TOKEN: "allow-local-bypass",
    VERCEL: undefined,
  }, async () => {
    const result = await verifyTurnstileToken(
      "allow-local-bypass",
      new Request("http://localhost:3000/api/reports", { method: "POST" }),
      { expectedAction: "report_handoff" },
    );

    assert.equal(result.success, true);
  });
});

test("turnstile verifier does not allow bypass token on non-local host", async () => {
  await withEnv({
    NODE_ENV: "test",
    BOT_PROTECTION_MODE: "turnstile",
    TURNSTILE_SECRET_KEY: "test-secret",
    BOT_PROTECTION_TEST_BYPASS_TOKEN: "allow-local-bypass",
    VERCEL: undefined,
  }, async () => {
    await withMockFetch(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }), async () => {
      const result = await verifyTurnstileToken(
        "allow-local-bypass",
        new Request("https://smokecheck.sg/api/reports", { method: "POST" }),
        { expectedAction: "report_handoff" },
      );

      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.reason, "turnstile_rejected");
    });
  });
});

test("turnstile verifier rejects action mismatch", async () => {
  await withEnv({
    NODE_ENV: "test",
    BOT_PROTECTION_MODE: "turnstile",
    TURNSTILE_SECRET_KEY: "test-secret",
    BOT_PROTECTION_TEST_BYPASS_TOKEN: undefined,
  }, async () => {
    await withMockFetch(async () => new Response(JSON.stringify({ success: true, action: "officer_login", hostname: "smokecheck.sg" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }), async () => {
      const result = await verifyTurnstileToken(
        "token-value",
        new Request("https://smokecheck.sg/api/reports", { method: "POST" }),
        { expectedAction: "report_handoff" },
      );
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.reason, "turnstile_action_mismatch");
    });
  });
});

async function withEnv(updates: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withMockFetch(
  mockFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
