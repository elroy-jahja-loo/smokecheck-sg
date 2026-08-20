"use client";

import { useState } from "react";
import styles from "./map-legend.module.css";
import { useI18n } from "@/lib/i18n/i18n-provider";

type MapLegendProps = {
  variant?: "public" | "officer";
  showCurrentLocation?: boolean;
  showNearestArea?: boolean;
  showFocus?: boolean;
};

export function MapLegend({ variant = "public", showCurrentLocation = false, showNearestArea = false, showFocus = false }: MapLegendProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const publicMap = variant === "public";

  return (
    <section className={`${styles.key} ${styles[variant]} ${isOpen ? styles.open : ""}`} aria-label={t("map.keyTitle", "Map key")}>
      <button type="button" className={styles.toggle} aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)}>
        <span>{t("map.keyTitle", "Map key")}</span><span aria-hidden="true">{isOpen ? "−" : "+"}</span>
      </button>
      <div className={styles.content}>
        <section className={styles.group} aria-label={t("map.keyAreas", "Map areas")}>
          <h3>{t("map.keyAreas", "Map areas")}</h3>
          <dl className={styles.legend}>
            <LegendItem tone="green" label={publicMap ? t("map.keyDesignated", "Designated area") : t("officer.dashboard.dsaLayers")} description={publicMap ? t("map.keyDesignatedDescription", "Known smoking area. Check signs.") : t("map.designatedAreaPopup")} />
            <LegendItem tone="red" label={t("map.keyProhibited", "No-smoking zone")} description={t("map.keyProhibitedDescription", "Smoking prohibited. Check signs.")} />
          </dl>
        </section>
        {publicMap ? (
          <section className={styles.group} aria-label={t("map.keyCommunityGroup", "Community additions")}>
            <h3>{t("map.keyCommunityGroup", "Community additions")}</h3>
            <dl className={styles.legend}>
              <LegendItem tone="blue" label={t("map.keyCommunityArea", "Community area")} description={t("map.keyCommunityAreaDescription", "User-added smoking area. Not yet verified.")} />
              <LegendItem tone="orange" label={t("map.keyCommunityZone", "Community no-smoking zone")} description={t("map.keyCommunityZoneDescription", "User-added no-smoking area. Not yet verified.")} />
            </dl>
          </section>
        ) : null}
        {publicMap && (showNearestArea || showCurrentLocation || showFocus) ? (
          <section className={styles.group} aria-label={t("map.keyMarkers", "Your markers")}>
            <h3>{t("map.keyMarkers", "Your markers")}</h3>
            <dl className={styles.legend}>
              {showNearestArea ? <LegendItem tone="green" label={t("map.nearest")} description={t("map.keyNearestDescription", "Closest designated area")} /> : null}
              {showCurrentLocation ? <LegendItem tone="blue" label={t("map.you")} description={t("map.keyYouDescription", "Your approximate location")} /> : null}
              {showFocus ? <LegendItem tone="amber" label={t("map.focus")} description={t("map.keyFocusDescription", "Location currently being checked")} /> : null}
            </dl>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function LegendItem({ tone, label, description }: { tone: "green" | "red" | "blue" | "amber" | "orange"; label: string; description: string }) {
  return <div><dt className={styles[tone]}>{label}</dt><dd>{description}</dd></div>;
}
