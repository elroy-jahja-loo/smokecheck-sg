import { jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return jsonResponse(
    {
      enabled: false,
      replacedBy: "Per-endpoint bot verification via Cloudflare Turnstile token validation and platform WAF controls.",
    },
    { status: 410 },
  );
}
