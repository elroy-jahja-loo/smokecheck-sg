"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function PublicFooter() {
  const { t } = useI18n();

  return (
    <footer className="public-footer" aria-label={t("footer.description")}>
      <div className="container public-footer__inner">
        <div className="public-footer__brand">
          <strong>{t("app.title")}</strong>
          <p>{t("footer.description")}</p>
        </div>
        <nav className="public-footer__links" aria-label={t("footer.map")}>
          <Link href="/">{t("footer.map")}</Link>
          <Link href="/smoking-areas">{t("footer.smokingAreas")}</Link>
          <Link href="/orchard-road-smoking-areas">{t("footer.orchard")}</Link>
          <Link href="/singapore-smoking-fines">{t("footer.fines")}</Link>
          <Link href="/changi-airport-smoking-areas">{t("footer.changi")}</Link>
          <Link href="/rules">{t("footer.rules")}</Link>
          <Link href="/sources">{t("footer.sources")}</Link>
          <Link href="/#feedback">{t("footer.feedback")}</Link>
          <Link href="/ops/login">{t("footer.demoOfficer")}</Link>
        </nav>
      </div>
      <div className="container public-footer__fineprint">
        <p>{t("footer.prototypeNote")}</p>
      </div>
    </footer>
  );
}
