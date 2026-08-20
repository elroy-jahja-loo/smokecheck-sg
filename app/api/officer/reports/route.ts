import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { getDemoOfficerSessionFromRequest } from "@/lib/officer/demo-auth";
import { listRecentDemoOfficerReports, saveDemoOfficerReport } from "@/lib/officer/demo-operations";
import { reportHandoffService } from "@/lib/reports/report-handoff-service";
import { appendCorsHeaders, preflightResponse, requireAuthenticatedMutation, requireJsonRequest, requireOfficerAuth } from "@/lib/security";
import { parseReportDraft } from "@/lib/validation";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "POST", "OPTIONS"], authenticated: true };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const authError = await requireOfficerAuth(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  return appendCorsHeaders(jsonResponse({ reports: await listRecentDemoOfficerReports() }), request, corsOptions);
}

export async function POST(request: Request) {
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);
  const authError = await requireAuthenticatedMutation(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const session = await getDemoOfficerSessionFromRequest(request);
  if (!session) return appendCorsHeaders(jsonResponse({ error: "unauthorized", message: "Demo officer login is required." }, { status: 401 }), request, corsOptions);
  const limited = await enforceRateLimit(request, "officer-reports", 30, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? crypto.randomUUID();
  const draft = parseReportDraft(await request.json().catch(() => undefined), idempotencyKey);
  if (!draft) return appendCorsHeaders(badRequest("Invalid demo officer report payload."), request, corsOptions);

  const saved = await saveDemoOfficerReport({ ...draft, officerId: session.officerId });
  const handoff = await reportHandoffService.submit(draft);
  return appendCorsHeaders(jsonResponse({ report: saved, handoff, persisted: true, simulated: true }, { status: saved.duplicate ? 200 : 201 }), request, corsOptions);
}
