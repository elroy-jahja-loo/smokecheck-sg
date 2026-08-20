import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { ragService } from "@/lib/rag/rag-service";
import { appendCorsHeaders, preflightResponse, requireBotProtection, requireJsonRequest } from "@/lib/security";
import { parseRagPayload } from "@/lib/validation";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["POST", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);

  const limited = await enforceRateLimit(request, "rag-query", 30, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);
  const botError = await requireBotProtection(request, { action: "rag_query" });
  if (botError) return appendCorsHeaders(botError, request, corsOptions);

  const payload = parseRagPayload(await request.json().catch(() => undefined));
  if (!payload) return appendCorsHeaders(badRequest("Expected a question string."), request, corsOptions);

  const response = await ragService.query(payload);
  observeApiRequest("/api/rag/query", startedAt, { ragStatus: response.status, guardrailReason: response.guardrailReason });
  return appendCorsHeaders(jsonResponse(response, { status: response.status === "refused" ? 400 : 200 }), request, corsOptions);
}
