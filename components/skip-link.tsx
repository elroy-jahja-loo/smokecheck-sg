"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";

export function SkipToContent() {
  const { t } = useI18n();
  return (
    <a href="#main-content" className="skip-link">
      {t("accessibility.skipToContent")}
    </a>
  );
}
