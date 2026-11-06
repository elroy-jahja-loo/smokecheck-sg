export function buildContentSecurityPolicy(env: NodeJS.ProcessEnv = process.env) {
  // Browser telemetry goes directly to this configured Sentry origin, not a
  // Vercel Function. Do not allow arbitrary external connections or expose DSNs.
  const connectSources = ["'self'"];
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN ?? env.SENTRY_DSN;
  if (dsn) {
    try {
      const url = new URL(dsn);
      if (url.protocol === "https:" || (env.NODE_ENV === "development" && url.protocol === "http:")) {
        connectSources.push(url.origin);
      }
    } catch {
      // An invalid DSN must not weaken the policy or prevent a build.
    }
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://form.gov.sg",
    "frame-ancestors 'none'",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.onemap.gov.sg",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}
