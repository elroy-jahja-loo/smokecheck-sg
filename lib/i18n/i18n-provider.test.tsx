import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider, useI18n } from "./i18n-provider";

function LocaleProbe() {
  const { locale, t } = useI18n();
  return <span>{locale}: {t("nav.map")}</span>;
}

test("the first browser render matches the server even when a non-English locale is saved", () => {
  const originalWindow = globalThis.window;
  try {
    // Server rendering does not have access to browser storage.
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    const html = renderToStaticMarkup(<I18nProvider><LocaleProbe /></I18nProvider>);
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: { getItem: () => "zh" },
    } });
    assert.equal(renderToStaticMarkup(<I18nProvider><LocaleProbe /></I18nProvider>), html);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
