"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/i18n-provider";

export function OfficerLoginForm() {
  const { t } = useI18n();
  const [status, setStatus] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  async function submitLogin() {
    setIsLoading(true);
    setStatus(undefined);
    try {
      const response = await fetch("/api/officer/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "public-demo" }),
      });
      const payload = await response.json().catch(() => undefined) as { redirectTo?: string; message?: string; csrfToken?: string } | undefined;
      if (!response.ok) throw new Error(payload?.message ?? t("loginForm.loginFailed"));
      if (payload?.csrfToken) window.sessionStorage.setItem("smokecheck:csrf", payload.csrfToken);
      window.location.assign(payload?.redirectTo ?? "/ops/dashboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("loginForm.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="officer-login-form ops-login-form">
      <button className="ops-singpass-action officer-login-submit" type="button" onClick={submitLogin} disabled={isLoading}>{isLoading ? t("loginForm.loading") : t("loginForm.loginButton")}</button>
      <p className="officer-muted">{t("loginForm.mockNote")}</p>
      {status ? <p className="live-error" role="status">{status}</p> : null}
    </div>
  );
}
