import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!dsn) {
  console.warn("[sentry] Client SDK not initialized: missing NEXT_PUBLIC_SENTRY_DSN");
} else {
  Sentry.init({
    dsn,

    integrations: [Sentry.replayIntegration()],

    tracesSampler: (context) => {
      if (context.request?.url?.includes("/api/")) return 0.5;
      return 0.1;
    },

    tracePropagationTargets: ["localhost", appOrigin],

    profilesSampleRate: 0.1,

    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",

    debug: process.env.NODE_ENV === "development",

    enableLogs: true,

    replaysSessionSampleRate: 0.1,

    replaysOnErrorSampleRate: 1.0,

    dataCollection: {},

    ...(process.env.NODE_ENV === "development" ? { spotlight: true } : {}),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
