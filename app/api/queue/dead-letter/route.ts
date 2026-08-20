import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { officerRoles } from "@/lib/officer/roles";
import { queueAdapter } from "@/lib/queue/queue-adapter";
import { appendCorsHeaders, preflightResponse, requireAuthenticatedMutation, requireOfficerRole } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { authenticated: true, methods: ["GET", "POST", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const authError = await requireOfficerRole(request, [officerRoles.admin, officerRoles.dataSync]);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const limited = await enforceRateLimit(request, "dead-letter-read", 60, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);
  return appendCorsHeaders(jsonResponse({ deadLetters: await queueAdapter.listDeadLetters() }), request, corsOptions);
}

export async function POST(request: Request) {
  const authError = await requireAuthenticatedMutation(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const roleError = await requireOfficerRole(request, [officerRoles.admin, officerRoles.dataSync]);
  if (roleError) return appendCorsHeaders(roleError, request, corsOptions);
  const limited = await enforceRateLimit(request, "dead-letter-mutate", 30, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const payload = await request.json().catch(() => undefined) as {
    action?: "retry" | "resolve" | "delete";
    id?: string;
  } | undefined;

  if (!payload?.id || !payload.action) {
    return appendCorsHeaders(badRequest("Expected action and id."), request, corsOptions);
  }

  if (payload.action === "retry") {
    const result = await queueAdapter.retryDeadLetter(payload.id);
    if (!result) return appendCorsHeaders(jsonResponse({ error: "not_found" }, { status: 404 }), request, corsOptions);
    return appendCorsHeaders(jsonResponse({ deadLetter: result }), request, corsOptions);
  }

  if (payload.action === "resolve") {
    const result = await queueAdapter.resolveDeadLetter(payload.id);
    if (!result) return appendCorsHeaders(jsonResponse({ error: "not_found" }, { status: 404 }), request, corsOptions);
    return appendCorsHeaders(jsonResponse({ deadLetter: result }), request, corsOptions);
  }

  await queueAdapter.deleteDeadLetter(payload.id);
  return appendCorsHeaders(jsonResponse({ deleted: true }), request, corsOptions);
}
