"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n-provider";

const storageKey = "smokecheck:text-scale";
const textScales = [
  { value: "standard", className: "" },
  { value: "large", className: "text-scale-large" },
  { value: "xlarge", className: "text-scale-xlarge" },
] as const;

type TextScale = (typeof textScales)[number]["value"];

export function AccessibilityControls() {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [scale, setScale] = useState<TextScale>(() => {
    if (typeof window === "undefined") return "standard";
    const saved = window.localStorage.getItem(storageKey) as TextScale | null;
    return saved && textScales.some((entry) => entry.value === saved) ? saved : "standard";
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate mount tracking
    setMounted(true);
  }, []);

  useEffect(() => {
    for (const entry of textScales) {
      if (entry.className) document.documentElement.classList.remove(entry.className);
    }
    const selected = textScales.find((entry) => entry.value === scale);
    if (selected?.className) document.documentElement.classList.add(selected.className);
    window.localStorage.setItem(storageKey, scale);
  }, [scale]);

  const scaleLabels: Record<TextScale, string> = {
    standard: t("accessibility.standard"),
    large: t("accessibility.large"),
    xlarge: t("accessibility.extraLarge"),
  };

  return (
    <div className={`accessibility-controls${isOpen ? " is-open" : ""}`} aria-label={t("accessibility.textSize")}>
      <button type="button" className="accessibility-controls__toggle" aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)}>
        <span aria-hidden="true">Aa</span><span className="accessibility-controls__toggle-label">{t("accessibility.textSize")}</span>
      </button>
      <div className="accessibility-controls__panel">
        <span>{t("accessibility.textSize")}</span>
        {textScales.map((entry) => (
        <button
          key={entry.value}
          type="button"
          className={mounted && scale === entry.value ? "is-active" : undefined}
          aria-pressed={mounted && scale === entry.value}
          onClick={() => setScale(entry.value)}
        >
          {scaleLabels[entry.value]}
        </button>
        ))}
      </div>
    </div>
  );
}
