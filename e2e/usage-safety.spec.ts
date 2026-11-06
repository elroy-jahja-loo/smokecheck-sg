import { expect, test } from "@playwright/test";
// This installed Next.js version still exports the matcher helper under its
// original name, despite the proxy terminology used in its bundled guide.
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "../proxy";

const bbox = "minLat=1.29&minLng=103.82&maxLat=1.31&maxLng=103.84&zoom=14";

test("public pages and overlays skip proxy CPU but protected paths still run it", () => {
  for (const url of ["/", "/?lat=1.3&lng=103.8", "/rules", "/sources", "/tiles/14/1/2.pbf", "/api/geospatial/map-features", `/api/geospatial/map-features?${bbox}`, "/api/geospatial/map-features/"]) {
    expect(doesProxyMatch({ config, nextConfig: {}, url }), url).toBe(false);
  }
  for (const url of ["/api/geospatial/status", "/api/geospatial/map-features/other", "/api/reports", "/api/internal/cron/refresh-onemap-token", "/api/queue/events", "/ops/dashboard", "/ops/dashboard/reports", "/ops/admin"]) {
    expect(doesProxyMatch({ config, nextConfig: {}, url }), url).toBe(true);
  }
});

test("proxy retains officer gating and cron authentication", () => {
  const officer = proxy(new NextRequest("http://localhost:3100/ops/dashboard"));
  expect(officer.status).toBe(307);
  expect(officer.headers.get("location")).toContain("/ops/login");
  const cron = proxy(new NextRequest("http://localhost:3100/api/internal/cron/refresh-onemap-token"));
  expect(cron.status).toBe(403);
});

test("public map responses retain security and CORS headers without delaying fresh data", async ({ request }) => {
  const response = await request.get(`/api/geospatial/map-features?${bbox}&layer=designated`, { headers: { Origin: "https://smokecheck.sg" } });
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["vercel-cdn-cache-control"]).toBeUndefined();
  expect(headers["access-control-allow-origin"]).toBe("https://smokecheck.sg");
  expect(headers.vary).toContain("Origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-request-id"]).toBeUndefined();
});

test("all map layers, invalid requests and officer data remain uncached", async ({ request }) => {
  for (const path of [`/api/geospatial/map-features?${bbox}`, `/api/geospatial/map-features?${bbox}&layer=prohibited`, `/api/geospatial/map-features?${bbox}&layer=invalid`, "/api/geospatial/map-features?zoom=1"]) {
    const response = await request.get(path);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["vercel-cdn-cache-control"]).toBeUndefined();
  }
  const unauthenticated = await request.get("/api/officer/reports");
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["cache-control"]).toContain("no-store");
});

test("public map preflights still reject unapproved origins", async ({ request }) => {
  const response = await request.fetch("/api/geospatial/map-features", { method: "OPTIONS", headers: { Origin: "https://attacker.example" } });
  expect(response.status()).toBe(403);
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("static homepage includes readable HTML and security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("<h1");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("object-src 'none'");
  expect(response.headers()["x-request-id"]).toBeUndefined();
});

test("shared search and signage parameters survive static homepage hydration", async ({ page }) => {
  await page.route(/\/api\/geospatial\/map-features\?/, (route) => route.fulfill({ json: { features: [], sanitized: true } }));
  await page.goto("/?q=Orchard%20Road&signage=true", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Postal code, building, road, landmark" })).toHaveValue("Orchard Road");
  await expect(page.locator("main")).toContainText("QR");
});

test("shared coordinates still trigger the correct status lookup", async ({ page }) => {
  await page.route(/\/api\/geospatial\/map-features\?/, (route) => route.fulfill({ json: { features: [], sanitized: true } }));
  let coordinatePayload: { lat: number; lng: number } | undefined;
  await page.route("**/api/geospatial/status", async (route) => {
    coordinatePayload = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: "test_service_unavailable" } });
  });
  await page.goto("/?lat=1.3048&lng=103.8318&signage=1", { waitUntil: "domcontentloaded" });
  await expect.poll(() => coordinatePayload?.lat).toBe(1.3048);
  expect(coordinatePayload?.lng).toBe(103.8318);
});

test("superseded viewport requests are aborted without starting the fallback query", async ({ page }) => {
  let layerRequests = 0;
  let fullRequests = 0;
  let abortedRequests = 0;
  let releaseInitial: () => void = () => {};
  const initialReady = new Promise<void>((resolve) => { releaseInitial = resolve; });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/geospatial/map-features?")) abortedRequests++;
  });
  await page.route(/\/api\/geospatial\/map-features\?/, async (route) => {
    const layer = new URL(route.request().url()).searchParams.get("layer");
    if (!layer) fullRequests++;
    else layerRequests++;
    if (layerRequests <= 2) await initialReady;
    await route.fulfill({ json: { features: [], sanitized: true } }).catch(() => undefined);
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => layerRequests).toBe(2);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => layerRequests).toBeGreaterThanOrEqual(4);
    await expect.poll(() => abortedRequests).toBe(2);
    expect(fullRequests).toBe(0);
  } finally {
    releaseInitial();
  }
});

for (const kind of ["smoking", "no-smoking"] as const) {
  test(`adding a ${kind} area refreshes the map immediately after a successful save`, async ({ page }) => {
    let savedFeature: Record<string, unknown> | undefined;
    await page.route(/\/api\/geospatial\/map-features\?/, (route) => {
      const layer = new URL(route.request().url()).searchParams.get("layer");
      const matchesLayer = kind === "smoking" ? layer !== "prohibited" : layer !== "designated";
      return route.fulfill({ json: { features: savedFeature && matchesLayer ? [savedFeature] : [], sanitized: true } });
    });
    await page.route("**/api/community/areas", async (route) => {
      const payload = route.request().postDataJSON() as { designatedAreas: { lat: number; lng: number }[]; prohibitedZones: { lat: number; lng: number }[][] };
      if (kind === "smoking") {
        expect(payload.designatedAreas).toHaveLength(1);
        savedFeature = { id: "community-new", kind: "designated-area", name: "New community smoking area", sourceId: "community-reports", verified: false, radiusM: 10, ...payload.designatedAreas[0] };
      } else {
        expect(payload.prohibitedZones).toHaveLength(1);
        const ring = payload.prohibitedZones[0].map(({ lat, lng }) => [lng, lat]);
        expect(ring.length).toBeGreaterThanOrEqual(3);
        savedFeature = { id: "community-new-zone", kind: "prohibited-zone", name: "New community no-smoking area", sourceId: "community-reports", verified: false, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } };
      }
      await route.fulfill({ json: { added: { designatedAreas: payload.designatedAreas.length, prohibitedZones: payload.prohibitedZones.length } } });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add an area to the map" }).click();
    const dialog = page.getByRole("dialog", { name: "Add to the map" });
    if (kind === "no-smoking") await dialog.getByRole("tab", { name: "Add no-smoking area" }).click();
    const map = dialog.locator(".leaflet-container");
    await expect(map).toBeVisible();
    const bounds = await map.boundingBox();
    expect(bounds).not.toBeNull();
    await map.click({ position: { x: bounds!.width * 0.45, y: bounds!.height * 0.45 } });
    if (kind === "no-smoking") {
      await map.click({ position: { x: bounds!.width * 0.6, y: bounds!.height * 0.45 } });
      await map.click({ position: { x: bounds!.width * 0.6, y: bounds!.height * 0.6 } });
      await dialog.getByRole("button", { name: "Finish shape" }).click();
    }
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    if (kind === "smoking") {
      await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(1);
    } else {
      await expect.poll(() => page.evaluate(() => {
        for (const canvas of document.querySelectorAll<HTMLCanvasElement>(".leaflet-overlay-pane canvas")) {
          const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!pixels) continue;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] > 0 && pixels[i] > 220 && pixels[i + 1] > 85 && pixels[i + 1] < 150 && pixels[i + 2] < 30) return true;
          }
        }
        return false;
      })).toBe(true);
    }
  });
}

test("removing an unverified community area updates immediately and stays removed after zooming", async ({ page }) => {
  const id = "12345678-1234-4234-8234-123456789abc";
  let removed = false;
  let mapRequests = 0;
  const feature = { id: `community-${id}`, kind: "designated-area", name: "Removable community area", sourceId: "community-reports", verified: false, radiusM: 10, lat: 1.3048, lng: 103.8318 };
  await page.route(/\/api\/geospatial\/map-features\?/, (route) => {
    mapRequests++;
    const layer = new URL(route.request().url()).searchParams.get("layer");
    return route.fulfill({ json: { features: !removed && layer !== "prohibited" ? [feature] : [], sanitized: true } });
  });
  await page.route("**/api/community/areas", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postDataJSON()).toEqual({ id, kind: "designated-area" });
    removed = true;
    await route.fulfill({ json: { deleted: true } });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".leaflet-div-marker--community").click();
  await page.getByRole("button", { name: "Remove community area", exact: true }).click();
  await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(0);
  const beforeZoom = mapRequests;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => mapRequests).toBeGreaterThan(beforeZoom);
  await expect(page.locator(".leaflet-div-marker--community")).toHaveCount(0);
});
