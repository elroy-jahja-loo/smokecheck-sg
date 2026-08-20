import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!dsn) {
  console.warn("[sentry] Edge SDK not initialized: missing NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN");
} else {
  Sentry.init({
    dsn,

    tracesSampler: (context) => {
      if (context.request?.url?.includes("/api/health")) return 0;
      if (context.request?.url?.includes("/api/")) return 0.5;
      return 0.1;
    },

    tracePropagationTargets: ["localhost", appOrigin],

    profilesSampleRate: 0.1,

    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",

    debug: process.env.NODE_ENV === "development",

    enableLogs: true,

    dataCollection: {},
  });
}
//r
