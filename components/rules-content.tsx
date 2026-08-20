"use client";

import { useState } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { SourceMetadata } from "@/lib/types";

type RuleSection = {
  id: string;
  title: string;
  summary: string;
};

type RulesContentProps = {
  sections: RuleSection[];
  sources: SourceMetadata[];
  disclaimer: string;
};

export function RulesContent({ sections, sources, disclaimer }: RulesContentProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState("rules-overview");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = normalizedQuery
    ? sections.filter((section) => `${section.title} ${section.summary}`.toLowerCase().includes(normalizedQuery))
    : sections;

  const firstClassSectionIds = new Set(["where-smoking-may-be-allowed", "signage-conflicts-with-map"]);
  const primarySections = sections.filter((s) => firstClassSectionIds.has(s.id));
  const regularSections = sections.filter((s) => !firstClassSectionIds.has(s.id));

  function navigateToSection(sectionId: string) {
    setActiveSectionId(sectionId);
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  return (
    <section className="rules-grid" aria-label="Rules content layout">
      <aside className="desktop-sticky-card rules-reference-card rules-category-rail">
        <h2>{t("rules.commonRules")}</h2>
        <nav className="rules-category-nav" aria-label="Rule categories">
          <a className={activeSectionId === "rules-overview" ? "rules-category-nav__active" : undefined} href="#rules-overview" onClick={(event) => { event.preventDefault(); navigateToSection("rules-overview"); }}>
            <span>{t("rules.overview")}</span>
            <span aria-hidden="true">›</span>
          </a>
          {sections.map((section) => (
            <a key={section.id} className={activeSectionId === section.id ? "rules-category-nav__active" : undefined} href={`#${section.id}`} onClick={(event) => { event.preventDefault(); navigateToSection(section.id); }}>
              <span>{section.title}</span>
              {activeSectionId === section.id ? <span aria-hidden="true">›</span> : null}
            </a>
          ))}
        </nav>
      </aside>

      <div id="rules-overview" className="rules-main stack">
        <div className="rules-main__intro stack-sm">
          <h1 className="section-title">{t("rules.title")}</h1>
          <p className="body-copy">{t("rules.intro")}</p>
        </div>

        {!normalizedQuery ? (
          <div className="rules-first-class-sections" aria-label="Key guidance sections">
            {primarySections.map((section) => (
              <section key={section.id} id={section.id} className={`first-class-card first-class-card--${section.id === "where-smoking-may-be-allowed" ? "success" : "warning"}`}>
                <div className="first-class-card__heading">
                  <span className="first-class-card__icon" aria-hidden="true">
                    {section.id === "where-smoking-may-be-allowed" ? "\u2714" : "\u26A0"}
                  </span>
                  <h2>{section.title}</h2>
                </div>
                <p className="body-copy">{section.summary}</p>
                <p className="source-line">{t("rules.guidanceNote")}</p>
              </section>
            ))}
          </div>
        ) : null}

        <label className="stack-sm">
          <span className="eyebrow">{t("rules.searchLabel")}</span>
          <input
            className="search-control"
            placeholder={t("rules.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {filteredSections.length === 0 ? (
          <div className="rules-empty-state" role="status">
            <strong>{t("rules.noMatch")}</strong>
            <span>{t("rules.noMatchHint")}</span>
          </div>
        ) : null}
        {(normalizedQuery ? filteredSections : regularSections).map((section, index) => (
          <details key={section.id} id={section.id} className="accordion-card" open={activeSectionId === section.id || activeSectionId === "rules-overview" && index === 0} onToggle={(event) => {
            if (event.currentTarget.open) setActiveSectionId(section.id);
          }}>
            <summary>
              <span>{section.title}</span>
              <span className="rules-accordion-meta">
                <Badge tone={section.title.includes("Designated") ? "success" : "blue"} className={section.title.includes("Designated") ? "rules-status-badge" : undefined}>
                  {section.title.includes("Designated") ? t("rules.checkSigns") : t("rules.guidance")}
                </Badge>
                <span className="rules-accordion-arrow" aria-hidden="true">⌄</span>
              </span>
            </summary>
            <div className="accordion-content">
              <p className="body-copy">{section.summary}</p>
              <p className="source-line">{t("rules.guidanceNote")}</p>
              <p className="source-line">{disclaimer}</p>
            </div>
          </details>
        ))}
        <Button href="/" variant="secondary">{t("rules.backToMap")}</Button>
      </div>

      <aside className="desktop-sticky-card rules-reference-card rules-source-rail">
        <h2><span aria-hidden="true">§</span> {t("rules.officialSources")}</h2>
        <div className="rules-source-list">
          {sources.slice(0, 3).map((source) => (
            <a key={source.id} className="source-link-card" href={source.url}>
              <span className="source-link-card__heading"><strong>{source.name}</strong><span aria-hidden="true">↗</span></span>
              <span>{source.versionLabel}</span>
            </a>
          ))}
          <p className="body-copy">{t("rules.sourceNote")}</p>
          <p className="source-line">{t("rules.signageConflictNote")}</p>
        </div>
      </aside>
    </section>
  );
}
