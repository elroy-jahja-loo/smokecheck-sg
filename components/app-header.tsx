"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GovernmentMasthead } from "./government-masthead";
import { SmokeCheckLogo } from "./smokecheck-logo";
import { LanguageSwitcher } from "./language-switcher";
import { useI18n } from "@/lib/i18n/i18n-provider";

type AppHeaderProps = {
  officer?: boolean;
  hideNav?: boolean;
};

export function AppHeader({ officer = false, hideNav = false }: AppHeaderProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <>
      <GovernmentMasthead />
      <header className="site-header">
        <div className="container site-header__inner">
          <div className="site-header__brand">
            <Link href={officer ? "/ops/dashboard" : "/"} aria-label={officer ? `${t("officer.login.title")} ${t("nav.map")}` : t("app.title")}>
              <SmokeCheckLogo variant={officer ? "officer" : "public"} label={officer ? "SmokeCheck SG Ops" : t("app.title")} />
            </Link>
            {officer ? null : <p className="site-header__tagline">{t("home.tagline")}</p>}
          </div>
          {hideNav ? null : <nav className="site-nav" aria-label={t("nav.map")}>
            {officer ? (
              <>
                <Link href="/ops/dashboard" aria-current={isActive("/ops/dashboard") ? "page" : undefined}>{t("officer.dashboard.liveTriage")}</Link>
                <Link href="/sources" aria-current={isActive("/sources") ? "page" : undefined}>{t("nav.sources")}</Link>
              </>
            ) : (
              <>
                <Link href="/search" aria-current={pathname === "/" || isActive("/search") ? "page" : undefined}>{t("nav.search")}</Link>
                <Link href="/smoking-areas" aria-current={isActive("/smoking-areas") ? "page" : undefined}>{t("nav.smokingAreas")}</Link>
                <Link href="/rules" aria-current={isActive("/rules") ? "page" : undefined}>{t("nav.rules")}</Link>
                <Link href="/sources" aria-current={isActive("/sources") ? "page" : undefined}>{t("nav.sources")}</Link>
              </>
            )}
          </nav>}
          <LanguageSwitcher />
        </div>
      </header>
    </>
  );
}
