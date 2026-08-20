"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/i18n-provider";

export function OpsDlqControls({ id, retryable }: { id: string; retryable: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function mutate(action: "retry" | "resolve" | "delete") {
    setBusy(true);
    try {
      const csrfToken = window.sessionStorage.getItem("smokecheck:csrf") ?? "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      await fetch("/api/queue/dead-letter", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ action, id }),
      });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button type="button" disabled={busy || !retryable} onClick={() => void mutate("retry")}>{t("opsDlq.retry")}</button>
      <button type="button" disabled={busy} onClick={() => void mutate("resolve")}>{t("opsDlq.resolve")}</button>
      <button type="button" disabled={busy} onClick={() => void mutate("delete")}>{t("opsDlq.delete")}</button>
    </div>
  );
}
