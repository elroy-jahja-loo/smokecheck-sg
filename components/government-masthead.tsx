"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";
import styles from "./government-masthead.module.css";

export function GovernmentMasthead() {
  const { t } = useI18n();

  return (
    <div className={styles.masthead} aria-label={t("masthead.label")}>
      <div className={styles.flag} aria-hidden="true">SG</div>
      <span>{t("masthead.label")}</span>
    </div>
  );
}
