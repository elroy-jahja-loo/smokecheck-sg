"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { MapLegend } from "@/components/map-legend";
import { designatedAreas } from "@/data/prototype-data";
import { trackEvent } from "@/lib/analytics/client";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { DesignatedArea, LocationResult, SourceMetadata } from "@/lib/types";
import type { BottomSheetSnapState } from "@/lib/ui/bottom-sheet-snap";
import { getResultPanelVisibility } from "@/lib/ui/result-panel-visibility";
import { type CachedRulesPayload, getNearestDesignatedAreas } from "@/lib/data/rules-cache";
import { buildViewportBbox, defaultCenter, isSameViewportBbox, type ViewportBbox } from "@/lib/geospatial/viewport-bbox";
import { isSingaporeCoordinate } from "@/lib/onemap/onemap-validation";

const InteractiveOneMap = dynamic(
  () => import("@/components/interactive-onemap").then((module) => module.InteractiveOneMap),
  {
    ssr: false,
    loading: () => <div className="live-map-loading">...</div>,
  },
);

type StatusResponse = {
  result: LocationResult;
  privacy: {
    precisePublicLocationStored: false;
    note: string;
  };
};

type OneMapSearchCandidate = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

type SearchResponse = {
  candidates: OneMapSearchCandidate[];
};

type StatusInputSource = "gps" | "map" | "search" | "shared" | "signage";

type ReverseGeocodeResponse = {
  result: {
    status: "found" | "not_found";
    address?: string;
  };
};

export type MapFeature = {
  id: string;
  kind: "designated-area" | "prohibited-zone";
  name: string;
  sourceId?: string;
  verified?: boolean;
  radiusM?: number;
  lat?: number;
  lng?: number;
  zoneType?: string;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type MapFeaturesResponse = {
  features: MapFeature[];
  sanitized: true;
};

type RouteResponse = {
  route: {
    status: "found" | "not_found" | "error";
    totalTimeSeconds?: number;
    totalDistanceMeters?: number;
    encodedGeometry?: string;
    instructions: { instruction: string; direction: string; distanceText: string }[];
    message?: string;
  };
  disclaimer: string;
};

type LocationStatusCheckerProps = {
  variant?: "home" | "search";
  signageMode?: boolean;
  initialQuery?: string;
  initialLat?: string;
  initialLng?: string;
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
  initialMapFeatures?: MapFeature[];
};

type RouteDestination = { name: string; lat: number; lng: number };

const statusTone = {
  "likely-prohibited": "danger",
  "designated-nearby": "success",
  uncertain: "warning",
} as const;

function getStatusLabel(status: keyof typeof statusTone, t: (key: string) => string) {
  return t(status === "likely-prohibited" ? "result.statusLikelyProhibited" : status === "designated-nearby" ? "result.statusDesignatedNearby" : "result.statusUncertain");
}

const statusMapClass = {
  "likely-prohibited": "danger",
  "designated-nearby": "success",
  uncertain: "warning",
} as const;

export function LocationStatusChecker({
  variant = "home",
  signageMode = false,
  initialQuery,
  initialLat,
  initialLng,
  vectorTileBaseUrl,
  vectorTileLayerName,
  initialMapFeatures,
}: LocationStatusCheckerProps) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [query, setQuery] = useState(initialQuery ?? "");
  const [searchResults, setSearchResults] = useState<OneMapSearchCandidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | undefined>();
  const [statusResponse, setStatusResponse] = useState<StatusResponse | undefined>();
  const [routeResponse, setRouteResponse] = useState<RouteResponse | undefined>();
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | undefined>();
  const [routeStart, setRouteStart] = useState<{ lat: number; lng: number; label: string; gpsAccuracyM?: number } | undefined>();
  const [selectedDesignatedArea, setSelectedDesignatedArea] = useState<{ name: string; lat: number; lng: number } | undefined>();
  const [mapFeatures, setMapFeatures] = useState<MapFeature[]>(initialMapFeatures ?? []);
  const [mapNotice, setMapNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | undefined>();
  const [mapView, setMapView] = useState<ViewportBbox>(() => buildViewportBbox(defaultCenter));
  const [mapAutoFocusKey, setMapAutoFocusKey] = useState<string | undefined>();
  const [offlineMode, setOfflineMode] = useState(false);
  const [cachedRules, setCachedRules] = useState<Awaited<ReturnType<typeof import("@/lib/data/rules-cache").getCachedRules>> | undefined>();

  const result = statusResponse?.result;
  const centerLat = result?.lat ?? routeStart?.lat ?? defaultCenter.lat;
  const centerLng = result?.lng ?? routeStart?.lng ?? defaultCenter.lng;
  const selectedCenter = useMemo(() => ({ lat: centerLat, lng: centerLng }), [centerLat, centerLng]);
  const visibleMapFeatures = useMemo(() => {
    return vectorTileBaseUrl
      ? mapFeatures.filter((feature) => feature.sourceId === "community-reports")
      : mapFeatures;
  }, [mapFeatures, vectorTileBaseUrl]);
  const bbox = mapView;
  const showRouteAction = Boolean(result?.nearestDesignatedArea);
  const updateMapView = useCallback((nextView: ViewportBbox) => {
    setMapView((currentView) => isSameViewportBbox(currentView, nextView) ? currentView : nextView);
  }, []);

  async function selectMapPoint(lat: number, lng: number) {
    setGpsAccuracyM(undefined);
    setRouteResponse(undefined);
    setRouteStart(undefined);
    setSelectedDesignatedArea(undefined);
    setMapAutoFocusKey(undefined);
    setSelectedSource(t("sourceLabel.mapReverseContext"));
    setIsLoading(true);
    let address = t("sourceLabel.selectedMapPoint");
    try {
      const response = await fetch("/api/onemap/reverse-geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, buffer: 40, addressType: "All" }),
      });
      if (response.ok) {
        const payload = (await response.json()) as ReverseGeocodeResponse;
        address = payload.result.address ?? address;
      }
    } catch {
      setSelectedSource(t("sourceLabel.mapReverseUnavailable"));
    }
    await runStatusLookup({ lat, lng, selectedAddress: address, inputSource: "map" });
  }

  async function removeCommunityFeature(feature: MapFeature) {
    const id = feature.id.startsWith("community-") ? feature.id.slice("community-".length) : "";
    if (!id || feature.verified !== false || feature.sourceId !== "community-reports") return;

    try {
      const response = await fetch("/api/community/areas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, kind: feature.kind }),
      });
      if (!response.ok) throw new Error("Unable to remove community area.");
      setMapFeatures((current) => current.filter((entry) => entry.id !== feature.id));
      setMapNotice("Community area removed.");
    } catch {
      setMapNotice("Could not remove this community area. Please try again.");
    }
  }

  function useMyLocation() {
    setError(undefined);
    setRouteResponse(undefined);
    setSelectedDesignatedArea(undefined);
    trackEvent("geolocation_requested", { request_purpose: "status_check" });
    if (!navigator.geolocation) {
      trackEvent("geolocation_failed", { outcome: "unavailable", request_purpose: "status_check" });
      setError(t("errors.locationUnavailable"));
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        trackEvent("geolocation_resolved", { request_purpose: "status_check" });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy);
        setGpsAccuracyM(accuracy);
        setRouteStart({ lat, lng, label: t("sourceLabel.currentLocation"), gpsAccuracyM: accuracy });
        setMapAutoFocusKey(`gps:${lat.toFixed(6)},${lng.toFixed(6)}`);
        void reverseGeocodeAndCheck(lat, lng, accuracy);
      },
      () => {
        trackEvent("geolocation_failed", { outcome: "denied_or_unavailable", request_purpose: "status_check" });
        setIsLoading(false);
        setError(t("errors.locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const handleMapSelect = useCallback((lat: number, lng: number) => {
    trackEvent("map_point_selected");
    void selectMapPoint(lat, lng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleAutoFocusComplete = useCallback(() => {
    setMapAutoFocusKey(undefined);
  }, []);

  const seededFeaturesRef = useRef((initialMapFeatures?.length ?? 0) > 0);
  const initialBboxRef = useRef<ViewportBbox | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (seededFeaturesRef.current) {
      seededFeaturesRef.current = false;
      initialBboxRef.current = bbox;
      return () => {
        cancelled = true;
      };
    }
    if (initialBboxRef.current !== undefined && isSameViewportBbox(bbox, initialBboxRef.current)) return;
    async function loadFeatures() {
      try {
        const params = new URLSearchParams(Object.entries(bbox).map(([key, value]) => [key, String(value)]));
        const response = await fetch(`/api/geospatial/map-features?${params.toString()}`);
        if (!response.ok) throw new Error(tRef.current("map.mapFeaturesUnavailable"));
        const payload = (await response.json()) as MapFeaturesResponse;
        if (!cancelled) {
          setMapFeatures(payload.features);
          setMapNotice(undefined);
        }
      } catch {
        if (!cancelled) {
          setMapFeatures([]);
          setMapNotice(tRef.current("map.mapOverlayNote"));
        }
      }
    }
    void loadFeatures();
    return () => {
      cancelled = true;
    };
  }, [bbox, vectorTileBaseUrl]);

  async function searchOneMap() {
    if (query.trim().length === 0) {
      setError(t("errors.emptySearch"));
      return;
    }
    setIsLoading(true);
    setError(undefined);
    setRouteResponse(undefined);
    try {
      const response = await fetch(`/api/onemap/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(response.status === 429 ? t("errors.rateLimited") : t("errors.searchUnavailable"));
      const payload = (await response.json()) as SearchResponse;
      setSearchResults(payload.candidates);
      trackEvent("location_search_completed", {
        outcome: payload.candidates.length > 0 ? "results" : "empty",
        candidate_count_bucket: payload.candidates.length === 0 ? "0" : payload.candidates.length <= 3 ? "1-3" : "4-plus",
      });
      if (payload.candidates.length === 0) setError(t("errors.noResults"));
    } catch (caught) {
      setSearchResults([]);
      trackEvent("location_search_completed", { outcome: "error" });
      setError(caught instanceof Error ? caught.message : t("errors.searchUnavailable"));
    } finally {
      setIsLoading(false);
    }
  }

  function selectSearchResult(candidate: OneMapSearchCandidate) {
    trackEvent("search_result_selected");
    setSelectedSource(`${t("sourceLabel.oneMapSelectedResult")}: ${candidate.label}`);
    setGpsAccuracyM(undefined);
    setRouteStart(undefined);
    setSelectedDesignatedArea(undefined);
    setSearchResults([]);
    setMapAutoFocusKey(`search:${candidate.id}`);
    void runStatusLookup({ lat: candidate.lat, lng: candidate.lng, selectedAddress: candidate.address, inputSource: "search" });
  }

  async function shareCurrentLocation() {
    if (!result) {
      setShareStatus(t("map.sharePrompt"));
      return;
    }
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("lat", result.lat.toFixed(6));
    url.searchParams.set("lng", result.lng.toFixed(6));
    url.searchParams.set("q", result.selectedAddress.slice(0, 80));
    const shareText = `${t("map.shareGuidance")} ${result.selectedAddress}: ${getStatusLabel(result.status, t)}`;
    const usedNativeShare = typeof navigator.share === "function";
    try {
      if (usedNativeShare) {
        await navigator.share({ title: t("map.shareTitle"), text: shareText, url: url.toString() });
      } else {
        await navigator.clipboard.writeText(url.toString());
      }
      setShareStatus(t("result.shareCopied"));
      trackEvent("location_share_completed", { method: usedNativeShare ? "native" : "clipboard" });
    } catch {
      setShareStatus(t("result.shareCancelled"));
      trackEvent("location_share_cancelled");
    }
  }

  async function reverseGeocodeAndCheck(lat: number, lng: number, accuracy: number, options: { setAsRouteStart?: boolean } = {}) {
    let address = t("sourceLabel.approximateLocation");
    try {
      const response = await fetch("/api/onemap/reverse-geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, buffer: 40, addressType: "All" }),
      });
      if (response.ok) {
        const payload = (await response.json()) as ReverseGeocodeResponse;
        address = payload.result.address ?? address;
        setSelectedSource(payload.result.status === "found" ? t("sourceLabel.reverseGeocodeContext") : t("sourceLabel.gpsNoAddress"));
      } else {
        setSelectedSource(t("sourceLabel.gpsReverseUnavailable"));
      }
    } catch {
      setSelectedSource(t("sourceLabel.gpsReverseUnavailable"));
    }

    if (options.setAsRouteStart) setRouteStart({ lat, lng, label: address, gpsAccuracyM: accuracy });
    await runStatusLookup({ lat, lng, gpsAccuracyM: accuracy, selectedAddress: address, inputSource: "gps" });
  }

  async function runStatusLookup(input: { lat: number; lng: number; gpsAccuracyM?: number; selectedAddress?: string; inputSource: StatusInputSource }) {
    setIsLoading(true);
    setError(undefined);
    setRouteResponse(undefined);
    const { inputSource, ...statusInput } = input;
    try {
      const response = await fetch("/api/geospatial/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusInput),
      });
      if (!response.ok) throw new Error(t("errors.statusLookupFailed"));
      const payload = (await response.json()) as StatusResponse;
      setStatusResponse(payload);
      setOfflineMode(false);
      trackEvent("status_check_completed", { input_source: inputSource, outcome: payload.result.status });
    } catch {
      setOfflineMode(true);
      const cached = await loadCachedRulesFallback();
      if (cached && input.selectedAddress) {
        const { buildLocationResultFromCache } = await import("@/lib/data/rules-cache");
        const fallback = buildLocationResultFromCache(input.lat, input.lng, input.selectedAddress, cached);
        setStatusResponse({ result: fallback, privacy: { precisePublicLocationStored: false, note: t("result.offlineNote") } });
        setCachedRules(cached);
        setError(undefined);
        trackEvent("status_check_completed", { input_source: inputSource, outcome: "offline_fallback" });
      } else {
        setStatusResponse(undefined);
        setError(t("errors.offlineNoCache"));
        trackEvent("status_check_completed", { input_source: inputSource, outcome: "failed" });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCachedRulesFallback() {
    if (cachedRules) return cachedRules;
    try {
      const { getCachedRules } = await import("@/lib/data/rules-cache");
      const cached = await getCachedRules();
      if (cached) setCachedRules(cached);
      return cached;
    } catch {
      return undefined;
    }
  }

  useEffect(() => {
    const lat = Number(initialLat);
    const lng = Number(initialLng);
    if (!isSingaporeCoordinate({ lat, lng })) return;
    const timer = window.setTimeout(() => {
      setSelectedSource(signageMode ? t("sourceLabel.qrLandingCoordinate") : t("sourceLabel.sharedMapCoordinate"));
      setMapAutoFocusKey(`shared:${lat.toFixed(6)},${lng.toFixed(6)}`);
      void runStatusLookup({ lat, lng, selectedAddress: signageMode ? t("sourceLabel.qrLocation") : t("sourceLabel.sharedLocation"), inputSource: signageMode ? "signage" : "shared" });
    }, 0);
    return () => window.clearTimeout(timer);
    // Only hydrate initial URL state once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getWalkingRoute() {
    const destination = selectedDesignatedArea ?? result?.nearestDesignatedArea;
    if (!destination) return;
    trackEvent("directions_requested", { destination_source: selectedDesignatedArea ? "selected_area" : "nearest_result" });
    if (!routeStart) {
      requestRouteStartThenRoute(destination);
      return;
    }
    void getWalkingRouteAsync(routeStart, destination);
  }

  const selectDesignatedArea = useCallback((area: { name: string; lat: number; lng: number }) => {
    setSelectedDesignatedArea(area);
    setRouteResponse(undefined);
    setError(undefined);
  }, []);
  function routeToDesignatedArea(area: RouteDestination) {
    setSelectedDesignatedArea(area);
    setRouteResponse(undefined);
    setError(undefined);
    if (!routeStart) {
      requestRouteStartThenRoute(area);
      return;
    }
    void getWalkingRouteAsync(routeStart, area);
  }

  function requestRouteStartThenRoute(destination: RouteDestination) {
    setError(undefined);
    if (!navigator.geolocation) {
      setError(t("errors.locationUnavailable"));
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const start = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: t("sourceLabel.currentLocation"),
          gpsAccuracyM: Math.round(position.coords.accuracy),
        };
        setRouteStart(start);
        void getWalkingRouteAsync(start, destination);
      },
      () => {
        setIsLoading(false);
        setError(t("errors.routeDenied"));
        trackEvent("directions_completed", { outcome: "location_denied" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function getWalkingRouteAsync(start: { lat: number; lng: number }, destination: RouteDestination) {
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/onemap/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { lat: start.lat, lng: start.lng },
          end: { lat: destination.lat, lng: destination.lng },
          routeType: "walk",
        }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? t("errors.routeRateLimited") : t("errors.routeUnavailable"));
      setRouteResponse((await response.json()) as RouteResponse);
      trackEvent("directions_completed", { outcome: "success" });
    } catch (caught) {
      setRouteResponse(undefined);
      setError(caught instanceof Error ? caught.message : t("errors.routeTemporarilyUnavailable"));
      trackEvent("directions_completed", { outcome: "failed" });
    } finally {
      setIsLoading(false);
    }
  }

  const useMyLocationRef = useRef(useMyLocation);
  useMyLocationRef.current = useMyLocation;
  const stableUseMyLocation = useCallback(() => useMyLocationRef.current(), []);

  const routeToDesignatedAreaRef = useRef(routeToDesignatedArea);
  routeToDesignatedAreaRef.current = routeToDesignatedArea;
  const stableRouteToDesignatedArea = useCallback((area: RouteDestination) => routeToDesignatedAreaRef.current(area), []);

  const decodedRouteLine = useMemo(
    () => (routeResponse?.route.encodedGeometry ? decodePolyline(routeResponse.route.encodedGeometry) : undefined),
    [routeResponse],
  );

  return (
    <section className={`live-checker live-checker--${variant}`} aria-label={t("map.ariaLiveChecker")}>
      <div className="live-panel stack-sm">
        <div className="stack-sm">
          <h2 className="live-panel__title">{t("result.checkLocation")}</h2>
          <p className="source-line">{t("result.searchFirst")}</p>
        </div>

        <form className="live-search" onSubmit={(event) => { event.preventDefault(); searchOneMap(); }}>
          <label className="stack-sm live-search__field">
            <span className="eyebrow">{t("home.searchPlaceholder")}</span>
            <input className="search-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("home.searchPlaceholder")} autoComplete="street-address" />
          </label>
          <div className="button-row live-search__actions">
            <button type="submit" className="live-primary-button" disabled={isLoading}>{isLoading ? "..." : t("home.searchButton")}</button>
            <Button onClick={useMyLocation} variant="secondary" disabled={isLoading}>{isLoading ? "..." : t("home.useLocation")}</Button>
          </div>
            <p className="source-line">{signageMode ? t("result.signageModeNote") : query.trim().length === 0 ? t("home.guidanceNote") : t("result.sourceBacked")}</p>
        </form>

        {result ? (
          <div className="selected-location-summary" aria-live="polite">
            <span>{t("result.selectedLocation")}</span>
            <strong>{result.selectedAddress}</strong>
            <p>{t("result.selectedSource")}</p>
          </div>
        ) : null}

        {searchResults.length > 0 ? (
          <div className="onemap-results stack-sm" aria-label={t("map.ariaSearchResults")}>
            <p className="source-line">{t("result.oneMapResults")}</p>
            {searchResults.slice(0, 6).map((candidate) => (
              <button key={candidate.id} type="button" className="onemap-result" onClick={() => selectSearchResult(candidate)}>
                <strong>{candidate.label}</strong>
                <span>{candidate.address}</span>
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="live-error" role="status">{error}</p> : null}
      </div>

        <MapPreview
          features={visibleMapFeatures}
          vectorTileBaseUrl={vectorTileBaseUrl}
          vectorTileLayerName={vectorTileLayerName}
          autoFocusKey={mapAutoFocusKey}
          mapNotice={mapNotice}
          result={result}
          gpsAccuracyM={gpsAccuracyM}
          routeStart={routeStart}
          routeLine={decodedRouteLine}
          center={selectedCenter}
        onViewportChange={updateMapView}
        onMapSelect={handleMapSelect}
        onUseMyLocation={stableUseMyLocation}
        onDesignatedAreaSelect={selectDesignatedArea}
        onDesignatedAreaRoute={stableRouteToDesignatedArea}
        onRemoveCommunityFeature={removeCommunityFeature}
        onAutoFocusComplete={handleAutoFocusComplete}
      />

      <div className="live-result-panel-desktop">
        <ResultPanel
          statusResponse={statusResponse}
          selectedSource={selectedSource}
          gpsAccuracyM={gpsAccuracyM}
          routeResponse={routeResponse}
          showRouteAction={Boolean(showRouteAction)}
          selectedDesignatedArea={selectedDesignatedArea}
          isLoading={isLoading}
          hasRouteStart={Boolean(routeStart)}
          onRoute={getWalkingRoute}
          onShare={shareCurrentLocation}
          shareStatus={shareStatus}
          snapState="full"
          mode="desktop"
          offlineMode={offlineMode}
          cachedRules={cachedRules}
        />
      </div>

      <div className="live-result-panel-mobile">
        <ResultPanel
          statusResponse={statusResponse}
          selectedSource={selectedSource}
          gpsAccuracyM={gpsAccuracyM}
          routeResponse={routeResponse}
          showRouteAction={Boolean(showRouteAction)}
          selectedDesignatedArea={selectedDesignatedArea}
          isLoading={isLoading}
          hasRouteStart={Boolean(routeStart)}
          onRoute={getWalkingRoute}
          onShare={shareCurrentLocation}
          shareStatus={shareStatus}
          snapState="full"
          mode="desktop"
          offlineMode={offlineMode}
          cachedRules={cachedRules}
        />
      </div>
    </section>
  );
}

const MapPreview = memo(function MapPreview({ features, vectorTileBaseUrl, vectorTileLayerName, autoFocusKey, mapNotice, result, gpsAccuracyM, routeStart, routeLine, center, onViewportChange, onMapSelect, onUseMyLocation, onDesignatedAreaSelect, onDesignatedAreaRoute, onRemoveCommunityFeature, onAutoFocusComplete }: {
  features: MapFeature[];
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
  autoFocusKey?: string;
  mapNotice?: string;
  result?: LocationResult;
  gpsAccuracyM?: number;
  routeStart?: { lat: number; lng: number; label: string };
  routeLine?: [number, number][];
  center: { lat: number; lng: number };
  onViewportChange: (bbox: ViewportBbox) => void;
  onMapSelect: (lat: number, lng: number) => void;
  onUseMyLocation: () => void;
  onDesignatedAreaSelect?: (area: { name: string; lat: number; lng: number }) => void;
  onDesignatedAreaRoute?: (area: { name: string; lat: number; lng: number }) => void;
  onRemoveCommunityFeature: (feature: MapFeature) => void;
  onAutoFocusComplete?: () => void;
}) {
  const { t } = useI18n();
  const statusClass = result ? statusMapClass[result.status] : "neutral";

  return (
    <div className="live-map-wrapper">
    <section className={`live-map-preview live-map-preview--${statusClass}`} aria-label={t("map.ariaLabel")}>
      <InteractiveOneMap
        center={center}
        autoFocusKey={autoFocusKey}
        features={features}
        vectorTileBaseUrl={vectorTileBaseUrl}
        vectorTileLayerName={vectorTileLayerName}
        result={result}
        gpsAccuracyM={gpsAccuracyM}
        routeStart={routeStart}
        routeLine={routeLine}
        onViewportChange={onViewportChange}
        onMapSelect={onMapSelect}
        onDesignatedAreaSelect={onDesignatedAreaSelect}
        onDesignatedAreaRoute={onDesignatedAreaRoute}
        onRemoveCommunityFeature={onRemoveCommunityFeature}
        onAutoFocusComplete={onAutoFocusComplete}
      />
       <div className="public-map-controls" aria-label={t("map.ariaPublicControls")}>
         <button type="button" onClick={onUseMyLocation}>{t("home.currentLocation")}</button>
       </div>
    </section>
       <div className="live-map-preview__legend"><MapLegend showCurrentLocation={Boolean(gpsAccuracyM || routeStart)} showNearestArea={Boolean(result?.nearestDesignatedArea)} showFocus={Boolean(result)} /></div>
    <div className="live-map-preview__status">
      <strong>{result ? getStatusLabel(result.status, t) : t("result.selectPrompt")}</strong>
      <span>{mapNotice ?? (result ? t("result.guidanceNote") : t("result.searchFirst"))}</span>
    </div>
    </div>
  );
});

function ResultPanel({ statusResponse, selectedSource, gpsAccuracyM, routeResponse, showRouteAction, selectedDesignatedArea, isLoading, hasRouteStart, onRoute, onShare, shareStatus, snapState, mode, offlineMode = false, cachedRules }: {
  statusResponse?: StatusResponse;
  selectedSource?: string;
  gpsAccuracyM?: number;
  routeResponse?: RouteResponse;
  showRouteAction: boolean;
  selectedDesignatedArea?: { name: string; lat: number; lng: number };
  isLoading: boolean;
  hasRouteStart: boolean;
  onRoute: () => void;
  onShare: () => void;
  shareStatus?: string;
  snapState: BottomSheetSnapState;
  mode: "desktop" | "mobile";
  offlineMode?: boolean;
  cachedRules?: CachedRulesPayload | undefined;
}) {
  const { t } = useI18n();
  const result = statusResponse?.result;
  const { showCollapsedSection, showHalfSection, showFullSection } = getResultPanelVisibility(mode, snapState);
  if (!result) {
    return (
      <section className="live-result-panel" aria-label={t("map.ariaLocationResult")} aria-live="polite">
        <Badge tone={selectedDesignatedArea ? "success" : "blue"}>{selectedDesignatedArea ? t("result.directionsTarget") : t("result.awaitingCheck")}</Badge>
        <h2>{selectedDesignatedArea ? `${t("result.routeTo")} ${selectedDesignatedArea.name}` : t("result.selectPrompt")}</h2>
        {selectedDesignatedArea ? (
          <p className="body-copy">{t("result.routeHint")}</p>
        ) : (
          <>
            <p className="body-copy">{t("result.awaitingBody")}</p>
            <p className="source-line">{t("result.locationOptional")}</p>
          </>
        )}
        {selectedDesignatedArea ? <SelectedAreaRouteCard area={selectedDesignatedArea} isLoading={isLoading} hasRouteStart={hasRouteStart} onRoute={onRoute} /> : null}
        {routeResponse ? <RouteSummary routeResponse={routeResponse} /> : null}
      </section>
    );
  }

  return (
    <section className="live-result-panel" aria-label={t("map.ariaLocationResult")} aria-live="polite">
      <div className="result-status-heading">
        <Badge tone={statusTone[result.status]}>{getStatusLabel(result.status, t)}</Badge>
        <h2>{result.selectedAddress}</h2>
      </div>
      <div className={`result-guidance-callout result-guidance-callout--${statusTone[result.status]}`}>
        <strong>{getStatusLabel(result.status, t)}</strong>
        <span>{t("result.guidanceNote")}</span>
      </div>
      <div className="result-snap-summary" aria-label={t("map.ariaResultSnapSummary")}>
        <section><strong>{t("result.collapsed")}</strong><span>{getStatusLabel(result.status, t)}</span></section>
        <section><strong>{t("result.half")}</strong><span>{result.nearestDesignatedArea ? `${result.nearestDesignatedArea.name} ${result.distanceM}m ${t("map.awaySuffix")}.` : t("result.nodarest")}</span></section>
        <section><strong>{t("result.full")}</strong><span>{t("map.snapFullDescription")}</span></section>
      </div>
      {showCollapsedSection ? (
        <section className="result-mobile-state result-mobile-state--collapsed" aria-label={t("map.ariaCollapsedSnap")}>
          <strong>{t("result.quickSummary")}</strong>
          <p>{getStatusLabel(result.status, t)}</p>
        </section>
      ) : null}
      {showHalfSection ? (
        <section className="result-mobile-state result-mobile-state--half" aria-label={t("map.ariaHalfSnap")}>
          <strong>{t("result.nearestDA")}</strong>
          <p>{result.nearestDesignatedArea ? `${result.nearestDesignatedArea.name} is approximately ${result.distanceM}m ${t("map.awaySuffix")}.` : t("result.nodarest")}</p>
          {result.matchedProhibitedZone ? <p className="source-line">{t("result.matchedZone")}: {result.matchedProhibitedZone.name}</p> : null}
          {!selectedDesignatedArea && showRouteAction ? <Button onClick={onRoute} variant="secondary" disabled={isLoading}>{hasRouteStart ? t("result.routeButton") : t("result.useLocationBefore")}</Button> : null}
          {!selectedDesignatedArea && showRouteAction && !hasRouteStart ? <p className="source-line">{t("result.routeNeedLocation")}</p> : null}
        </section>
      ) : null}
      {showFullSection ? <dl className="status-report" aria-label={t("map.ariaStatusReport")}>
        {selectedSource ? <ReportRow label={t("result.locationContext")} value={`${selectedSource}.`} /> : null}
        {gpsAccuracyM ? <ReportRow label={t("result.gpsAccuracy")} value={`${t("map.gpsAccuracyTemplate")} ${gpsAccuracyM}m. ${t("map.gpsAccuracySuffix")}`} /> : null}
        <ReportRow label={t("result.nearestDA")} value={result.nearestDesignatedArea ? `${result.nearestDesignatedArea.name}, approximately ${result.distanceM}m ${t("map.awaySuffix")}.` : t("map.noNearestDA")} />
        {result.matchedProhibitedZone ? <ReportRow label={t("result.matchedZone")} value={result.matchedProhibitedZone.name} /> : null}
        <ReportRow label={t("result.dataFreshness")} value={result.freshnessLabel} />
        <ReportSources sources={result.sources ?? []} />
        <ReportRow label={t("result.confidence")} value={result.status === "uncertain" ? t("map.confidenceLow") : result.matchedProhibitedZone ? t("map.confidenceHigh") : t("map.confidenceMedium")} muted />
        <ReportRow label={t("result.privacy")} value={statusResponse.privacy.note} muted />
        <ReportRow label={t("result.disclaimer")} value={result.disclaimer} muted />
      </dl> : null}
      {showFullSection ? <>
        {!result.nearestDesignatedArea ? <ExpandedNearestGuidance lat={result.lat} lng={result.lng} designatedAreas={cachedRules?.designatedAreas ?? designatedAreas} /> : null}
        {offlineMode ? <div className="offline-banner"><strong>{t("result.offlineBanner")}</strong><span>{t("result.offlineNote")} {cachedRules?.cachedAt ? new Date(cachedRules.cachedAt).toLocaleDateString("en-SG") : "unknown"}. Verify against physical signs.</span></div> : null}
        <div className="button-row">
          <Button onClick={onShare} variant="secondary">{t("result.shareButton")}</Button>
        </div>
        {shareStatus ? <p className="source-line" role="status">{shareStatus}</p> : null}
        {selectedDesignatedArea ? <SelectedAreaRouteCard area={selectedDesignatedArea} isLoading={isLoading} hasRouteStart={hasRouteStart} onRoute={onRoute} /> : null}
        {!selectedDesignatedArea && showRouteAction && !showHalfSection ? <Button onClick={onRoute} variant="secondary" disabled={isLoading}>{hasRouteStart ? t("result.routeButton") : t("result.useLocationBefore")}</Button> : null}
        {!selectedDesignatedArea && showRouteAction && !hasRouteStart && !showHalfSection ? <p className="source-line">{t("map.walkRouteText")}</p> : null}
        {result.status === "uncertain" ? <Button href="/rules" variant="secondary">{t("result.readNearules")}</Button> : null}
        {routeResponse ? <RouteSummary routeResponse={routeResponse} /> : null}
      </> : null}
    </section>
  );
}

function ReportSources({ sources }: { sources: SourceMetadata[] }) {
  const { t } = useI18n();
  return (
    <div className="status-report__row status-report__row--muted">
      <dt>{t("result.sources")}</dt>
      <dd className="source-link-list">
        {sources.length === 0 ? t("map.noSourceMetadata") : sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
        ))}
      </dd>
    </div>
  );
}

function ExpandedNearestGuidance({ lat, lng, designatedAreas: areas }: { lat: number; lng: number; designatedAreas: DesignatedArea[] }) {
  const { t } = useI18n();
  const nearest = getNearestDesignatedAreas(lat, lng, areas, 5);
  return (
    <div className="expanded-nearest-guidance">
      <strong>{t("result.expandArea")}</strong>
      <p>{t("result.expandHint")}</p>
      {nearest.length > 0 ? (
        <>
          <p className="source-line">{t("result.nearestList")}:</p>
          <ol className="nearest-results-list">
            {nearest.map((area) => (
              <li key={area.id}>
                <strong>{area.name}</strong>
                <span>{area.address}</span>
                <span className="nearest-distance">{area.distanceM >= 1000 ? `${(area.distanceM / 1000).toFixed(1)}km` : `${area.distanceM}m`} {t("map.awaySuffix")}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <p className="source-line">{t("rules.guidance")}:</p>
      <p>{t("rules.guidanceNote")}</p>
    </div>
  );
}

function ReportRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={muted ? "status-report__row status-report__row--muted" : "status-report__row"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SelectedAreaRouteCard({ area, isLoading, hasRouteStart, onRoute }: { area: RouteDestination; isLoading: boolean; hasRouteStart: boolean; onRoute: () => void }) {
  const { t } = useI18n();
  return (
    <div className="selected-dsa-route-card">
      <div>
        <span>{t("result.directionsTarget")}</span>
        <strong>{area.name}</strong>
        <p>{hasRouteStart ? t("result.routeStartIsSet") : t("result.locationOptional")}</p>
      </div>
      <Button onClick={onRoute} variant="secondary" disabled={isLoading}>{isLoading ? "..." : hasRouteStart ? t("result.routeButton") : t("result.useLocationBefore")}</Button>
    </div>
  );
}

function RouteSummary({ routeResponse }: { routeResponse: RouteResponse }) {
  const { t } = useI18n();
  return (
    <div className="route-summary route-summary--directions stack-sm">
      <div className="route-summary__heading">
        <strong>{t("routeSummary.directions")}</strong>
        {routeResponse.route.status === "found" ? <span>{formatDistance(routeResponse.route.totalDistanceMeters, t)} · {formatTime(routeResponse.route.totalTimeSeconds, t)}</span> : null}
      </div>
      {routeResponse.route.status === "found" ? (
        <>
          <ol className="route-instructions">
            {routeResponse.route.instructions.slice(0, 3).map((instruction, index) => (
              <li key={`${instruction.direction}-${index}`}>{instruction.instruction} ({instruction.distanceText})</li>
            ))}
          </ol>
          {routeResponse.route.instructions.length > 3 ? <p className="source-line">{t("routeSummary.firstStepsNote")}</p> : null}
        </>
      ) : <p className="body-copy">{routeResponse.route.message ?? t("routeSummary.noRouteFound")}</p>}
      <p className="source-line">{routeResponse.disclaimer}</p>
      {routeResponse.route.encodedGeometry ? <p className="source-line">{t("routeSummary.decodedNote")}</p> : <p className="source-line">{t("routeSummary.unavailableNote")}</p>}
    </div>
  );
}

function decodePolyline(encoded: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < encoded.length) {
    const latResult = decodePolylineValue(encoded, index);
    index = latResult.nextIndex;
    lat += latResult.value;
    const lngResult = decodePolylineValue(encoded, index);
    index = lngResult.nextIndex;
    lng += lngResult.value;
    coordinates.push([lat / 100000, lng / 100000]);
  }

  return coordinates.filter(([decodedLat, decodedLng]) => isSingaporeCoordinate({ lat: decodedLat, lng: decodedLng }));
}

function decodePolylineValue(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;
  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);
  return { value: result & 1 ? ~(result >> 1) : result >> 1, nextIndex: index };
}

function formatDistance(value: number | undefined, t: (key: string) => string) {
  if (value === undefined) return t("routeSummary.distanceUnavailable");
  return value >= 1000 ? `${(value / 1000).toFixed(1)}km` : `${Math.round(value)}m`;
}

function formatTime(value: number | undefined, t: (key: string) => string) {
  if (value === undefined) return t("routeSummary.timeUnavailable");
  return `${Math.max(1, Math.round(value / 60))} min`;
}
