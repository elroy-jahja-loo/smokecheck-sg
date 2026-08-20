import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { OneMapClient } from "./onemap-client";
import { normalizeReverseGeocodeResponse, OneMapReverseGeocodeAdapter, getReverseGeocodeCacheKey } from "./onemap-reverse-geocode-adapter";
import { normalizeWalkingRouteResponse, OneMapRoutingAdapter, getWalkingRouteCacheKey } from "./onemap-routing-adapter";
import { normalizeOneMapSearchResponse, normalizeSearchQuery, OneMapSearchAdapter } from "./onemap-search-adapter";
import { OneMapTokenService, isExpiredOrExpiring } from "./onemap-token-service";
import { OneMapSafeError } from "./onemap-types";
import { parseReverseGeocodeInput, parseWalkingRouteInput, roundedCoordinate } from "./onemap-validation";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.ONEMAP_API_TOKEN = originalEnv.ONEMAP_API_TOKEN;
  process.env.ONEMAP_TOKEN_EXPIRES_AT = originalEnv.ONEMAP_TOKEN_EXPIRES_AT;
  process.env.ONEMAP_EMAIL = originalEnv.ONEMAP_EMAIL;
  process.env.ONEMAP_EMAIL_PASSWORD = originalEnv.ONEMAP_EMAIL_PASSWORD;
  process.env.ONEMAP_API_BASE_URL = originalEnv.ONEMAP_API_BASE_URL;
});

test("search validation and normalization reject unsafe input and keep Singapore candidates", () => {
  assert.equal(normalizeSearchQuery("  313   Orchard Road  "), "313 Orchard Road");
  assert.throws(() => normalizeSearchQuery(""), /required/);
  assert.throws(() => normalizeSearchQuery("bad\u0000query"), /unsupported/);

  const candidates = normalizeOneMapSearchResponse({
    results: [
      { SEARCHVAL: "313 SOMERSET", ADDRESS: "313 Orchard Road", POSTAL: "238895", LATITUDE: "1.301385", LONGITUDE: "103.837684" },
      { SEARCHVAL: "OUTSIDE", ADDRESS: "Outside", LATITUDE: "2", LONGITUDE: "105" },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].label, "313 SOMERSET");
  assert.equal(candidates[0].source, "onemap");
});

test("reverse geocode validation, normalization, and cache key rounding are privacy-preserving", () => {
  const input = parseReverseGeocodeInput({ lat: 1.3048123, lng: 103.8318123, buffer: 40, addressType: "All" });
  assert.equal(input.buffer, 40);
  assert.equal(roundedCoordinate(input), "1.3048:103.8318");
  assert.equal(getReverseGeocodeCacheKey(input), "onemap:revgeo:v1:1.3048:103.8318:40:All");
  assert.throws(() => parseReverseGeocodeInput({ lat: 1.3048, lng: 103.8318, buffer: 900, addressType: "All" }), /buffer/);
  assert.throws(() => parseReverseGeocodeInput({ lat: 1.3048, lng: 103.8318, buffer: 40, addressType: "Private" }), /addressType/);

  const result = normalizeReverseGeocodeResponse({
    GeocodeInfo: [{ BUILDINGNAME: "313 SOMERSET", BLOCK: "313", ROAD: "ORCHARD ROAD", POSTALCODE: "238895", LATITUDE: "1.301385", LONGITUDE: "103.837684" }],
  }, 1.3048, 103.8318);

  assert.equal(result.status, "found");
  assert.match(result.address ?? "", /313 SOMERSET/);
});

test("walking route validation and normalization allow only walk and preserve summary instructions", () => {
  const input = parseWalkingRouteInput({ start: { lat: 1.3048, lng: 103.8318 }, end: { lat: 1.305, lng: 103.832 }, routeType: "walk" });
  assert.equal(input.routeType, "walk");
  assert.equal(getWalkingRouteCacheKey(input), "onemap:route:walk:v1:1.3048:103.8318:1.3050:103.8320");
  assert.throws(() => parseWalkingRouteInput({ start: { lat: 1.3048, lng: 103.8318 }, end: { lat: 1.305, lng: 103.832 }, routeType: "pt" }), /walking/);

  const route = normalizeWalkingRouteResponse({
    route_summary: { total_time: 420, total_distance: 520 },
    route_geometry: "encoded-polyline",
    route_instructions: [{ instruction: "Walk towards Orchard Road", distance: 120, direction: "Straight", lat: 1.3048, lng: 103.8318 }],
  });

  assert.equal(route.status, "found");
  assert.equal(route.totalTimeSeconds, 420);
  assert.equal(route.instructions[0].instruction, "Walk towards Orchard Road");
  assert.equal(route.instructions[0].lat, 1.3048);
  assert.equal(route.instructions[0].lng, 103.8318);

  const arrayRoute = normalizeWalkingRouteResponse({
    route_summary: { total_time: 60, total_distance: 30 },
    route_instructions: [["Head North", "", "", 29, 0, 30, "North"]],
  });
  assert.equal(arrayRoute.instructions[0].lat, undefined);
  assert.equal(arrayRoute.instructions[0].lng, undefined);
});

test("token service reports missing and expired token without exposing secrets", async () => {
  process.env.ONEMAP_API_TOKEN = "";
  process.env.ONEMAP_EMAIL = "";
  process.env.ONEMAP_EMAIL_PASSWORD = "";
  await assert.rejects(() => new OneMapTokenService().getToken(), (error) => error instanceof OneMapSafeError && error.code === "missing_token");

  process.env.ONEMAP_API_TOKEN = "expired-token";
  process.env.ONEMAP_TOKEN_EXPIRES_AT = String(Math.floor(Date.now() / 1000) + 60);
  assert.equal(isExpiredOrExpiring(Number(process.env.ONEMAP_TOKEN_EXPIRES_AT) * 1000), true);
  await assert.rejects(() => new OneMapTokenService().getToken(), (error) => error instanceof OneMapSafeError && error.code === "token_expired");
});

test("mocked fetch integration: search success and search 429", async () => {
  process.env.ONEMAP_API_TOKEN = "test-token";
  process.env.ONEMAP_TOKEN_EXPIRES_AT = "";
  process.env.ONEMAP_API_BASE_URL = "https://example.onemap.test";
  globalThis.fetch = mockFetchOnce({ results: [{ SEARCHVAL: "CITY HALL", ADDRESS: "City Hall", LATITUDE: "1.2931", LONGITUDE: "103.8521" }] });
  const success = await new OneMapSearchAdapter(new OneMapClient(new OneMapTokenService())).search("City Hall mocked success");
  assert.equal(success.candidates.length, 1);
  assert.equal(success.candidates[0].label, "CITY HALL");

  globalThis.fetch = mockFetchStatus(429);
  await assert.rejects(
    () => new OneMapSearchAdapter(new OneMapClient(new OneMapTokenService())).search("City Hall mocked rate limit"),
    (error) => error instanceof OneMapSafeError && error.code === "rate_limited",
  );
});

test("mocked fetch integration: reverse geocode success and token failure", async () => {
  process.env.ONEMAP_API_TOKEN = "test-token";
  process.env.ONEMAP_TOKEN_EXPIRES_AT = "";
  process.env.ONEMAP_API_BASE_URL = "https://example.onemap.test";
  globalThis.fetch = mockFetchOnce({ GeocodeInfo: [{ BUILDINGNAME: "CITY HALL", ROAD: "ST ANDREW'S ROAD", POSTALCODE: "178958" }] });
  const success = await new OneMapReverseGeocodeAdapter(new OneMapClient(new OneMapTokenService())).reverseGeocode({ lat: 1.2931, lng: 103.8521, buffer: 40, addressType: "All" });
  assert.equal(success.result.status, "found");

  globalThis.fetch = mockFetchStatus(401);
  await assert.rejects(
    () => new OneMapReverseGeocodeAdapter(new OneMapClient(new OneMapTokenService())).reverseGeocode({ lat: 1.2941, lng: 103.8531, buffer: 40, addressType: "All" }),
    (error) => error instanceof OneMapSafeError && error.code === "token_expired",
  );
});

test("mocked fetch integration: walking route success and no-route result", async () => {
  process.env.ONEMAP_API_TOKEN = "test-token";
  process.env.ONEMAP_TOKEN_EXPIRES_AT = "";
  process.env.ONEMAP_API_BASE_URL = "https://example.onemap.test";
  globalThis.fetch = mockFetchOnce({ route_summary: { total_time: 180, total_distance: 220 }, route_instructions: [{ instruction: "Walk along the sheltered path", distance: 80 }] });
  const success = await new OneMapRoutingAdapter(new OneMapClient(new OneMapTokenService())).getWalkingRoute({
    start: { lat: 1.2931, lng: 103.8521 },
    end: { lat: 1.2934, lng: 103.8525 },
    routeType: "walk",
  });
  assert.equal(success.route.status, "found");
  assert.equal(success.route.instructions[0].instruction, "Walk along the sheltered path");

  const noRoute = normalizeWalkingRouteResponse({ status_message: "No route found" });
  assert.equal(noRoute.status, "not_found");
});

function mockFetchOnce(payload: unknown) {
  return (async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

function mockFetchStatus(status: number) {
  return (async () => new Response(JSON.stringify({ error: "mocked" }), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}
