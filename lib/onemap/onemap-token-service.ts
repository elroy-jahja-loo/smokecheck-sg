import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { logEvent, observeMetric } from "@/lib/observability/logging";
import { OneMapSafeError } from "@/lib/onemap/onemap-types";

/*
 * OneMap Token Lifecycle (per official docs, July 2026):
 *   - Token obtained via POST /api/auth/post/getToken (email + password)
 *   - Valid for 3 days (72 hours)
 *   - Does NOT auto-renew — must re-authenticate
 *   - Used as Authorization header on all other OneMap API calls
 *
 * This service:
 *   1. Checks Redis cache (persistent across Vercel cold starts)
 *   2. Falls back to in-memory cache
 *   3. Falls back to ONEMAP_API_TOKEN env var (if still valid)
 *   4. Falls back to credential refresh via ONEMAP_EMAIL + ONEMAP_EMAIL_PASSWORD
 *   5. Cron job at /api/internal/cron/refresh-onemap-token refreshes every 2 days
 */

const TOKEN_CACHE_KEY = "onemap:access_token:v2";
const TOKEN_REFRESH_LEASE_KEY = "onemap:access_token:v2:refresh_lock";
const TOKEN_TTL_SECONDS = 60 * 60 * 60;          // 60 hours (2.5 days) in cache
const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000;  // refresh when < 6h remaining
const REFRESH_RETRY_MAX = 2;
const REFRESH_BASE_MS = 500;

export function retryBackoffMs(attempt: number, baseMs: number) {
  const jitter = Math.random() * 0.3 + 0.85;
  return Math.round(baseMs * Math.pow(2, attempt) * jitter);
}

export class OneMapTokenService {
  private memoryToken?: string;
  private memoryExpiresAt?: number;
  private refreshPromise: Promise<string | undefined> | null = null;

  async getToken(): Promise<string> {
    // 1. Redis cache (persistent across cold starts)
    try {
      const cached = await cacheAdapter.get<{ token: string; expiresAt: number }>(TOKEN_CACHE_KEY);
      if (cached?.token && !isExpiring(cached.expiresAt)) {
        this.memoryToken = cached.token;
        this.memoryExpiresAt = cached.expiresAt;
        return cached.token;
      }
    } catch {
      // Redis unavailable — continue to memory/env
    }

    // 2. In-memory cache
    if (this.memoryToken && this.memoryExpiresAt && !isExpiring(this.memoryExpiresAt)) {
      return this.memoryToken;
    }

    // 3. Env var ONEMAP_API_TOKEN (manually set, static)
    //    Works with or without ONEMAP_TOKEN_EXPIRES_AT.
    //    Without expiry: used as-is. With expiry: checked for freshness.
    const envToken = process.env.ONEMAP_API_TOKEN?.trim();
    const envExpiresAt = parseExpiry(process.env.ONEMAP_TOKEN_EXPIRES_AT);
    if (envToken && ((envExpiresAt && !isExpiring(envExpiresAt)) || (!envExpiresAt && process.env.VERCEL_ENV !== "production"))) {
      this.memoryToken = envToken;
      this.memoryExpiresAt = envExpiresAt;
      return envToken;
    }

    // 4. Credential refresh (ONEMAP_EMAIL + ONEMAP_EMAIL_PASSWORD)
    const token = await this.dedupedRefresh();
    if (token) return token;

    if (envToken && envExpiresAt && isExpiring(envExpiresAt)) {
      throw new OneMapSafeError("token_expired", "OneMap search is temporarily unavailable because the server token has expired.", 503);
    }
    throw new OneMapSafeError("missing_token", "OneMap search is temporarily unavailable because server credentials are not configured.", 503);
  }

  /**
   * Public: called by the cron job and health endpoint.
   * Forces a credential refresh regardless of current token state.
   */
  async forceRefresh(): Promise<{ token: string; expiresAt: number } | undefined> {
    const email = process.env.ONEMAP_EMAIL?.trim();
    const password = process.env.ONEMAP_EMAIL_PASSWORD?.trim();
    if (!email || !password) return undefined;

    const owner = crypto.randomUUID();
    const acquired = await cacheAdapter.acquireLease(TOKEN_REFRESH_LEASE_KEY, owner, 20).catch(() => true);
    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return cacheAdapter.get<{ token: string; expiresAt: number }>(TOKEN_CACHE_KEY).catch(() => undefined);
    }
    try {
      const result = await this.fetchToken(email, password);
      if (!result) return undefined;
      await this.persistToken(result.token, result.expiresAt);
      return result;
    } finally {
      await cacheAdapter.releaseLease(TOKEN_REFRESH_LEASE_KEY, owner).catch(() => undefined);
    }
  }

  invalidate() {
    this.memoryToken = undefined;
    this.memoryExpiresAt = undefined;
  }

  private async dedupedRefresh(): Promise<string | undefined> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshWithRetry().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refreshWithRetry(attempt = 0): Promise<string | undefined> {
    const email = process.env.ONEMAP_EMAIL?.trim();
    const password = process.env.ONEMAP_EMAIL_PASSWORD?.trim();
    if (!email || !password) return undefined;

    const result = await this.forceRefresh();
    if (result) return result.token;

    if (attempt < REFRESH_RETRY_MAX) {
      const delay = retryBackoffMs(attempt, REFRESH_BASE_MS);
      logEvent("warn", "onemap.token_refresh.retry", { attempt: String(attempt + 1), delayMs: String(delay) });
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.refreshWithRetry(attempt + 1);
    }

    logEvent("error", "onemap.token_refresh.exhausted", { attempts: String(REFRESH_RETRY_MAX + 1) });
    return undefined;
  }

  private async fetchToken(email: string, password: string) {
    const baseUrl = getOneMapBaseUrl();
    const response = await fetch(`${baseUrl}/api/auth/post/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logEvent("warn", "onemap.token_refresh.failed", {
        status: response.status,
        body: body.slice(0, 200),
      });
      observeMetric("onemap.token_refresh.failed", 1, { status: String(response.status) });
      return undefined;
    }

    const payload = (await response.json().catch(() => undefined)) as { access_token?: unknown; expiry_timestamp?: unknown } | undefined;
    if (typeof payload?.access_token !== "string" || !payload.access_token.trim()) return undefined;

    const expiresAt = parseExpiry(payload.expiry_timestamp);
    observeMetric("onemap.token_refresh.success", 1);
    return { token: payload.access_token.trim(), expiresAt: expiresAt ?? Date.now() + 72 * 60 * 60 * 1000 };
  }

  private async persistToken(token: string, expiresAt: number) {
    this.memoryToken = token;
    this.memoryExpiresAt = expiresAt;

    try {
      await cacheAdapter.set(TOKEN_CACHE_KEY, { token, expiresAt }, { ttlSeconds: TOKEN_TTL_SECONDS });
    } catch {
      // Redis unavailable — in-memory only, will refresh on next cold start
    }
  }
}

export function getOneMapBaseUrl() {
  return (process.env.ONEMAP_API_BASE_URL ?? "https://www.onemap.gov.sg").replace(/\/$/, "");
}

function parseExpiry(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function isExpiring(expiresAt: number | undefined, now = Date.now()) {
  return expiresAt === undefined || expiresAt - now < REFRESH_THRESHOLD_MS;
}

export const isExpiredOrExpiring = isExpiring;

export const oneMapTokenService = new OneMapTokenService();
