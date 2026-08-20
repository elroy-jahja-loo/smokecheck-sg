"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import englishMessages from "@/lib/i18n/translations/en.json";

export type SupportedLocale = "en" | "zh" | "ms" | "ta";

const localeMeta: Record<SupportedLocale, { label: string; nativeLabel: string; dir: "ltr" | "rtl" }> = {
  en: { label: "English", nativeLabel: "English", dir: "ltr" },
  zh: { label: "Chinese", nativeLabel: "中文", dir: "ltr" },
  ms: { label: "Malay", nativeLabel: "Bahasa Melayu", dir: "ltr" },
  ta: { label: "Tamil", nativeLabel: "தமிழ்", dir: "ltr" },
};

const STORAGE_KEY = "smokecheck:locale";
const DEFAULT_LOCALE: SupportedLocale = "en";
const defaultMessages = englishMessages as Record<string, unknown>;

type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, defaultValue?: string) => string;
  localeMeta: typeof localeMeta;
};

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (_key, defaultValue) => defaultValue ?? _key,
  localeMeta,
});

async function loadTranslations(locale: SupportedLocale): Promise<Record<string, unknown>> {
  try {
    const mod = await import(`@/lib/i18n/translations/${locale}.json`);
    return (mod.default ?? mod) as Record<string, unknown>;
  } catch {
    if (locale !== "en") {
      const mod = await import("@/lib/i18n/translations/en.json");
      return (mod.default ?? mod) as Record<string, unknown>;
    }
    return {};
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    const saved = window.localStorage.getItem(STORAGE_KEY) as SupportedLocale | null;
    return saved && saved in localeMeta ? saved : DEFAULT_LOCALE;
  });
  // Start with the default catalog so server and first client renders never expose message keys.
  const [messages, setMessages] = useState<Record<string, unknown>>(defaultMessages);

  useEffect(() => {
    let cancelled = false;
    loadTranslations(locale).then((mod) => {
      if (!cancelled) {
        setMessages(mod);
      }
    });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en-SG" : `${locale}-SG`;
    document.documentElement.dir = localeMeta[locale].dir;
  }, [locale]);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    window.localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback((key: string, defaultValue?: string) => {
    const parts = key.split(".");
    let value: unknown = messages;
    for (const part of parts) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[part];
      } else {
        return defaultValue ?? key;
      }
    }
    return typeof value === "string" ? value : defaultValue ?? key;
  }, [messages]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, localeMeta }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export { localeMeta };
