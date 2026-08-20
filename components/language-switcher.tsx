"use client";

import { useI18n, type SupportedLocale } from "@/lib/i18n/i18n-provider";

export function LanguageSwitcher() {
  const { locale, setLocale, localeMeta } = useI18n();
  const locales = Object.keys(localeMeta) as SupportedLocale[];

  return (
    <nav className="language-switcher" aria-label={localeMeta[locale].nativeLabel}>
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          className={locale === code ? "language-switcher__btn is-active" : "language-switcher__btn"}
          aria-pressed={locale === code}
          aria-label={localeMeta[code].nativeLabel}
          onClick={() => setLocale(code)}
        >
          {localeMeta[code].nativeLabel}
        </button>
      ))}
    </nav>
  );
}
