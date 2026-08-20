import { NextResponse } from "next/server";

import { rateLimitAdapter } from "@/lib/cache/cache-adapter";
import { logEvent } from "@/lib/observability/logging";

export function jsonResponse<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

function getActorKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local-demo";
}

export async function enforceRateLimit(request: Request, route: string, limit: number, windowSeconds: number) {
  const actor = getActorKey(request);
  const result = await rateLimitAdapter.check(`ratelimit:${route}:${actor}`, limit, windowSeconds);
  if (!result.allowed) {
    logEvent("warn", "rate_limit.exceeded", { route, actorKey: actor, resetAt: result.resetAt });
    return jsonResponse(
      {
        error: "rate_limited",
        message: "Too many requests for this prototype route. Try again later.",
        resetAt: result.resetAt,
      },
      { status: 429, headers: { "Retry-After": String(windowSeconds) } },
    );
  }
  return undefined;
}

export function badRequest(message: string, details?: unknown) {
  return jsonResponse({ error: "bad_request", message, details }, { status: 400 });
}

export function readCookie(cookieHeader: string | null, name: string) {
  return cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
