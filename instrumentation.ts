import * as Sentry from "@sentry/nextjs";
import { registerOTel } from "@vercel/otel";
import type { Instrumentation } from "next";

import { validateEnvironment } from "@/lib/env";
import { runInstrumentationRegistration } from "@/lib/observability/instrumentation-runtime";
import { logEvent, observeMetric } from "@/lib/observability/logging";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const environment = validateEnvironment();
    if (process.env.VERCEL_ENV === "production" && !environment.valid) {
      throw new Error("Production environment validation failed. Configure all required production variables before deploying.");
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  await runInstrumentationRegistration(process.env, { registerOTel, logEvent });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await Sentry.withScope(async (scope) => {
    scope.setTag("runtime", process.env.NEXT_RUNTIME ?? "unknown");
    scope.setTag("request_method", request.method ?? "unknown");
    scope.setTag("route_type", context.routeType ?? "unknown");
    scope.setTag("router_kind", context.routerKind ?? "unknown");
    scope.setContext("request", {
      path: request.path,
      method: request.method,
    });
    scope.setContext("route", {
      path: context.routePath,
      type: context.routeType,
      routerKind: context.routerKind,
      renderSource: context.renderSource,
    });
    await Sentry.captureRequestError(error, request, context);
  });

  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  observeMetric("server.request.errors", 1, {
    routeType: context.routeType,
    routerKind: context.routerKind,
    routePath: context.routePath,
  });

  logEvent("error", "server.request.error", {
    message,
    digest,
    requestPath: request.path,
    requestMethod: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
};
