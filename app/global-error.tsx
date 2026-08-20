"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import englishMessages from "@/lib/i18n/translations/en.json";
import type { SupportedLocale } from "@/lib/i18n/i18n-provider";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const [messages, setMessages] = useState<Record<string, unknown>>(englishMessages);
  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setTag("error_boundary", "global-error");
      if (error.digest) scope.setTag("error_digest", error.digest);
      scope.setContext("error_context", {
        name: error.name,
        message: error.message,
      });
      Sentry.captureException(error);
    });
  }, [error]);

  useEffect(() => {
    const locale = window.localStorage.getItem("smokecheck:locale") as SupportedLocale | null;
    if (!locale || locale === "en") return;
    void import(`@/lib/i18n/translations/${locale}.json`).then((module) => setMessages(module.default ?? module));
  }, []);

  const t = (key: string) => {
    const value = key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, messages);
    return typeof value === "string" ? value : key;
  };

  return (
    <html lang="en-SG">
      <body className="page-shell">
        <main className="container" style={{ display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center" }}>
          <section className="stack-sm" role="alert">
            <h1>{t("errorBoundary.title")}</h1>
            <p>{t("errorBoundary.body")}</p>
            <button type="button" className="live-primary-button" onClick={() => window.location.reload()}>{t("errorBoundary.refresh")}</button>
          </section>
        </main>
      </body>
    </html>
  );
}
