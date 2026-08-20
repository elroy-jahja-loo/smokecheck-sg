"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";
import type { SourceMetadata } from "@/lib/types";
import { Badge } from "./badge";
import styles from "./source-row.module.css";

type SourceRowProps = {
  source: SourceMetadata;
};

export function SourceRow({ source }: SourceRowProps) {
  const { locale, t } = useI18n();

  const authorityLabels: Record<SourceMetadata["authority"], string> = {
    "official-agency": t("sourceRow.officialAgency"),
    legislation: t("sourceRow.legislation"),
    "open-data": t("sourceRow.openData"),
    prototype: t("sourceRow.prototype"),
  };

  return (
    <article className={styles.row}>
      <div>
        <h3>{source.name}</h3>
        <p>{source.versionLabel ?? t("sourceRow.referenceRetained")}</p>
      </div>
      <div className={styles.meta}>
        <Badge tone={source.isPrototype || source.versionLabel?.toLowerCase().includes("prototype") ? "warning" : "blue"}>
          {source.isPrototype ? t("sourceRow.prototype") : authorityLabels[source.authority]}
        </Badge>
        <span>{t("sourceRow.referenceDate")}{new Date(source.retrievedAt).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}</span>
        <a href={source.url} target="_blank" rel="noreferrer">{t("sourceRow.viewSource")}</a>
      </div>
    </article>
  );
}
