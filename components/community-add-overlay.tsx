"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { defaultCenter } from "@/lib/geospatial/viewport-bbox";

const InteractiveOneMap = dynamic(
  () => import("@/components/interactive-onemap").then((module) => module.InteractiveOneMap),
  {
    ssr: false,
    loading: () => <div className="live-map-loading">...</div>,
  },
);

type AddMode = "smoking" | "no-smoking";

type ViewBbox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

type MapFeature = {
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

const MAX_ITEMS = 10;
const MAX_VERTICES = 64;
const defaultBbox = {
  minLat: 1.2548,
  minLng: 103.7818,
  maxLat: 1.3548,
  maxLng: 103.8818,
  zoom: 14,
} satisfies ViewBbox;

export function CommunityAddOverlay({ open, onClose, vectorTileBaseUrl, vectorTileLayerName }: {
  open: boolean;
  onClose: () => void;
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<AddMode>("smoking");
  const [points, setPoints] = useState<{ id: string; lat: number; lng: number }[]>([]);
  const [ring, setRing] = useState<{ lat: number; lng: number }[]>([]);
  const [polygons, setPolygons] = useState<{ id: string; ring: { lat: number; lng: number }[] }[]>([]);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [mapView, setMapView] = useState<ViewBbox>(defaultBbox);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const closeOverlay = useCallback(() => {
    setPoints([]);
    setRing([]);
    setPolygons([]);
    setError(undefined);
    setSubmitting(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeOverlay]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const params = new URLSearchParams(Object.entries(mapView).map(([key, value]) => [key, String(value)]));
    fetch(`/api/geospatial/map-features?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: { features?: MapFeature[] } | undefined) => {
        if (!cancelled && payload?.features) setFeatures(payload.features);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, mapView]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setError(undefined);
    if (mode === "smoking") {
      setPoints((current) => (current.length >= MAX_ITEMS ? current : [...current, { id: crypto.randomUUID(), lat, lng }]));
    } else {
      if (polygons.length >= MAX_ITEMS) return;
      setRing((current) => {
        if (current.length >= MAX_VERTICES) return current;
        if (current.length > 0) {
          const last = current[current.length - 1];
          if (Math.abs(last.lat - lat) < 0.00001 && Math.abs(last.lng - lng) < 0.00001) return current;
        }
        return [...current, { lat, lng }];
      });
    }
  }, [mode, polygons.length]);

  const updateMapView = useCallback((nextView: ViewBbox) => {
    setMapView((current) => (
      current.minLat === nextView.minLat && current.minLng === nextView.minLng &&
      current.maxLat === nextView.maxLat && current.maxLng === nextView.maxLng && current.zoom === nextView.zoom
        ? current
        : nextView
    ));
  }, []);

  const finishShape = useCallback(() => {
    if (ring.length < 3) return;
    setPolygons((current) => (current.length >= MAX_ITEMS ? current : [...current, { id: crypto.randomUUID(), ring: [...ring, ring[0]] }]));
    setRing([]);
  }, [ring]);

  const undo = useCallback(() => {
    if (mode === "smoking") {
      setPoints((current) => current.slice(0, -1));
    } else if (ring.length > 0) {
      setRing((current) => current.slice(0, -1));
    } else {
      setPolygons((current) => current.slice(0, -1));
    }
  }, [mode, ring.length]);

  const clearAll = useCallback(() => {
    setPoints([]);
    setRing([]);
    setPolygons([]);
  }, []);

  const hasAnything = points.length > 0 || polygons.length > 0 || ring.length > 0;

  async function submit() {
    if (submitting || !hasAnything || ring.length > 0) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/community/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designatedAreas: points.map((point) => ({ lat: point.lat, lng: point.lng })),
          prohibitedZones: polygons.map((polygon) => polygon.ring.map(({ lat, lng }) => ({ lat, lng }))),
        }),
      });
      if (!response.ok) throw new Error("submission_failed");
      window.location.reload();
    } catch {
      setSubmitting(false);
      setError(t("community.error"));
    }
  }

  const finishDisabled = ring.length < 3;
  const addDisabled = mode === "smoking" ? points.length >= MAX_ITEMS : polygons.length >= MAX_ITEMS;
  const draftPoints = useMemo(() => points, [points]);
  const draftPolygons = useMemo(() => polygons, [polygons]);

  if (!open) return null;

  return (
    <div className="community-add-overlay" role="dialog" aria-modal="true" aria-label={t("community.addTitle")}>
      <header className="community-add-overlay__header">
        <div className="community-add-overlay__tabs" role="tablist" aria-label={t("community.addTitle")}>
          <button type="button" role="tab" aria-selected={mode === "smoking"} className={mode === "smoking" ? "is-active" : undefined} onClick={() => setMode("smoking")}>
            {t("community.addSmoking")}
          </button>
          <button type="button" role="tab" aria-selected={mode === "no-smoking"} className={mode === "no-smoking" ? "is-active" : undefined} onClick={() => setMode("no-smoking")}>
            {t("community.addProhibited")}
          </button>
        </div>
        <button type="button" className="community-add-overlay__close" onClick={closeOverlay} aria-label={t("community.close")}>×</button>
      </header>

      <p className="community-add-overlay__hint">
        {mode === "smoking" ? t("community.smokingHint") : t("community.prohibitedHint")}
      </p>

      <div className="community-add-overlay__map">
        <InteractiveOneMap
          center={defaultCenter}
          features={features}
          vectorTileBaseUrl={vectorTileBaseUrl}
          vectorTileLayerName={vectorTileLayerName}
          draftPoints={mode === "smoking" ? draftPoints : undefined}
          draftRing={mode === "no-smoking" ? ring : undefined}
          draftPolygons={mode === "no-smoking" ? draftPolygons : undefined}
          onViewportChange={updateMapView}
          onMapSelect={handleMapClick}
        />
        {addDisabled ? <p className="community-add-overlay__limit" role="status">{t("community.limitReached")}</p> : null}
      </div>

      <footer className="community-add-overlay__footer">
        <div className="community-add-overlay__counts" aria-live="polite">
          <span>{mode === "smoking" ? `${points.length}/${MAX_ITEMS}` : `${polygons.length}/${MAX_ITEMS}`}</span>
        </div>
        <button type="button" className="community-add-overlay__secondary" onClick={undo} disabled={!hasAnything}>{t("community.undo")}</button>
        <button type="button" className="community-add-overlay__secondary" onClick={clearAll} disabled={!hasAnything}>{t("community.clear")}</button>
        {mode === "no-smoking" ? (
          <button type="button" className="community-add-overlay__finish" onClick={finishShape} disabled={finishDisabled}>{t("community.finishShape")}</button>
        ) : null}
        <button type="button" className="community-add-overlay__done" onClick={submit} disabled={submitting || !hasAnything || ring.length > 0}>
          {submitting ? t("community.submitting") : t("community.done")}
        </button>
      </footer>

      {error ? <p className="community-add-overlay__error" role="alert">{error}</p> : null}
    </div>
  );
}
