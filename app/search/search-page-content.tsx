"use client";

import { AlertBanner } from "@/components/alert-banner";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { LocationStatusChecker, type MapFeature } from "@/components/location-status-checker";
import { PublicFooter } from "@/components/public-footer";
import { useI18n } from "@/lib/i18n/i18n-provider";

type Props = {
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
  initialMapFeatures?: MapFeature[];
};

export function SearchPageContent({ vectorTileBaseUrl, vectorTileLayerName, initialMapFeatures }: Props) {
  const { t } = useI18n();

  return (
    <main className="page-shell">
      <AppHeader />
      <div className="container stack search-page bottom-safe-area">
        <div className="stack-sm">
          <p className="eyebrow">{t("nav.search")}</p>
          <h1 className="section-title">{t("result.checkLocation")}</h1>
          <p className="body-copy">
            {t("home.guidanceNote")}
          </p>
        </div>

        <AlertBanner tone="warning">
          {t("result.locationOptional")}
        </AlertBanner>

        <LocationStatusChecker
          variant="search"
          vectorTileBaseUrl={vectorTileBaseUrl}
          vectorTileLayerName={vectorTileLayerName}
          initialMapFeatures={initialMapFeatures}
        />

        <section className="state-section" aria-label={t("rules.guidance")}>
          <div className="state-grid">
            <Card title={t("rules.guidance")} tone="default" className="state-grid__intro">
              <p className="body-copy">
                {t("result.awaitingBody")}
              </p>
            </Card>
            <Card title={t("errors.locationUnavailable")} tone="warning" className="fallback-card"><div className="fallback-card__body"><Badge tone="warning">{t("rules.checkSigns")}</Badge><p className="body-copy">{t("home.uncertainBody")}</p><p className="source-line">{t("home.disclaimer")}</p><div className="button-row fallback-card__actions"><Button href="/" variant="secondary">{t("rules.backToMap")}</Button><Button href="/rules" variant="ghost">{t("nav.rules")}</Button></div></div></Card>
          </div>
        </section>
      </div>
      <PublicFooter />
    </main>
  );
}
