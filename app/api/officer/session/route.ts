import { jsonResponse } from "@/lib/http";
import { getDemoOfficerSessionFromRequest } from "@/lib/officer/demo-auth";
import { appendCorsHeaders, preflightResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "OPTIONS"], authenticated: true };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const session = await getDemoOfficerSessionFromRequest(request);
  if (!session) return appendCorsHeaders(jsonResponse({ authenticated: false }, { status: 401 }), request, corsOptions);
  return appendCorsHeaders(jsonResponse({ authenticated: true, officer: session }), request, corsOptions);
}
