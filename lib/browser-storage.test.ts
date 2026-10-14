import assert from "node:assert/strict";
import { test } from "node:test";

import { getBrowserStorageItem, setBrowserStorageItem } from "./browser-storage";

test("browser preferences work normally when localStorage is available", () => {
  const previous = globalThis.window;
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
    } });
    setBrowserStorageItem("smokecheck:locale", "zh");
    assert.equal(getBrowserStorageItem("smokecheck:locale"), "zh");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
  }
});

test("denied localStorage access does not prevent a page from rendering", () => {
  const previous = globalThis.window;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      get localStorage(): Storage { throw new DOMException("Access is denied", "SecurityError"); },
    } });
    assert.equal(getBrowserStorageItem("smokecheck:locale"), null);
    assert.doesNotThrow(() => setBrowserStorageItem("smokecheck:text-scale", "large"));
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
  }
});

test("browser preferences are optional on the server", () => {
  const previous = globalThis.window;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    assert.equal(getBrowserStorageItem("smokecheck:locale"), null);
    assert.doesNotThrow(() => setBrowserStorageItem("smokecheck:locale", "en"));
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
  }
});
