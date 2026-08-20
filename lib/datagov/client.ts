import { getDataGovApiBaseUrl } from "@/lib/datagov/config";
import { getDatagovRateLimit, externalApiRateLimits } from "@/lib/rate-limits";
import { logEvent } from "@/lib/observability/logging";

export type DataGovPollDownloadResponse = {
  code: number;
  data?: {
    url?: string;
    lastUpdated?: string;
    last_updated?: string;
  };
  errMsg?: string;
};

export class DataGovClient {
  constructor(
    private readonly options: {
      baseUrl?: string;
      apiKey?: string;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  get apiKey() {
    return this.options.apiKey?.trim();
  }

  get rateLimit() {
    return getDatagovRateLimit();
  }

  async pollDownload(datasetId: string) {
    const baseUrl = (this.options.baseUrl ?? getDataGovApiBaseUrl()).replace(/\/$/, "");
    const url = `${baseUrl}/v1/public/api/datasets/${encodeURIComponent(datasetId)}/poll-download`;
    const response = await this.fetchImpl(url, {
      headers: this.apiKey ? { "x-api-key": this.apiKey } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 429) {
      logEvent("warn", "datagov.rate_limited", {
        datasetId,
        hasApiKey: Boolean(this.apiKey),
        rateLimitDownloads: this.rateLimit.download,
        retryAfter: response.headers.get("Retry-After"),
      });
      throw new Error(
        `Data.gov.sg rate limit exceeded (${this.rateLimit.download} req/10s without key, ` +
        `${this.rateLimit.search} with Dev key, ${externalApiRateLimits.datagov.requestsPer10Seconds.prodKey.download} with Prod key). ` +
        `Register an API key at ${externalApiRateLimits.datagov.keyRegistrationUrl} for higher limits.`
      );
    }

    if (!response.ok) throw new Error(`Data.gov.sg poll-download failed with HTTP ${response.status}`);

    const payload = (await response.json()) as DataGovPollDownloadResponse;
    if (payload.code !== 0 || !payload.data?.url) {
      throw new Error(payload.errMsg || "Data.gov.sg poll-download response did not include a download URL");
    }

    return {
      pollUrl: url,
      downloadUrl: payload.data.url,
      sourceLastUpdated: payload.data.lastUpdated ?? payload.data.last_updated,
    };
  }

  async downloadText(url: string) {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" || !isAllowedDownloadHost(parsedUrl.hostname)) {
      throw new Error("Data.gov.sg returned an unapproved download URL");
    }
    const response = await this.fetchImpl(parsedUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Data.gov.sg GeoJSON download failed with HTTP ${response.status}`);
    return readBoundedText(response, Number(process.env.DATAGOV_MAX_DOWNLOAD_BYTES ?? 50 * 1024 * 1024));
  }

  private get fetchImpl() {
    return this.options.fetchImpl ?? fetch;
  }
}

function isAllowedDownloadHost(hostname: string) {
  if (process.env.VERCEL_ENV !== "production" && hostname.endsWith(".test")) return true;
  const extraHosts = (process.env.DATAGOV_DOWNLOAD_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set(["s3.ap-southeast-1.amazonaws.com", "api-open.data.gov.sg", ...extraHosts]).has(hostname.toLowerCase());
}

async function readBoundedText(response: Response, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("DATAGOV_MAX_DOWNLOAD_BYTES must be a positive integer");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Data.gov.sg download exceeds the configured size limit");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Data.gov.sg download exceeds the configured size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
