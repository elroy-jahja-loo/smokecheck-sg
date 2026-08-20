"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";

type Props = {
  displayName: string;
  canOpenOpsAdmin: boolean;
};

export function OpsDashboardHeader({ displayName, canOpenOpsAdmin }: Props) {
  const { t } = useI18n();

  return (
    <header className="ops-topbar">
      <div>
        <span className="ops-shield" aria-hidden="true">ZB</span>
        <strong>{t("officer.login.title")}</strong>
        <em>{t("officer.login.subtitle")}</em>
      </div>
      <nav aria-label={t("ariaOfficerUtilities")}>
        <span>{displayName}</span>
        {canOpenOpsAdmin ? <a href="/ops/admin">{t("officer.dashboard.createReport")}</a> : null}
        <a href="/sources">{t("nav.sources")}</a>
      </nav>
    </header>
  );
}
