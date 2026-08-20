"use client";

import { OpsDlqControls } from "@/components/ops-dlq-controls";
import { useI18n } from "@/lib/i18n/i18n-provider";

type SyncStatus = {
  sourceId: string;
  sourceName?: string;
  status: string;
  lastSuccessfulSyncAt?: string;
  checksum?: string;
  stale: boolean;
};

type DeadLetter = {
  id: string;
  status: string;
  eventName: string;
  failureReason: string;
  provider: string;
  retryable: boolean;
  createdAt: string;
};

type OpsAdminContentProps = {
  displayName: string;
  postgisConfigured: boolean;
  redisConfigured: boolean;
  queueProvider: string;
  syncStatus: SyncStatus[];
  deadLetters: DeadLetter[];
  canMutateDlq: boolean;
};

export function OpsAdminContent({ displayName, postgisConfigured, redisConfigured, queueProvider, syncStatus, deadLetters, canMutateDlq }: OpsAdminContentProps) {
  const { t } = useI18n();

  return (
    <main className="ops-page-shell ops-admin-page">
      <header className="ops-topbar">
        <div><span className="ops-shield" aria-hidden="true">ZB</span><strong>{t("officer.login.title")}</strong><em>{t("opsAdmin.admin")}</em></div>
        <nav aria-label={t("ariaOfficerUtilities")}><span>{displayName}</span><a href="/ops/dashboard">{t("opsAdmin.dashboard")}</a><a href="/sources">{t("nav.sources")}</a></nav>
      </header>
      <section className="ops-admin-grid">
        <article className="ops-admin-card"><span>PostGIS</span><strong>{postgisConfigured ? t("opsAdmin.configured") : t("opsAdmin.missing")}</strong></article>
        <article className="ops-admin-card"><span>Redis</span><strong>{redisConfigured ? t("opsAdmin.configured") : t("opsAdmin.missing")}</strong></article>
        <article className="ops-admin-card"><span>{t("opsAdmin.queue")}</span><strong>{queueProvider}</strong></article>
        <article className="ops-admin-card"><span>{t("opsAdmin.deadLetters")}</span><strong>{deadLetters.length}</strong></article>
      </section>
      <section className="ops-admin-table" aria-label={t("opsAdmin.datasetSyncDashboard")}>
        <h1>{t("opsAdmin.datasetSyncDashboard")}</h1>
        <div className="sync-status-grid">
          {syncStatus.map((entry) => (
            <article key={entry.sourceId} className={entry.stale ? "sync-status-card sync-status-card--stale" : "sync-status-card"}>
              <span>{entry.status}</span>
              <strong>{entry.sourceName ?? entry.sourceId}</strong>
              <small>{entry.lastSuccessfulSyncAt ?? t("opsAdmin.noSuccessfulSync")}</small>
              {entry.checksum ? <small>{t("opsAdmin.checksum")}: {entry.checksum.slice(0, 16)}...</small> : null}
            </article>
          ))}
        </div>
      </section>
      <section className="ops-admin-table" aria-label={t("opsAdmin.queueDeadLetters")}>
        <h2>{t("opsAdmin.queueDeadLetters")}</h2>
        <p>{canMutateDlq ? t("opsAdmin.actionsEnabled") : t("opsAdmin.readOnly")}</p>
        <div className="sync-status-grid">
          {deadLetters.map((entry) => (
            <article key={entry.id} className="sync-status-card">
              <span>{entry.status}</span>
              <strong>{entry.eventName}</strong>
              <small>{entry.failureReason}</small>
              <small>{t("opsAdmin.provider")}: {entry.provider}</small>
              <small>{t("opsAdmin.retryable")}: {entry.retryable ? t("opsAdmin.yes") : t("opsAdmin.no")}</small>
              <small>{t("opsAdmin.created")}: {entry.createdAt}</small>
              {canMutateDlq ? <OpsDlqControls id={entry.id} retryable={entry.retryable} /> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
