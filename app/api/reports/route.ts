import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { reportHandoffService } from "@/lib/reports/report-handoff-service";
import { appendCorsHeaders, preflightResponse, requireAuthenticatedMutation, requireJsonRequest } from "@/lib/security";
import { parseReportDraft } from "@/lib/validation";

export const dynamic = "force-dynamic";

const corsOptions = { authenticated: true, methods: ["POST", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);

  const authError = await requireAuthenticatedMutation(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const limited = await enforceRateLimit(request, "reports", 20, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return appendCorsHeaders(badRequest("Report submissions require an Idempotency-Key header."), request, corsOptions);
  if (idempotencyKey.length < 12 || idempotencyKey.length > 160) {
    return appendCorsHeaders(badRequest("Idempotency-Key must be between 12 and 160 characters."), request, corsOptions);
  }

  const payload = await request.json().catch(() => undefined);
  const draft = parseReportDraft(payload, idempotencyKey);
  if (!draft) return appendCorsHeaders(badRequest("Invalid report handoff payload."), request, corsOptions);

  const record = await reportHandoffService.submit(draft);
  observeApiRequest("/api/reports", startedAt, { status: record.status, handoffId: record.handoffId });

  return appendCorsHeaders(jsonResponse(
    {
      handoff: record,
      architecture: {
        queueEvent: record.eventName,
        auditEvent: record.auditEventName,
        downstream: "Prototype FormSG-style handoff URL only; no live FormSG integration is claimed.",
      },
    },
    { status: record.status === "duplicate" ? 200 : 202 },
  ), request, corsOptions);
}
