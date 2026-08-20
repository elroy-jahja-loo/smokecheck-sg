"use client";

import { AlertBanner } from "@/components/alert-banner";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { PublicFooter } from "@/components/public-footer";
import { SourceRow } from "@/components/source-row";
import { allSourceMetadata } from "@/data/prototype-data";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { getDataSyncStatus } from "@/lib/operations/system-status";

const dataModeLabel = process.env.USE_POSTGIS_DATA === "true" ? "Synced public dataset mode" : "Built-in fallback dataset mode";

type Props = {
  syncStatus: Awaited<ReturnType<typeof getDataSyncStatus>>;
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function formatLatestSync(syncStatus: Awaited<ReturnType<typeof getDataSyncStatus>>, t: (key: string) => string, locale: string) {
  const latest = syncStatus
    .map((entry) => entry.lastSuccessfulSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return latest ? formatDate(latest, locale) : t("sourcesPage.noSyncRecorded");
}

export function SourcesPageContent({ syncStatus }: Props) {
  const { locale, t } = useI18n();
  const staleSources = syncStatus.filter((entry) => entry.stale).length;

  return (
    <main className="page-shell">
      <AppHeader />
      <div className="container sources-page bottom-safe-area">
        <div className="sources-document">
          <div className="sources-hero">
            <p className="eyebrow">{t("sources.title")}</p>
            <h1 className="section-title">{t("sources.title")}</h1>
            <p className="body-copy">{t("sources.intro")}</p>
          </div>

          <AlertBanner tone="warning"><strong>{t("sources.disclaimerTitle")}:</strong> {t("sources.disclaimerBody")} {t("sourcesPage.smokecheckDisclaimer")}</AlertBanner>

          <section className="sources-summary-grid" aria-label={t("sources.dataSources")}>
            <Card title={t("sources.dataSources")} className="sources-feature-card">
              <ul className="stack-sm">
                <li><strong>{t("sources.oneMap")}:</strong> {t("sourcesPage.oneMapDesc")}</li>
                <li><strong>{t("sources.neaPages")}:</strong> {t("sourcesPage.neaDesc")}</li>
                <li><strong>{t("sources.dataGovSg")}:</strong> {t("sourcesPage.datagovDesc")}</li>
              </ul>
            </Card>
            <Card title={t("sources.dataFreshness")} className="sources-feature-card">
              <div className="freshness-grid">
                <div>
                  <Badge tone={staleSources > 0 ? "warning" : "success"}>{staleSources > 0 ? t("sourcesPage.freshnessWarning") : t("sourcesPage.datasetLoaded")}</Badge>
                  <p className="body-copy">{t("sourcesPage.datasetDescription")}</p>
                </div>
                <div className="sources-sync-note">
                  <span>{t("sources.dataSources")}</span>
                  <strong>{dataModeLabel}</strong>
                </div>
                <div className="sources-sync-note">
                  <span>{t("sources.lastSync")}</span>
                  <strong>{formatLatestSync(syncStatus, t, locale)}</strong>
                </div>
              </div>
            </Card>
          </section>

          <section className="sources-records" aria-label={t("sources.syncStatus")}>
            <div className="sources-section-heading">
              <h2>{t("sources.syncStatus")}</h2>
              <p>{t("sourcesPage.runtimeStatusNote")}</p>
            </div>
            <div className="sync-status-grid">
              {syncStatus.map((entry) => (
                <article key={entry.sourceId} className={entry.stale ? "sync-status-card sync-status-card--stale" : "sync-status-card"}>
                  <span>{entry.status}</span>
                  <strong>{entry.source?.name ?? entry.sourceId}</strong>
                  <small>{entry.lastSuccessfulSyncAt ? `${t("sourcesPage.lastSuccessPrefix")}${formatDate(entry.lastSuccessfulSyncAt, locale)}` : t("sourcesPage.noSyncRecorded")}</small>
                  {entry.datasetVersion ? <small>{entry.datasetVersion}</small> : null}
                  {entry.featureCount !== undefined ? <small>{entry.featureCount.toLocaleString(locale)} {t("sourcesPage.featuresSuffix")}</small> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="sources-records" aria-label={t("sources.dataSources")}>
            <div className="sources-section-heading">
              <h2>{t("sources.dataSources")}</h2>
              <p>{t("sourcesPage.everyResult")}</p>
            </div>
            <div className="sources-record-grid">
              {allSourceMetadata.map((source) => <SourceRow key={source.id} source={source} />)}
            </div>
          </section>

          <div className="sources-info-grid">
            <section className="sources-info-section" aria-label={t("sourcesPage.ariaPrivacy")}>
              <h2>{t("sources.privacyTitle")}</h2>
              <div className="sources-info-card sources-info-card--tinted">
                <p>{t("sources.privacyBody")}</p>
              </div>
            </section>

            <section className="sources-info-section" aria-label={t("sourcesPage.ariaLimitations")}>
              <h2>{t("sources.limitationsTitle")}</h2>
              <div className="sources-info-card">
                <p>{t("sourcesPage.usersMustKnow")}</p>
                <ol>
                  <li>{t("sourcesPage.gpsInaccuracy")}</li>
                  <li>{t("sourcesPage.microGeographies")}</li>
                  <li>{t("sourcesPage.temporaryChanges")}</li>
                </ol>
              </div>
            </section>
          </div>

          <div className="page-action-row"><Button href="/" variant="secondary">{t("rules.backToMap")}</Button></div>
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
