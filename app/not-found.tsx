"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: "var(--spacing-8)" }}>
      <div style={{ textAlign: "center", maxWidth: "480px" }}>
        <h1 style={{ fontSize: "3rem", marginBottom: "var(--spacing-2)", color: "var(--color-muted)" }}>404</h1>
        <h2 style={{ marginBottom: "var(--spacing-4)" }}>{t("notFound.title")}</h2>
        <p className="body-copy" style={{ marginBottom: "var(--spacing-6)" }}>
          {t("notFound.body")}
        </p>
        <div style={{ display: "flex", gap: "var(--spacing-3)", justifyContent: "center" }}>
          <Link href="/" className="live-primary-button">{t("notFound.goToMap")}</Link>
          <Link href="/rules" style={{ display: "inline-flex", alignItems: "center", padding: "var(--spacing-2) var(--spacing-4)", border: "1px solid var(--color-outline-light)", borderRadius: "var(--radius-md)", color: "var(--color-text)", textDecoration: "none" }}>
            {t("notFound.browseRules")}
          </Link>
        </div>
      </div>
    </main>
  );
}
