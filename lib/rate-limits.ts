/**
 * External API Rate Limits — sourced from official documentation (2026).
 *
 * OneMap (SLA): https://www.onemap.gov.sg
 *   Auth: token-based via POST /api/auth/post/getToken (email + password)
 *   Token lifetime: 3 days (72 hours). Auto-refresh at 6 hours before expiry.
 *   Rate limit: 250 requests/minute per IP across all endpoints.
 *   Response on limit: HTTP 429 with Retry-After header.
 *   Documentation ref: OneMap Developer Portal (requires login).
 *
 * Data.gov.sg (GovTech): https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
 *   Auth: x-api-key header. Optional for testing; required for higher limits.
 *   Rate limits reset every 10 seconds:
 *
 *   | API Endpoint            | No Key | Dev Key | Prod Key |
 *   |-------------------------|--------|---------|----------|
 *   | v2 Realtime API         | 6      | 12      | 30       |
 *   | Datastore Search        | 4      | 8       | 20       |
 *   | Dataset Downloads       | 2      | 4       | 10       |
 *
 *   API key generation: https://data.gov.sg → Login → Create API Key
 *   Key types: Developer (testing/staging) or Production (operational).
 *   Documentation: https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits.md
 *
 * NEA: No public API. Static pages only.
 *   Source: https://www.nea.gov.sg/our-services/smoking-prohibition/overview
 *   Used for rule text and legislation references only.
 */

export const externalApiRateLimits = {
  onemap: {
    requestsPerMinute: 250,
    tokenLifetimeHours: 72,
    tokenRefreshThresholdHours: 6,
    authMethod: "token" as const,
    authEndpoint: "/api/auth/post/getToken",
    docsUrl: "https://www.onemap.gov.sg",
  },

  datagov: {
    requestsPer10Seconds: {
      withoutKey: { realtime: 6, search: 4, download: 2 },
      devKey: { realtime: 12, search: 8, download: 4 },
      prodKey: { realtime: 30, search: 20, download: 10 },
    },
    windowSeconds: 10,
    authMethod: "api-key" as const,
    authHeader: "x-api-key" as const,
    keyRegistrationUrl: "https://data.gov.sg",
    docsUrl: "https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits.md",
  },

  nea: {
    authMethod: "none" as const,
    type: "static-pages" as const,
    docsUrl: "https://www.nea.gov.sg/our-services/smoking-prohibition/overview",
  },
} as const;

export function getDatagovRateLimit() {
  const hasApiKey = Boolean(process.env.DATAGOV_API_KEY?.trim());
  if (!hasApiKey) return externalApiRateLimits.datagov.requestsPer10Seconds.withoutKey;
  return externalApiRateLimits.datagov.requestsPer10Seconds.devKey;
}

