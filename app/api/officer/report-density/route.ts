import { enforceRateLimit, jsonResponse } from "@/lib/http";
import { listDemoOfficerReportDensity } from "@/lib/officer/demo-operations";
import { appendCorsHeaders, preflightResponse, requireOfficerAuth } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "OPTIONS"], authenticated: true };
const allowedRanges = new Set([24, 24 * 7, 24 * 30, 24 * 90]);

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const authError = await requireOfficerAuth(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const limited = await enforceRateLimit(request, "officer-report-density", 120, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const url = new URL(request.url);
  const rangeHours = Number(url.searchParams.get("rangeHours") ?? 24 * 7);
  const safeRangeHours = allowedRanges.has(rangeHours) ? rangeHours : 24 * 7;
  const density = await listDemoOfficerReportDensity(safeRangeHours);

  return appendCorsHeaders(jsonResponse({ ...density, rangeHours: safeRangeHours, source: "supabase_demo_officer_reports" }), request, corsOptions);
}
