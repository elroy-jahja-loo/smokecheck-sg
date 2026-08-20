"use client";

import { useState } from "react";
import Link from "next/link";

import { AlertBanner } from "@/components/alert-banner";
import { AppHeader } from "@/components/app-header";
import { CommunityAddOverlay } from "@/components/community-add-overlay";
import { ErrorBoundary } from "@/components/error-boundary";
import { LocationStatusChecker, type MapFeature } from "@/components/location-status-checker";
import { PublicFooter } from "@/components/public-footer";
import { sourceMetadata } from "@/data/prototype-data";
import { trackEvent } from "@/lib/analytics/client";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { ReactNode } from "react";

type Props = {
  signageMode: boolean;
  initialQuery?: string;
  initialLat?: string;
  initialLng?: string;
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
  initialMapFeatures?: MapFeature[];
};

export function HomePageContent({ signageMode, initialQuery, initialLat, initialLng, vectorTileBaseUrl, vectorTileLayerName, initialMapFeatures }: Props) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <main className="page-shell">
      <AppHeader />
      <div className="container stack map-page bottom-safe-area">
        <AlertBanner>
          {t("home.alert")}
        </AlertBanner>

        <p className="home-what-is-this">{t("home.whatIsThis")}</p>

        {signageMode ? (
          <AlertBanner tone="info">
            {t("home.signageAlert")}
          </AlertBanner>
        ) : null}

        <section className="public-map-home" aria-labelledby="home-title">
          <div className="public-map-home__intro stack-sm">
            <p className="eyebrow">{t("home.eyebrow")}</p>
            <h1 id="home-title" className="section-title">{t("home.title")}</h1>
            <p className="home-tagline">{t("home.tagline")}</p>
            <p className="body-copy">
              {t("home.subtitle")}
            </p>
            <p>
              <Link href="/smoking-areas" className="source-line">{t("home.guideLink")} <span aria-hidden="true">&rarr;</span></Link>
            </p>
          </div>

          <section className="community-add-banner" aria-label={t("community.bannerTitle")}>
            <div className="stack-sm">
              <strong>{t("community.bannerTitle")}</strong>
              <p>{t("community.bannerBody")}</p>
            </div>
            <button type="button" className="live-primary-button" onClick={() => { trackEvent("community_overlay_opened", { entry_surface: "home" }); setAddOpen(true); }}>{t("community.bannerButton")}</button>
          </section>

          <ErrorBoundary>
          <LocationStatusChecker
            signageMode={signageMode}
            initialQuery={initialQuery}
            initialLat={initialLat}
            initialLng={initialLng}
            vectorTileBaseUrl={vectorTileBaseUrl}
            vectorTileLayerName={vectorTileLayerName}
            initialMapFeatures={initialMapFeatures}
          />
          </ErrorBoundary>
        </section>

        <section className="desktop-rules-summary-panel" aria-label={t("rules.guidance")}>
          <div className="home-filters-bar" aria-label={t("map.ariaPublicControls")}>
            <div className="home-filter-chip active" aria-pressed="true">
              <span aria-hidden="true">&#x25C9;</span> {t("home.filtersDesignated")}
            </div>
            <div className="home-filter-chip active" aria-pressed="true">
              <span aria-hidden="true">&#x25A0;</span> {t("home.filtersProhibited")}
            </div>
            <div className="home-filter-chip">
              <span aria-hidden="true">&#x2194;</span> {t("home.filtersWalking")}
            </div>
            <div className="home-filter-chip">
              <span aria-hidden="true">&#x1F310;</span> {t("home.filtersSatellite")}
            </div>
          </div>

          <div className="home-rules-grid">
            <section className="guidance-card guidance-card--rules">
              <GuidanceIcon name="rules" />
              <div className="stack-sm">
                <h2>{t("home.ruleReminders")}</h2>
                <ul className="stack-sm guidance-card__list">
                  <li>{t("home.reminderPublicPlaces")}</li>
                  <li>{t("home.reminderDesignated")}</li>
                  <li>{t("home.reminderGuidance")}</li>
                </ul>
              </div>
            </section>

            <section className="guidance-card guidance-card--uncertain">
              <GuidanceIcon name="uncertain" />
              <div className="stack-sm">
                <h2>{t("home.uncertainTitle")}</h2>
                <p className="body-copy">
                  {t("home.uncertainBody")}
                </p>
              </div>
            </section>

            <GuidanceCard icon="designated" title={t("home.designatedTitle")} body={t("home.designatedBody")} />
            <GuidanceCard icon="allowed" title={t("home.allowedTitle")} body={t("home.allowedBody")} />
            <GuidanceCard icon="signage" title={t("home.signageTitle")} body={t("home.signageBody")} />
          </div>

          <div className="home-source-trust" aria-label={t("home.dataProvenance")}>
            <p className="source-line">
              <strong>{t("home.dataProvenance")}:</strong> {sourceMetadata.length} {t("dataProvenanceNote")} {sourceMetadata[0]?.retrievedAt?.slice(0, 10) ?? "N/A"}. {t("mapBoundaryNote")}
            </p>
          </div>
        </section>

        <p className="prototype-note">{t("home.disclaimer")}</p>
      </div>
      <PublicFooter />
      <CommunityAddOverlay
        open={addOpen}
        onClose={() => setAddOpen(false)}
        vectorTileBaseUrl={vectorTileBaseUrl}
        vectorTileLayerName={vectorTileLayerName}
      />
    </main>
  );
}

function GuidanceCard({ icon, title, body }: { icon: GuidanceIconName; title: string; body: string }) {
  const { t } = useI18n();
  return (
    <section className={`guidance-card guidance-card--${icon}`}>
      <GuidanceIcon name={icon} />
      <div className="stack-sm">
        <h2>{title}</h2>
        <p className="body-copy">{body}</p>
        <a href="/rules" className="source-line">{t("rules.guidanceNote")} <span aria-hidden="true">&rarr;</span></a>
      </div>
    </section>
  );
}

type GuidanceIconName = "rules" | "uncertain" | "designated" | "allowed" | "signage";

function GuidanceIcon({ name }: { name: GuidanceIconName }) {
  const paths: Record<GuidanceIconName, ReactNode> = {
    rules: <><path d="M6 3.75h12v16.5H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    uncertain: <><path d="M12 3.5 21 20.25H3z" /><path d="M12 9v4.5M12 17.1v.15" /></>,
    designated: <><path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    allowed: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.2 2.2 4.8-5" /></>,
    signage: <><path d="M5 4.5v15M5 6h11l-2 3 2 3H5" /><path d="M19 16.5v.1" /></>,
  };
  return <span className="guidance-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>;
}
