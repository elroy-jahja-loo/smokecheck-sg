import { NextResponse } from "next/server";

import { jsonResponse, readCookie } from "@/lib/http";
import { type OfficerRole, normalizeOfficerRole } from "@/lib/officer/roles";
import { logEvent } from "@/lib/observability/logging";
import { getDemoOfficerSessionFromRequest } from "@/lib/officer/demo-auth";

type CorsOptions = {
  authenticated?: boolean;
  methods?: string[];
};

type BotProtectionMode = "off" | "turnstile";

type TurnstileValidationOptions = {
  expectedAction?: string;
  expectedCData?: string;
  expectedHostnames?: readonly string[];
};

type TurnstileSiteverifyResponse = {
  success: boolean;
  hostname?: string;
  action?: string;
  cdata?: string;
  "error-codes"?: string[];
};

type TurnstileVerificationResult =
  | { success: true; hostname?: string; action?: string }
  | { success: false; reason: string; errorCodes?: string[]; providerStatus?: number };

type BotProtectionOptions = {
  action: string;
  cdata?: string;
  expectedHostnames?: readonly string[];
};

const defaultAllowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://smokecheck.sg",
  "https://smokecheck-sg.vercel.app",
]);

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...splitCsv(process.env.SMOKECHECK_ALLOWED_ORIGINS),
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
]);

const allowedRequestHeaders = [
  "content-type",
  "idempotency-key",
  "upstash-signature",
  "x-turnstile-token",
  "x-csrf-token",
  "x-smokecheck-internal-secret",
  "x-smokecheck-officer-session",
  "x-smokecheck-session",
];
const csrfTokenPattern = /^[a-zA-Z0-9._:-]{16,256}$/;

export function appendCorsHeaders(response: NextResponse, request: Request, options: CorsOptions = {}) {
  const origin = request.headers.get("origin");
  response.headers.set("Vary", appendVary(response.headers.get("Vary"), "Origin"));
  response.headers.set("Access-Control-Allow-Methods", (options.methods ?? ["GET", "POST", "OPTIONS"]).join(", "));
  response.headers.set("Access-Control-Allow-Headers", allowedRequestHeaders.join(", "));

  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    if (options.authenticated) response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

export function preflightResponse(request: Request, options: CorsOptions = {}) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse({ error: "cors_forbidden", message: "Origin is not allowed for this API." }, { status: 403 });
  }

  return appendCorsHeaders(new NextResponse(null, { status: 204 }), request, options);
}

export function requireJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "unsupported_media_type", message: "Expected application/json request body." }, { status: 415 });
  }
  return undefined;
}

export async function requireOfficerAuth(request: Request) {
  const session = await getDemoOfficerSessionFromRequest(request);
  if (session) return undefined;

  logEvent("warn", "officer.auth.rejected", {
    route: new URL(request.url).pathname,
    actorKey: request.headers.get("x-smokecheck-session") ?? request.headers.get("x-forwarded-for"),
  });
  return jsonResponse({ error: "unauthorized", message: "Officer authentication is required for this prototype API." }, { status: 401 });
}

export async function requireOfficerRole(request: Request, allowedRoles: readonly OfficerRole[]) {
  const session = await getDemoOfficerSessionFromRequest(request);
  if (!session) {
    logEvent("warn", "officer.auth.rejected", {
      route: new URL(request.url).pathname,
      actorKey: request.headers.get("x-smokecheck-session") ?? request.headers.get("x-forwarded-for"),
    });
    return jsonResponse({ error: "unauthorized", message: "Officer authentication is required for this prototype API." }, { status: 401 });
  }

  const role = normalizeOfficerRole(session.role);
  if (role && allowedRoles.includes(role)) return undefined;

  logEvent("warn", "officer.auth.role_rejected", {
    route: new URL(request.url).pathname,
    role: session.role,
    requiredRoles: allowedRoles,
  });
  return jsonResponse({ error: "forbidden", message: `Requires one of roles: ${allowedRoles.join(", ")}.` }, { status: 403 });
}

export async function requireAuthenticatedMutation(request: Request) {
  const unauthenticated = await requireOfficerAuth(request);
  if (unauthenticated) return unauthenticated;

  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    logEvent("warn", "csrf.origin.rejected", { route: new URL(request.url).pathname, origin });
    return jsonResponse({ error: "csrf_rejected", message: "Origin is not allowed for authenticated mutations." }, { status: 403 });
  }

  const csrfHeader = request.headers.get("x-csrf-token")?.trim();
  const csrfCookie = readCookie(request.headers.get("cookie"), "smokecheck_csrf");
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie || !csrfTokenPattern.test(csrfHeader)) {
    logEvent("warn", "csrf.token.rejected", { route: new URL(request.url).pathname });
    return jsonResponse({ error: "csrf_rejected", message: "Valid CSRF token header and cookie are required." }, { status: 403 });
  }

  return undefined;
}

export async function requireBotProtection(request: Request, options: BotProtectionOptions) {
  const mode = resolveBotProtectionMode();
  if (mode === "off") return undefined;

  const token = request.headers.get("x-turnstile-token")?.trim();
  if (!token) {
    logEvent("warn", "bot.protection.rejected", {
      route: new URL(request.url).pathname,
      action: options.action,
      reason: "token_missing",
    });
    return jsonResponse(
      {
        error: "bot_verification_required",
        message: "Bot verification token is required for this endpoint.",
      },
      { status: 403 },
    );
  }

  const verification = await verifyTurnstileToken(token, request, {
    expectedAction: options.action,
    expectedCData: options.cdata,
    expectedHostnames: options.expectedHostnames,
  });
  if (verification.success) return undefined;

  logEvent("warn", "bot.protection.rejected", {
    route: new URL(request.url).pathname,
    action: options.action,
    reason: verification.reason,
    errorCodes: verification.errorCodes,
  });
  return jsonResponse(
    {
      error: "bot_verification_failed",
      message: "Bot verification failed. Please retry and submit again.",
      reason: verification.reason,
    },
    { status: 403 },
  );
}

export async function verifyTurnstileToken(
  token: string,
  request: Request,
  options: TurnstileValidationOptions = {},
): Promise<TurnstileVerificationResult> {
  const mode = resolveBotProtectionMode();
  if (mode === "off") return { success: true };

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: false, reason: "turnstile_secret_missing" };

  const bypassToken = process.env.BOT_PROTECTION_TEST_BYPASS_TOKEN;
  if (bypassToken && token === bypassToken && !process.env.VERCEL && isLocalRequestHost(request)) {
    return { success: true, action: options.expectedAction };
  }

  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { success: false, reason: "token_invalid_length" };
  }

  const ip = extractClientIp(request);
  const verifyTimeoutMs = normalizeTimeout(process.env.TURNSTILE_VERIFY_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), verifyTimeoutMs);

  try {
    const form = new URLSearchParams({
      secret,
      response: trimmed,
      idempotency_key: crypto.randomUUID(),
    });
    if (ip) form.set("remoteip", ip);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { success: false, reason: "turnstile_http_error", providerStatus: response.status };
    }

    const payload = await response.json() as TurnstileSiteverifyResponse;
    if (!payload.success) {
      return {
        success: false,
        reason: "turnstile_rejected",
        errorCodes: payload["error-codes"] ?? [],
      };
    }

    if (options.expectedAction && payload.action !== options.expectedAction) {
      return { success: false, reason: "turnstile_action_mismatch" };
    }
    if (options.expectedCData && payload.cdata !== options.expectedCData) {
      return { success: false, reason: "turnstile_cdata_mismatch" };
    }

    const expectedHostnames = normalizeExpectedHostnames(request, options.expectedHostnames);
    if (expectedHostnames.length > 0) {
      if (!payload.hostname) {
        return { success: false, reason: "turnstile_hostname_missing" };
      }
      if (!expectedHostnames.includes(payload.hostname.toLowerCase())) {
        return { success: false, reason: "turnstile_hostname_mismatch" };
      }
    }

    return {
      success: true,
      hostname: payload.hostname,
      action: payload.action,
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "turnstile_timeout"
      : "turnstile_request_failed";
    return { success: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

function isAllowedOrigin(origin: string) {
  return allowedOrigins.has(origin);
}

function resolveBotProtectionMode(env: NodeJS.ProcessEnv = process.env): BotProtectionMode {
  if (env.VERCEL_ENV === "production") return "turnstile";
  const configured = env.BOT_PROTECTION_MODE?.trim().toLowerCase();
  if (configured === "off" || configured === "turnstile") return configured;
  return env.TURNSTILE_SECRET_KEY ? "turnstile" : "off";
}

function splitCsv(value: string | undefined) {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function normalizeExpectedHostnames(request: Request, expectedHostnames?: readonly string[]) {
  const hostnames = new Set<string>();
  for (const hostname of expectedHostnames ?? []) {
    const value = hostname.trim().toLowerCase();
    if (value) hostnames.add(value);
  }
  for (const hostname of splitCsv(process.env.BOT_PROTECTION_ALLOWED_HOSTNAMES)) {
    hostnames.add(hostname.toLowerCase());
  }
  const requestHostname = new URL(request.url).hostname.trim().toLowerCase();
  if (requestHostname) hostnames.add(requestHostname);
  if (process.env.VERCEL_URL) hostnames.add(process.env.VERCEL_URL.trim().toLowerCase());
  return Array.from(hostnames);
}

function extractClientIp(request: Request) {
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;
  return undefined;
}

function normalizeTimeout(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(15_000, Math.max(500, parsed));
}

function isLocalRequestHost(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function appendVary(existing: string | null, next: string) {
  const values = new Set((existing ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  values.add(next);
  return Array.from(values).join(", ");
}
