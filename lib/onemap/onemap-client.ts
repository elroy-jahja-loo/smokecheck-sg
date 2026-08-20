import { logEvent, observeMetric } from "@/lib/observability/logging";
import { getOneMapBaseUrl, oneMapTokenService, retryBackoffMs, type OneMapTokenService } from "@/lib/onemap/onemap-token-service";
import { OneMapSafeError } from "@/lib/onemap/onemap-types";

const RETRY_MAX = 2;
const RETRY_BASE_MS = 800;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OneMapClient {
  constructor(private readonly tokenService: OneMapTokenService = oneMapTokenService) {}

  async getJson<T>(path: string, params: URLSearchParams): Promise<T> {
    const url = `${getOneMapBaseUrl()}${path}?${params.toString()}`;

    const makeRequest = async (token: string, canRefresh = true): Promise<T> => {
      const response = await fetch(url, {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(8_000),
      });

      if (response.status === 401 || response.status === 403) {
        logEvent("warn", "onemap.auth.rejected", { status: response.status, path });
        if (canRefresh) {
          this.tokenService.invalidate();
          const refreshed = await this.tokenService.forceRefresh();
          if (refreshed) return makeRequest(refreshed.token, false);
        }
        throw new OneMapSafeError("token_expired", "OneMap is temporarily unavailable. Try again later.", 503);
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        logEvent("warn", "onemap.rate_limited", { path, retryAfter });
        throw new OneMapSafeError("rate_limited", "OneMap is receiving too many requests. Try again shortly.", 429);
      }
      if (!response.ok) {
        logEvent("warn", "onemap.upstream.failed", { status: response.status, path });
        throw new OneMapSafeError("upstream_unavailable", "OneMap is temporarily unavailable. Use rules and on-site signs while retrying.", 503);
      }

      return response.json() as Promise<T>;
    };

    const attempt = async (retries: number): Promise<T> => {
      try {
        return await makeRequest(await this.tokenService.getToken());
      } catch (error) {
        if (error instanceof OneMapSafeError && error.code === "rate_limited" && retries > 0) {
          const delay = retryBackoffMs(RETRY_MAX - retries, 1500);
          observeMetric("onemap.retry.rate_limited", 1, { path, attempt: String(RETRY_MAX - retries + 1), delayMs: String(delay) });
          await sleep(delay);
          return attempt(retries - 1);
        }
        if (error instanceof OneMapSafeError && error.code === "upstream_unavailable" && retries > 0) {
          const delay = retryBackoffMs(RETRY_MAX - retries, RETRY_BASE_MS);
          observeMetric("onemap.retry.upstream", 1, { path, attempt: String(RETRY_MAX - retries + 1), delayMs: String(delay) });
          await sleep(delay);
          return attempt(retries - 1);
        }
        throw error;
      }
    };

    return attempt(RETRY_MAX);
  }
}

export const oneMapClient = new OneMapClient();
