import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { buildCsrfSetCookie, buildOfficerSetCookie, createCsrfToken, loginMockSingpassOfficer } from "@/lib/officer/demo-auth";
import { observeApiRequest } from "@/lib/observability/logging";
import { appendCorsHeaders, preflightResponse, requireJsonRequest } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["POST", "OPTIONS"], authenticated: true };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);
  const limited = await enforceRateLimit(request, "officer-login", 12, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);
  const payload = await request.json().catch(() => undefined);
  if (!isRecord(payload)) return appendCorsHeaders(badRequest("Expected a demo access request."), request, corsOptions);

  const login = await loginMockSingpassOfficer();
  observeApiRequest("/api/officer/login", startedAt, { success: Boolean(login) });
  if (!login) {
    return appendCorsHeaders(jsonResponse({ error: "demo_access_unavailable", message: "Public demo access is not available." }, { status: 503 }), request, corsOptions);
  }

  const csrfToken = createCsrfToken();
  const response = jsonResponse({ officer: login.session, redirectTo: "/ops/dashboard", csrfToken });
  response.headers.append("Set-Cookie", buildOfficerSetCookie(login.token, request.url));
  response.headers.append("Set-Cookie", buildCsrfSetCookie(csrfToken, request.url));
  return appendCorsHeaders(response, request, corsOptions);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
