"use client";

import { GovernmentMasthead } from "@/components/government-masthead";
import { OfficerLoginForm } from "@/components/officer-login-form";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function OfficerLoginPage() {
  const { t } = useI18n();

  return (
    <>
      <GovernmentMasthead />
      <main className="ops-login-shell">
      <section className="ops-login-visual" aria-label={t("officer.login.overviewAria")}>
        <div className="ops-login-brand">
          <span className="ops-shield" aria-hidden="true">ZB</span>
          <strong>{t("officer.login.title")}</strong>
          <em>{t("officer.login.subtitle")}</em>
        </div>
        <div className="ops-radar-card">
          <span>{t("officer.login.opPreview")}</span>
          <h1>{t("officer.login.heading")}</h1>
          <p>{t("officer.login.previewNote")}</p>
          <div className="ops-radar-grid" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
        </div>
        <div className="ops-login-stat-row">
          <div><strong>3</strong><span>{t("officer.login.activeClusters")}</span></div>
          <div><strong>61</strong><span>{t("officer.login.demoReports")}</span></div>
          <div><strong>0</strong><span>{t("officer.login.realActions")}</span></div>
        </div>
      </section>
      <section className="ops-login-panel" aria-labelledby="officer-login-title">
        <div className="ops-login-card">
          <div>
            <p className="ops-eyebrow">{t("officer.login.authorisedOnly")}</p>
            <h1 id="officer-login-title">{t("officer.login.title")}</h1>
            <p>{t("officer.login.mockNote")}</p>
          </div>
          <OfficerLoginForm />
          <div className="ops-login-safety">
            <strong>{t("officer.login.safeBoundary")}</strong>
            <span>{t("officer.login.safeNote")}</span>
          </div>
        </div>
      </section>
      </main>
    </>
  );
}
