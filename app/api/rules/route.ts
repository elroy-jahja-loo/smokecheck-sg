import { globalDisclaimer, ruleFaqSections, ruleSummaries } from "@/data/prototype-data";
import { jsonResponse } from "@/lib/http";
import { sourceRepository } from "@/lib/data/source-repository";
import { observeApiRequest } from "@/lib/observability/logging";
import { appendCorsHeaders, preflightResponse } from "@/lib/security";

const corsOptions = { methods: ["GET", "OPTIONS"] };

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const sources = await sourceRepository.requireSources(["nea-smoking-guidance", "sg-legislation-reference"]);
  observeApiRequest("/api/rules", startedAt, { sourceCount: sources.length });

  return appendCorsHeaders(jsonResponse(
    {
      summaries: ruleSummaries,
      sections: ruleFaqSections,
      sources,
      disclaimer: globalDisclaimer,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  ), request, corsOptions);
}
