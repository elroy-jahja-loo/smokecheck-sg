/**
 * SmokeCheck SG Smoke Tests
 *
 * Run against a running dev server: npm run dev (in another terminal)
 * Then: npx tsx scripts/smoke-tests.ts
 *
 * Tests critical route availability, security headers, and content integrity.
 */
const BASE_URL = process.env.SMOKECHECK_TEST_URL || "http://localhost:3000";

type TestResult = {
  name: string;
  passed: boolean;
  message?: string;
};

const results: TestResult[] = [];

function record(name: string, passed: boolean, message?: string) {
  results.push({ name, passed, message });
  const status = passed ? "PASS" : "FAIL";
  console.log(`  ${status}  ${name}${message ? ` — ${message}` : ""}`);
}

async function fetchRoute(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
  });
  return response;
}

async function testPublicRoutes() {
  console.log("\nPublic Routes");

  const home = await fetchRoute("/");
  record("GET / returns 200", home.status === 200, `Got ${home.status}`);
  const homeText = await home.text();
  record("Home contains SmokeCheck SG", homeText.includes("SmokeCheck SG"));
  record("Home contains compliance alert", homeText.includes("check") || homeText.includes("smoking"));
  record("Home has skip-to-content link", homeText.includes("skip-link") || homeText.includes("Skip to"));

  const rules = await fetchRoute("/rules");
  record("GET /rules returns 200", rules.status === 200, `Got ${rules.status}`);
  record("Rules has cache headers", rules.headers.get("cache-control")?.includes("max-age") ?? false);

  const sources = await fetchRoute("/sources");
  record("GET /sources returns 200", sources.status === 200, `Got ${sources.status}`);

  const search = await fetchRoute("/search");
  record("GET /search returns 200", search.status === 200, `Got ${search.status}`);

  const notFound = await fetchRoute("/nonexistent-page-xyz");
  record("GET /nonexistent returns 404", notFound.status === 404, `Got ${notFound.status}`);
}

async function testSecurityHeaders() {
  console.log("\nSecurity Headers");

  const response = await fetchRoute("/");

  const csp = response.headers.get("content-security-policy");
  record("CSP header present", Boolean(csp), csp?.slice(0, 80) ?? "missing");

  const frameOptions = response.headers.get("x-frame-options");
  record("X-Frame-Options header", frameOptions === "DENY", String(frameOptions));

  const noSniff = response.headers.get("x-content-type-options");
  record("X-Content-Type-Options header", noSniff === "nosniff", String(noSniff));

  const referrer = response.headers.get("referrer-policy");
  record("Referrer-Policy header", Boolean(referrer), String(referrer));

  const hsts = response.headers.get("strict-transport-security");
  record("HSTS header", Boolean(hsts), hsts?.slice(0, 60) ?? "missing");

  const permissions = response.headers.get("permissions-policy");
  record("Permissions-Policy header", Boolean(permissions), permissions?.slice(0, 80) ?? "missing");

  const poweredBy = response.headers.get("x-powered-by");
  record("X-Powered-By is absent", poweredBy === null, String(poweredBy));

  const requestId = response.headers.get("x-request-id");
  record("X-Request-Id header present", Boolean(requestId), requestId ?? "missing");
}

async function testApiRoutes() {
  console.log("\nAPI Routes");

  const health = await fetchRoute("/api/health");
  record("GET /api/health returns 200", health.status === 200, `Got ${health.status}`);
  const healthBody = await health.json().catch(() => null);
  record("Health response is JSON", Boolean(healthBody));
  record("Health has no-store cache", health.headers.get("cache-control")?.includes("no-store") ?? false);

  const rules = await fetchRoute("/api/rules");
  record("GET /api/rules returns 200", rules.status === 200, `Got ${rules.status}`);

  const unauthorizedReport = await fetchRoute("/api/reports", { method: "POST" });
  record("POST /api/reports without a valid request is rejected", [401, 403, 415].includes(unauthorizedReport.status), `Got ${unauthorizedReport.status}`);

  const geospatialStatus = await fetchRoute("/api/geospatial/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 1.3048, lng: 103.8318 }),
  });
  record("POST /api/geospatial/status returns 200", geospatialStatus.status === 200, `Got ${geospatialStatus.status}`);
}

async function testOfficerRoutes() {
  console.log("\nOfficer Routes");

  const login = await fetchRoute("/ops/login");
  record("GET /ops/login returns 200", login.status === 200, `Got ${login.status}`);
  const loginText = await login.text();
  record("Login has no password field", !loginText.includes('type="password"'), "Check for password input");

  const dashboard = await fetchRoute("/ops/dashboard");
  record("GET /ops/dashboard redirects to login", dashboard.status === 307 || (dashboard.headers.get("location")?.includes("/ops/login") ?? false), `Got ${dashboard.status}, Location: ${dashboard.headers.get("location") ?? "none"}`);
}

async function testContentIntegrity() {
  console.log("\nContent Integrity");

  const home = await fetchRoute("/");
  const homeText = await home.text();

  record("No officer strings in public page", !homeText.includes("officer.dashboard") && !homeText.includes("Zonebuster Ops"));
  record("Disclaimer mentions current law", homeText.includes("current law"));
  record("No NRIC pattern in public page", !/S\d{7}[A-Z]/.test(homeText));

  const sources = await fetchRoute("/sources");
  const sourcesText = await sources.text();
  record("Sources page has NEA reference", sourcesText.includes("NEA") || sourcesText.includes("nea.gov.sg"));
  record("Sources page has prototype label", sourcesText.includes("prototype") || sourcesText.includes("Prototype"));
}

async function main() {
  console.log(`SmokeCheck SG Smoke Tests — ${BASE_URL}`);
  console.log("=".repeat(50));

  try {
    await testPublicRoutes();
    await testSecurityHeaders();
    await testApiRoutes();
    await testOfficerRoutes();
    await testContentIntegrity();
  } catch (error) {
    console.error("\nTest suite error:", error instanceof Error ? error.message : String(error));
    console.error("Make sure the dev server is running: npm run dev");
  }

  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\nResults: ${passed}/${total} passed`);

  if (passed < total) {
    console.log("\nFailed tests:");
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  FAIL  ${result.name}${result.message ? ` — ${result.message}` : ""}`);
    }
    process.exit(1);
  }

  console.log("All smoke tests passed!");
}

main();
