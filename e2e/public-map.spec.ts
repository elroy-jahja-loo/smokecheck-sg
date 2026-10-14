import { expect, test } from "@playwright/test";

const area = { id: "official", kind: "designated-area", name: "Official smoking area", sourceId: "nea", lat: 1.3048, lng: 103.8318 };
const community = { id: "community-123", kind: "designated-area", name: "Community smoking area", sourceId: "community-reports", verified: false, radiusM: 10, lat: 1.3049, lng: 103.8319 };
const secondCommunity = { ...community, id: "community-456", lat: 1.305, lng: 103.8317 };

test("the lightweight map endpoint returns only designated areas", async ({ request }) => {
  const bbox = "minLat=1.29&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=14";
  const response = await request.get(`/api/geospatial/map-features?${bbox}&layer=designated`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { features: { kind: string; sourceId: string }[] };
  expect(payload.features.length).toBeGreaterThan(0);
  expect(payload.features.every((feature) => feature.kind === "designated-area")).toBeTruthy();
});

test("the guide remains usable when a browser denies access to localStorage", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => { throw new DOMException("Access is denied for this document", "SecurityError"); },
    });
  });
  await page.goto("/smoking-areas");
  await expect(page.getByRole("heading", { name: /Where to Smoke in Singapore/ })).toBeVisible();
  await page.getByRole("button", { name: "Text size" }).click();
  await page.getByRole("button", { name: "Large", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/text-scale-large/);
  await expect(page.getByRole("heading", { name: /Where to Smoke in Singapore/ })).toBeVisible();
});

test("smoking-area markers appear before the full map data arrives", async ({ page }) => {
  let fullRequests = 0;
  let quickRequests = 0;
  let releaseFull: () => void = () => {};
  const fullReady = new Promise<void>((resolve) => { releaseFull = resolve; });
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("layer") === "designated") {
      quickRequests++;
      await route.fulfill({ json: { features: [area, community], sanitized: true } });
    } else {
      fullRequests++;
      await fullReady;
      await route.fulfill({ json: { features: [area, community, secondCommunity], sanitized: true } });
    }
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".leaflet-div-marker--green")).toHaveCount(1);
    await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(1);
    expect(quickRequests).toBe(1);
    expect(fullRequests).toBe(1);
  } finally {
    releaseFull();
  }
  await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(2);
});

test("the full map still works if the quick marker request fails", async ({ page }) => {
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("layer") === "designated") {
      await route.fulfill({ status: 503 });
    } else {
      await route.fulfill({ json: { features: [area, community], sanitized: true } });
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-div-marker--green")).toHaveCount(1);
  await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(1);
});

test("a late quick response cannot replace the complete map", async ({ page }) => {
  let releaseQuick: () => void = () => {};
  const quickReady = new Promise<void>((resolve) => { releaseQuick = resolve; });
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("layer") === "designated") {
      await quickReady;
      await route.fulfill({ json: { features: [area], sanitized: true } });
    } else {
      await route.fulfill({ json: { features: [area, community, secondCommunity], sanitized: true } });
    }
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(2);
  } finally {
    const quickResponse = page.waitForResponse((response) => response.url().includes("layer=designated"));
    releaseQuick();
    await quickResponse;
  }
  await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(2);
});
