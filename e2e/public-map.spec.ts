import { expect, test } from "@playwright/test";

const area = { id: "official", kind: "designated-area", name: "Official smoking area", sourceId: "nea", lat: 1.3048, lng: 103.8318 };
const community = { id: "community-123", kind: "designated-area", name: "Community smoking area", sourceId: "community-reports", verified: false, radiusM: 10, lat: 1.3049, lng: 103.8319 };
const officialZone = { id: "official-zone", kind: "prohibited-zone", name: "Official no-smoking area", sourceId: "nea", geometry: {
  type: "Polygon", coordinates: [[[103.8298, 1.3038], [103.8312, 1.3038], [103.8312, 1.3054], [103.8298, 1.3054], [103.8298, 1.3038]]],
} };
const communityZone = { id: "community-zone", kind: "prohibited-zone", name: "Community no-smoking area", sourceId: "community-reports", verified: false, geometry: {
  type: "Polygon", coordinates: [[[103.833, 1.3038], [103.8344, 1.3038], [103.8344, 1.3054], [103.833, 1.3054], [103.833, 1.3038]]],
} };

test("the lightweight map endpoint returns only designated areas", async ({ request }) => {
  const bbox = "minLat=1.29&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=14";
  const response = await request.get(`/api/geospatial/map-features?${bbox}&layer=designated`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { features: { kind: string; sourceId: string }[] };
  expect(payload.features.length).toBeGreaterThan(0);
  expect(payload.features.every((feature) => feature.kind === "designated-area")).toBeTruthy();
});

test("the prohibited-area endpoint serves official and community polygons without simplifying them", async ({ request }) => {
  const bbox = "minLat=1.29&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=14";
  const response = await request.get(`/api/geospatial/map-features?${bbox}&layer=prohibited`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { features: { kind: string; geometry?: { type: string } }[] };
  expect(payload.features.length).toBeGreaterThan(0);
  expect(payload.features.every((feature) => feature.kind === "prohibited-zone" && feature.geometry?.type)).toBeTruthy();
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

test("smoking-area markers appear before the red and community prohibited regions", async ({ page }) => {
  let fullRequests = 0;
  let quickRequests = 0;
  let prohibitedRequests = 0;
  let releaseProhibited: () => void = () => {};
  const prohibitedReady = new Promise<void>((resolve) => { releaseProhibited = resolve; });
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("layer") === "designated") {
      quickRequests++;
      await route.fulfill({ json: { features: [area, community], sanitized: true } });
    } else if (url.searchParams.get("layer") === "prohibited") {
      prohibitedRequests++;
      await prohibitedReady;
      await route.fulfill({ json: { features: [officialZone, communityZone], sanitized: true } });
    } else {
      fullRequests++;
      await route.fulfill({ status: 503 });
    }
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".leaflet-div-marker--green")).toHaveCount(1);
    await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(1);
    expect(quickRequests).toBe(1);
    expect(prohibitedRequests).toBe(1);
    expect(fullRequests).toBe(0);
  } finally {
    releaseProhibited();
  }
  await expect.poll(() => mapHasProhibitedColors(page)).toEqual({ official: true, community: true });
  expect(fullRequests).toBe(0);
});

test("the full map still works if the quick marker request fails", async ({ page }) => {
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("layer") === "designated") {
      await route.fulfill({ status: 503 });
    } else if (url.searchParams.get("layer") === "prohibited") {
      await route.fulfill({ json: { features: [officialZone, communityZone], sanitized: true } });
    } else {
      await route.fulfill({ json: { features: [area, community, officialZone, communityZone], sanitized: true } });
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-div-marker--green")).toHaveCount(1);
  await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(1);
  await expect.poll(() => mapHasProhibitedColors(page)).toEqual({ official: true, community: true });
});

test("a late marker response cannot remove already loaded prohibited regions", async ({ page }) => {
  let releaseQuick: () => void = () => {};
  const quickReady = new Promise<void>((resolve) => { releaseQuick = resolve; });
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("layer") === "designated") {
      await quickReady;
      await route.fulfill({ json: { features: [area], sanitized: true } });
    } else if (url.searchParams.get("layer") === "prohibited") {
      await route.fulfill({ json: { features: [officialZone, communityZone], sanitized: true } });
    } else {
      await route.fulfill({ status: 503 });
    }
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => mapHasProhibitedColors(page)).toEqual({ official: true, community: true });
  } finally {
    const quickResponse = page.waitForResponse((response) => response.url().includes("layer=designated"));
    releaseQuick();
    await quickResponse;
  }
  await expect(page.locator(".leaflet-div-marker--green")).toHaveCount(1);
  await expect.poll(() => mapHasProhibitedColors(page)).toEqual({ official: true, community: true });
});

test("the old full map supplies red areas if the prohibited-area request fails", async ({ page }) => {
  let fullRequests = 0;
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const layer = new URL(route.request().url()).searchParams.get("layer");
    if (layer === "prohibited") await route.fulfill({ status: 503 });
    else if (layer === "designated") await route.fulfill({ json: { features: [area, community], sanitized: true } });
    else {
      fullRequests++;
      await route.fulfill({ json: { features: [area, community, officialZone, communityZone], sanitized: true } });
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => mapHasProhibitedColors(page)).toEqual({ official: true, community: true });
  expect(fullRequests).toBe(1);
});

async function mapHasProhibitedColors(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    let official = false;
    let community = false;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(".leaflet-overlay-pane canvas")) {
      const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels) continue;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) continue;
        if (pixels[i] > 190 && pixels[i] < 225 && pixels[i + 1] < 85 && pixels[i + 2] > 25 && pixels[i + 2] < 85) official = true;
        if (pixels[i] > 220 && pixels[i + 1] > 85 && pixels[i + 1] < 150 && pixels[i + 2] < 30) community = true;
      }
    }
    return { official, community };
  });
}
