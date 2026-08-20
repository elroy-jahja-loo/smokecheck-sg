import { NextRequest, NextResponse } from "next/server";

const internalSecretHeader = "x-smokecheck-internal-secret";

const apiSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  "X-XSS-Protection": "0",
};

const publicCorsOrigins = new Set(
  (process.env.SMOKECHECK_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const rateLimitedPaths = [
  "/api/search",
  "/api/geospatial/status",
  "/api/geospatial/map-features",
  "/api/reports",
  "/api/rag/query",
  "/api/officer/login",
  "/api/officer/reports",
  "/api/onemap/search",
  "/api/onemap/reverse-geocode",
  "/api/onemap/route",
];

const officerRoutePrefixes = ["/ops/dashboard", "/ops/admin"];

const responseCache: Map<string, { timestamp: number; count: number }> = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

function shouldRateLimit(pathname: string) {
  return rateLimitedPaths.some((path) => pathname.startsWith(path));
}

function getRateLimitInfo(actorKey: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = responseCache.get(actorKey);
  if (!entry || now - entry.timestamp > RATE_LIMIT_WINDOW_MS) {
    responseCache.set(actorKey, { timestamp: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining: Math.max(RATE_LIMIT_MAX - entry.count, 0),
  };
}

function extractActorKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return `ip:${forwarded}`;
  return "local";
}

function isInternalRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization") ?? "";
  if (cronSecret && bearer === `Bearer ${cronSecret}`) return true;

  const internalSecret = process.env.SMOKECHECK_INTERNAL_SECRET || process.env.DATAGOV_SYNC_INTERNAL_SECRET;
  if (!internalSecret) return false;

  const headerSecret = request.headers.get(internalSecretHeader);
  if (headerSecret === internalSecret) return true;

  if (bearer === `Bearer ${internalSecret}`) return true;

  return false;
}

function isInternalCron(pathname: string) {
  return pathname.startsWith("/api/internal/cron/");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://form.gov.sg",
    "frame-ancestors 'none'",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.onemap.gov.sg",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
  const response = NextResponse.next();
  const requestId = crypto.randomUUID();

  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Response-Time", Date.now().toString());
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  for (const [key, value] of Object.entries(apiSecurityHeaders)) {
    response.headers.set(key, value);
  }

  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    if (origin) {
      if (publicCorsOrigins.has(origin) || publicCorsOrigins.has("*")) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Vary", "Origin");
      }
    }
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-CSRF-Token, Idempotency-Key",
    );
    response.headers.set("Access-Control-Max-Age", "86400");

    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }
  }

  if (isInternalCron(pathname) && !isInternalRequest(request)) {
    return new NextResponse(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (shouldRateLimit(pathname) && !isInternalRequest(request)) {
    const actorKey = extractActorKey(request);
    const { allowed, remaining } = getRateLimitInfo(actorKey);

    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({
          error: "rate_limited",
          message: "Too many requests. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        },
      );
    }
  }

  const isOfficerRoute = officerRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
  if (isOfficerRoute) {
    const hasDemoCookie = Boolean(request.cookies.get("smokecheck_officer_session")?.value);
    if (!hasDemoCookie) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/ops/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("reason", "prototype-officer-gate");
      return NextResponse.redirect(loginUrl);
    }
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }

  if (pathname === "/") {
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=60",
    );
  }

  if (
    process.env.VERCEL_ENV !== "production" &&
    process.env.VERCEL_ENV !== "preview"
  ) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
};
