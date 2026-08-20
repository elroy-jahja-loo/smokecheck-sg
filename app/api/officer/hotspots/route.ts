import { enforceRateLimit, jsonResponse } from "@/lib/http";
import { listDemoComplaintHotspots } from "@/lib/officer/demo-operations";
import { appendCorsHeaders, preflightResponse, requireOfficerAuth } from "@/lib/security";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["GET", "OPTIONS"], authenticated: true };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const authError = await requireOfficerAuth(request);
  if (authError) return appendCorsHeaders(authError, request, corsOptions);
  const limited = await enforceRateLimit(request, "officer-hotspots", 60, 60);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const hotspots = await listDemoComplaintHotspots();
  return appendCorsHeaders(jsonResponse({ hotspots, simulated: true, note: "Synthetic demo complaint data, not official enforcement data." }), request, corsOptions);
}
