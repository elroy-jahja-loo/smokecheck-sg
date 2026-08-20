# SmokeCheck SG

SmokeCheck SG is a mobile-first Singapore smoking-rule guidance prototype. It combines OneMap location services, Data.gov.sg geospatial datasets, PostgreSQL/PostGIS, source provenance, GPS uncertainty, and accessible public guidance. It is not affiliated with or endorsed by OGP, NEA, SLA, GovTech, or any government agency, and it must not be used as the sole basis for enforcement or legal decisions.

## Release Boundary

- Public map, search, rules, source, and health routes are the production release scope.
- Officer and report routes are intentionally unavailable when `VERCEL_ENV=production` because the repository contains only a mock identity flow. Do not enable operational data until a reviewed OIDC/sgID integration, MFA, logout/revocation, and end-to-end authorization tests exist.
- Evidence/photo upload is not implemented and must remain disabled until malware scanning, signed upload URLs, MIME/size validation, metadata stripping, retention, and authorized evidence handling are implemented.
- A deployment is not ready merely because it builds. The production environment validation, Supabase migrations, external monitoring, Sentry alerts, and post-deploy checks below must all pass.

## Stack

- Next.js 16, React 19, and TypeScript on Node.js 22
- Vercel hosting and cron delivery
- Supabase PostgreSQL with PostGIS and pgvector
- Upstash Redis and QStash
- S3-compatible immutable snapshot storage with 15-day Data.gov.sg snapshot retention
- OneMap and Data.gov.sg
- Sentry and Vercel OpenTelemetry
- Cloudflare Turnstile on abuse-sensitive public endpoints

## Public Architecture

```text
Browser
  -> Vercel Proxy: request IDs, security headers, CORS, emergency rate limiting
  -> Next.js route handlers
     -> Upstash Redis: shared cache, rate limits, token-refresh lease
     -> Supabase PostGIS: bounded point/viewport queries and provenance
     -> OneMap: search, reverse geocoding, walking routes
     -> Data.gov.sg: scheduled, validated, checksummed snapshots
     -> QStash: signed asynchronous event delivery and provider retries
     -> S3-compatible storage: immutable source snapshots
     -> Sentry/OTel: errors, traces, logs, and cron-failure alerts
```

Public geospatial responses use bounded PostGIS functions instead of loading the national dataset into a function instance. Exact GPS values and officer identifiers are redacted from structured logs.

## Reliability Behavior

| Failure | Behavior | Operator action |
| --- | --- | --- |
| PostgreSQL unavailable | Location status falls back to clearly marked prototype data and always returns `uncertain`; viewport data uses a 24-hour stale cache, then bounded seed data. | Alert, inspect Supabase status/logs, restore service, verify authenticated readiness. |
| Redis unavailable | Cache operations fall back locally; abuse limits become a stricter per-instance emergency limit. Distributed consistency is degraded and readiness fails. | Restore Redis; do not treat local fallback as normal production operation. |
| QStash publish failure | HTTP and transport failures are sent to the PostgreSQL dead-letter store before the publisher throws. If both QStash and PostgreSQL are unavailable, the request fails without acknowledging delivery. Signed deliveries are never republished recursively. | Inspect the provider DLQ and authenticated DLQ tooling; replay only idempotent handlers. |
| Duplicate Data.gov.sg cron | A source-scoped PostgreSQL advisory lock serializes publication. Existing checksums are successful no-ops. Feature IDs are version-scoped. | No action unless overlap persists; inspect scheduler duplication. |
| Bad Data.gov.sg snapshot | Non-HTTPS/unapproved hosts, redirects, oversized downloads, invalid UTF-8, invalid GeoJSON, and empty datasets are rejected without replacing the active version. | Review the upstream dataset and allow-list changes before retrying. |
| OneMap token expires or is rejected | A `401/403` invalidates the local token, obtains one refresh lease through Redis, and retries once. A Vercel cron refreshes proactively every two days. | Check OneMap credentials, Redis, and Sentry if refresh fails. |
| Vercel cron is missed | Vercel cron is best effort; the application records failures but cannot guarantee platform delivery. | Configure Sentry missed-run monitoring and a separately managed QStash/manual recovery schedule. |
| Sentry or OTLP exporter unavailable | Requests continue and redacted console logs remain available, but centralized telemetry is degraded. | Restore the telemetry integration and verify a test event in a preview deployment. |

No free-tier keep-alive technique guarantees indefinite uptime. For a public release that must not pause, use a paid Supabase plan with backups/PITR and an appropriate SLA, plus an independent external uptime monitor. Do not use frequent health probes to evade provider inactivity policies.

## Security Controls

- Production fails startup when required database, Redis, QStash, cron, object-storage, OneMap, Turnstile, or Sentry configuration is missing.
- The public presentation workspace opens a synthetic demo officer session with one click. It does not collect credentials or expose provider configuration; the Data.gov.sg sync trigger remains internal-only.
- Cron handlers validate a timing-safe bearer secret inside each handler; Proxy checks are only defense in depth.
- QStash signatures use the official `@upstash/qstash` receiver and validate the signed body and destination URL.
- State-changing prototype routes use origin checks, CSRF protection, JSON validation, role checks, and idempotency keys.
- Global CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, COOP/CORP, and permissions policy are configured.
- `.env*`, `opencode.json`, `.opencode/`, `.vercel/`, private keys, local artifacts, source maps, and Sentry build credentials are excluded from Git.
- `npm run security:secrets` rejects forbidden tracked files and common credential formats in CI.
- Supabase client roles have no direct table access; exposed tables use RLS and explicit deny policies.
- Sensitive offender identifier columns were removed from the connected database.
- Dependency audit currently reports zero known vulnerabilities.

If any real credential has ever appeared in a local config, terminal transcript, issue, message, build log, or commit, rotate it at the provider. Adding the file to `.gitignore` is not remediation.

## Local Development

```bash
cp .env.local.example .env.local
npm ci
npm run dev
```

The default local mode uses seed geospatial data. Mock officer screens are for local/preview demonstration only.

## Required Vercel Setup

Configure secrets in Vercel project settings, never in Git. Production validation requires coherent values for these groups:

| Group | Variables |
| --- | --- |
| App | `NEXT_PUBLIC_APP_URL`, `SMOKECHECK_ALLOWED_ORIGINS`, `USE_POSTGIS_DATA=true` |
| Database | `POSTGIS_DATABASE_URL`, `POSTGIS_POOL_SIZE=1`, `POSTGIS_SSL_CA` |
| Redis | `REDIS_URL`, `REDIS_TOKEN` |
| Queue | `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `QSTASH_PUBLISH_DESTINATION_URL` |
| Internal auth | `CRON_SECRET`, `WORKER_INTERNAL_SECRET`; optionally a distinct `SMOKECHECK_INTERNAL_SECRET` |
| OneMap | `ONEMAP_EMAIL`, `ONEMAP_EMAIL_PASSWORD`, `ONEMAP_API_BASE_URL` |
| Data sync | Data.gov.sg dataset IDs and optionally `DATAGOV_API_KEY` |
| Object storage | `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` |
| Bot control | `BOT_PROTECTION_MODE=turnstile`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `BOT_PROTECTION_ALLOWED_HOSTNAMES` |
| Sentry | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` |
| Telemetry | `OTEL_SERVICE_NAME`; optional custom `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` |

Use the Supabase transaction pooler intended for serverless workloads for the runtime database URL. Use a separate direct, privileged connection only for migrations. Runtime credentials should not be database-owner credentials.

`vercel.json` schedules:

- OneMap token refresh every two days.
- Data.gov.sg synchronization daily at 02:00 UTC.

Vercel sends `Authorization: Bearer <CRON_SECRET>` to cron handlers when `CRON_SECRET` is configured. Challenge rules are deliberately not placed on machine-to-machine cron/worker paths because application-layer signatures and secrets already authenticate them.

## Database

The connected Supabase project has all migrations in `supabase/migrations/` applied. The migration filenames match the remote migration versions. Current safeguards include:

- PostGIS and pgvector extensions.
- Version-scoped geospatial primary keys.
- One active dataset version per source.
- Source/checksum uniqueness and serialized publication.
- RLS and explicit client-deny policies.
- Durable queue dead letters.
- Sensitive identifier removal.
- Supporting foreign-key and geospatial indexes.

After every schema change, run Supabase security and performance advisors. Unused-index notices are expected while tables are empty; reassess them only after representative production traffic.

## Health And Monitoring

- `GET /api/health` is a public, cheap liveness check and exposes no dependency details.
- `GET /api/internal/ready` is an authenticated readiness check using `Authorization: Bearer <SMOKECHECK_INTERNAL_SECRET-or-CRON_SECRET>` and probes PostgreSQL, Redis, and queue configuration.
- Configure an external monitor for liveness and an authenticated monitor for readiness.
- Configure Sentry alerts for cron failures, 5xx rate, OneMap refresh failures, Data.gov.sg sync failures, DLQ growth, and missing expected cron check-ins.
- Verify browser, server, and cron events in a Vercel preview before promoting production.

## Release Verification

```bash
npm run security:secrets
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npm run sbom
```

CI runs the same gates and uploads a CycloneDX SBOM artifact. Before production promotion:

1. Confirm all GitHub checks pass from a clean clone.
2. Confirm Vercel production environment validation passes without fallback warnings.
3. Confirm all Supabase migrations are present and security advisors return no findings.
4. Confirm `GET /api/health` returns `200`.
5. Confirm authenticated `GET /api/internal/ready` returns `200` with every check `ok`.
6. Trigger each cron in preview with the correct bearer secret and verify the corresponding Sentry event/check-in.
7. Verify a OneMap search, reverse geocode, route request, and forced token refresh.
8. Run one Data.gov.sg sync twice and confirm the second publication is an idempotent success.
9. Verify QStash rejects an invalid signature and atomically records the audit side effect plus receipt for a valid provider delivery.
10. Verify the public demo login reaches `/ops/dashboard`, supports synthetic dashboard/reporting workflows, and keeps `/api/internal/sync/datagov` internal-only.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run smoke:test
npm run sync:datagov
npm run tiles:generate
npm run load:smokecheck
npm run security:secrets
npm run sbom
```

## Data Sources

- [NEA smoking prohibition guidance](https://www.nea.gov.sg/our-services/smoking-prohibition/overview)
- [Singapore Statutes Online](https://sso.agc.gov.sg/Act/SPCPA1992)
- [Data.gov.sg](https://data.gov.sg)
- [OneMap](https://www.onemap.gov.sg)

Source URLs, checksums, retrieval timestamps, version metadata, and immutable snapshot paths are recorded for provenance. Cloudflare R2 deletes `datagov/` snapshot objects after 15 days, and the nightly retention job deletes inactive `dataset_versions` records after 15 days. The active database version remains for map continuity, so its recorded snapshot path can expire if Data.gov.sg synchronization has not succeeded within that period. Physical signs, current law, and official agency instructions always prevail.

## License And Status

This repository is a portfolio prototype. Public guidance functionality may be deployed only after the release checklist passes. Officer functionality is not production-ready and is deliberately blocked in production until real identity federation and authorized operational governance are implemented.
