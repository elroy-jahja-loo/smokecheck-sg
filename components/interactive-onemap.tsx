"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useId, Fragment } from "react";
import { useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.vectorgrid";
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { isSingaporeCoordinate } from "@/lib/onemap/onemap-validation";

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
  reportCount?: number;
  intensity?: number;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  centroidLat?: number;
  centroidLng?: number;
};

type ViewBbox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

type InteractiveOneMapProps = {
  center: { lat: number; lng: number };
  autoFocusKey?: string;
  features: MapFeature[];
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
  result?: {
    lat: number;
    lng: number;
    selectedAddress: string;
    nearestDesignatedArea?: {
      name: string;
      lat: number;
      lng: number;
    };
  };
  gpsAccuracyM?: number;
  routeStart?: { lat: number; lng: number; label: string };
  routeLine?: [number, number][];
  patrolRouteLine?: [number, number][];
  draftPoints?: { id: string; lat: number; lng: number }[];
  draftRing?: { lat: number; lng: number }[];
  draftPolygons?: { id: string; ring: { lat: number; lng: number }[] }[];
  onViewportChange: (bbox: ViewBbox) => void;
  onMapSelect: (lat: number, lng: number) => void;
  onDesignatedAreaSelect?: (area: { name: string; lat: number; lng: number }) => void;
  onDesignatedAreaRoute?: (area: { name: string; lat: number; lng: number }) => void;
  onAutoFocusComplete?: () => void;
};

const singaporeBounds = L.latLngBounds([1.1, 103.5], [1.5, 104.1]);
const fallbackCenter = { lat: 1.3521, lng: 103.8198 };

const selectedIcon = new L.DivIcon({
  className: "leaflet-div-marker leaflet-div-marker--amber",
  html: "<span>Check</span>",
  iconSize: [54, 54],
  iconAnchor: [27, 27],
});

const routeStartIcon = new L.DivIcon({
  className: "leaflet-div-marker leaflet-div-marker--blue",
  html: "<span>You</span>",
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

const dsaIcon = new L.DivIcon({
  className: "leaflet-div-marker leaflet-div-marker--green",
  html: "<span>DA</span>",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const communityDsaIcon = new L.DivIcon({
  className: "leaflet-div-marker leaflet-div-marker--community",
  html: "<span>CA</span>",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const draftPointIcon = new L.DivIcon({
  className: "leaflet-div-marker leaflet-div-marker--draft",
  html: "<span>+</span>",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const nearestIcon = new L.DivIcon({
  className: "leaflet-div-marker leaflet-div-marker--nearest",
  html: "<span>N</span>",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const clusterIconCache = new Map<number, L.DivIcon>();
function getClusterIcon(count: number) {
  let icon = clusterIconCache.get(count);
  if (!icon) {
    icon = new L.DivIcon({
      className: "leaflet-div-marker leaflet-div-marker--cluster",
      html: `<span>${count}</span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
    clusterIconCache.set(count, icon);
  }
  return icon;
}

const densityIconCache = new Map<string, L.DivIcon>();
function getDensityIcon(count: number, intensity = 1) {
  const level = intensity >= 0.78 ? "hot" : intensity >= 0.45 ? "warm" : "cool";
  const key = `${level}:${count}`;
  let icon = densityIconCache.get(key);
  if (!icon) {
    icon = new L.DivIcon({
      className: `leaflet-div-marker leaflet-div-marker--density leaflet-div-marker--density-${level}`,
      html: `<span>${count}</span>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
    densityIconCache.set(key, icon);
  }
  return icon;
}

const POLYGON_STYLE = { color: "#d32f2f", fillColor: "#d32f2f", weight: 2, fillOpacity: 0.16 };
const POLYGON_STYLE_LO = { color: "#d32f2f", fillColor: "#d32f2f", weight: 2, fillOpacity: 0.18 };
const COMMUNITY_POLYGON_STYLE = { color: "#ed6c02", fillColor: "#ed6c02", weight: 2, fillOpacity: 0.16 };
const COMMUNITY_POLYGON_STYLE_LO = { color: "#ed6c02", fillColor: "#ed6c02", weight: 2, fillOpacity: 0.18 };

function isCommunityFeature(feature: MapFeature) {
  return feature.sourceId === "community-reports";
}

export function InteractiveOneMap(props: InteractiveOneMapProps) {
  const { t } = useI18n();
  const mapInstanceClass = `live-leaflet-map--${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const center = toSafeCoordinate(props.center) ?? fallbackCenter;
  const safeResultCoordinate = toSafeCoordinate(props.result);
  const safeResult = props.result && safeResultCoordinate ? { ...props.result, ...safeResultCoordinate } : undefined;
  const safeRouteStartCoordinate = toSafeCoordinate(props.routeStart);
  const safeRouteStart = props.routeStart && safeRouteStartCoordinate ? { ...props.routeStart, ...safeRouteStartCoordinate } : undefined;
  const safeFeatures = useMemo(() => props.features.filter(hasValidFeatureCoordinate), [props.features]);

  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const containers = document.querySelectorAll(`.${mapInstanceClass}`);
    for (const el of containers) {
      const leafletEl = el as HTMLElement & { _leaflet_id?: number };
      if (leafletEl._leaflet_id !== undefined) {
        el.innerHTML = "";
        delete leafletEl._leaflet_id;
      }
    }
    const raf = requestAnimationFrame(() => setMapReady(true));
    return () => cancelAnimationFrame(raf);
  }, [mapInstanceClass]);

  const attribution = useMemo(() => `<a href="https://www.onemap.gov.sg/" target="_blank" rel="noreferrer">${t("map.oneMapAttr")}</a>`, [t]);

  if (!mapReady) {
    return <div className={`live-leaflet-map ${mapInstanceClass}`} style={{ height: "100%", minHeight: 420 }} />;
  }

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      minZoom={11}
      maxZoom={19}
      scrollWheelZoom
      zoomControl={false}
      className={`live-leaflet-map ${mapInstanceClass}`}
      preferCanvas
      attributionControl
    >
      <TileLayer
        attribution={attribution}
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={19}
        keepBuffer={2}
        updateWhenZooming={false}
        crossOrigin
      />
      <ZoomControl position="topright" />
      <InteractiveMapLayer
        autoFocusKey={props.autoFocusKey}
        features={safeFeatures}
        vectorTileBaseUrl={props.vectorTileBaseUrl}
        vectorTileLayerName={props.vectorTileLayerName}
        result={safeResult}
        gpsAccuracyM={props.gpsAccuracyM}
        routeStart={safeRouteStart}
        routeLine={props.routeLine}
        patrolRouteLine={props.patrolRouteLine}
        draftPoints={props.draftPoints}
        draftRing={props.draftRing}
        draftPolygons={props.draftPolygons}
        onViewportChange={props.onViewportChange}
        onMapSelect={props.onMapSelect}
        onDesignatedAreaSelect={props.onDesignatedAreaSelect}
        onDesignatedAreaRoute={props.onDesignatedAreaRoute}
        onAutoFocusComplete={props.onAutoFocusComplete}
      />
    </MapContainer>
  );
}

const InteractiveMapLayer = memo(function InteractiveMapLayer({
  autoFocusKey,
  features,
  vectorTileBaseUrl,
  vectorTileLayerName,
  result,
  gpsAccuracyM,
  routeStart,
  routeLine,
  patrolRouteLine,
  draftPoints,
  draftRing,
  draftPolygons,
  onViewportChange,
  onMapSelect,
  onDesignatedAreaSelect,
  onDesignatedAreaRoute,
  onAutoFocusComplete,
}: Omit<InteractiveOneMapProps, "center">) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(14);

  const onViewportChangeRef = useRef(onViewportChange);
  const onMapSelectRef = useRef(onMapSelect);
  const onAutoFocusCompleteRef = useRef(onAutoFocusComplete);
  const previousSelectedKey = useRef<string | undefined>(undefined);
  const vectorLayerRef = useRef<L.Layer | undefined>(undefined);
  const debounceTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
    onMapSelectRef.current = onMapSelect;
    onAutoFocusCompleteRef.current = onAutoFocusComplete;
  }, [onViewportChange, onMapSelect, onAutoFocusComplete]);

  const emitViewport = useCallback((map: L.Map) => {
    if (debounceTimerRef.current !== undefined) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      onViewportChangeRef.current(bboxFromMap(map));
    }, 180);
  }, []);

  const map = useMapEvents({
    click(event: L.LeafletMouseEvent) {
      onMapSelectRef.current(event.latlng.lat, event.latlng.lng);
    },
    moveend() {
      emitViewport(map);
    },
    zoomend() {
      const nextZoom = map.getZoom();
      setZoom((current) => (current === nextZoom ? current : nextZoom));
      emitViewport(map);
    },
  });

  useEffect(() => {
    map.setMaxBounds(singaporeBounds);
  }, [map]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      if (debounceTimerRef.current !== undefined) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [map]);

  useEffect(() => {
    if (!autoFocusKey || previousSelectedKey.current === autoFocusKey) {
      if (!autoFocusKey) previousSelectedKey.current = undefined;
      return;
    }
    previousSelectedKey.current = autoFocusKey;

    let focusLat: number | undefined;
    let focusLng: number | undefined;

    if (autoFocusKey.startsWith("gps:")) {
      const [, coords] = autoFocusKey.split(":");
      const [latStr, lngStr] = coords.split(",");
      focusLat = parseFloat(latStr);
      focusLng = parseFloat(lngStr);
    } else if (autoFocusKey.startsWith("shared:")) {
      const [, coords] = autoFocusKey.split(":");
      const [latStr, lngStr] = coords.split(",");
      focusLat = parseFloat(latStr);
      focusLng = parseFloat(lngStr);
    } else if (autoFocusKey.startsWith("search:")) {
      const safeCenter = result ? toSafeCoordinate(result) : undefined;
      if (safeCenter) {
        focusLat = safeCenter.lat;
        focusLng = safeCenter.lng;
      }
    } else {
      const [latStr, lngStr] = autoFocusKey.split(":");
      focusLat = parseFloat(latStr);
      focusLng = parseFloat(lngStr);
    }

    if (focusLat === undefined || focusLng === undefined || isNaN(focusLat) || isNaN(focusLng)) return;

    try {
      const currentZoom = map.getZoom();
      const targetZoom = autoFocusKey.startsWith("search:") || autoFocusKey.startsWith("shared:") || autoFocusKey.startsWith("gps:")
        ? Math.max(currentZoom, 17)
        : currentZoom;
      map.flyTo([focusLat, focusLng], targetZoom, { duration: 0.45 });
    } catch {
      map.setView([fallbackCenter.lat, fallbackCenter.lng], 14);
    } finally {
      onAutoFocusCompleteRef.current?.();
    }
  }, [autoFocusKey, map, result]);

  useEffect(() => {
    if (!routeLine || routeLine.length < 2) return;
    const raf = requestAnimationFrame(() => {
      try {
        const bounds = L.latLngBounds(routeLine.map(([lat, lng]) => L.latLng(lat, lng)));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17, animate: true, duration: 0.5 });
        }
      } catch {
        // fitBounds may fail if map is not ready
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [routeLine, map]);

  useEffect(() => {
    const source = vectorTileBaseUrl?.trim();
    if (!source) {
      if (vectorLayerRef.current) {
        map.removeLayer(vectorLayerRef.current);
        vectorLayerRef.current = undefined;
      }
      return;
    }

    const layerName = vectorTileLayerName?.trim() || "smokecheck_features";
    const url = `${source.replace(/\/$/, "")}/{z}/{x}/{y}.mvt`;
    const styleByKind: Record<string, L.PathOptions> = {
      "designated-area": { color: "#2e7d32", fillColor: "#2e7d32", fillOpacity: 0.34, weight: 2 },
      "prohibited-zone": { color: "#d32f2f", fillColor: "#d32f2f" },
      unknown: { color: "#666", fillColor: "#666", fillOpacity: 0.08, weight: 1 },
    };

    const vectorGridFactory = (L as unknown as {
      vectorGrid?: {
        protobuf: (template: string, options: Record<string, unknown>) => L.Layer;
      };
    }).vectorGrid;
    if (!vectorGridFactory?.protobuf) return;

    if (vectorLayerRef.current) {
      map.removeLayer(vectorLayerRef.current);
      vectorLayerRef.current = undefined;
    }

    const layer = vectorGridFactory.protobuf(url, {
      interactive: false,
      maxZoom: 20,
      minZoom: 10,
      vectorTileLayerStyles: {
        [layerName]: (properties: Record<string, unknown>, currentZoom: number) => {
          const kind = String(properties.kind ?? "unknown");
          if (!isFeatureLayerVisible(kind)) return { opacity: 0, fillOpacity: 0, weight: 0 };
          if (kind === "prohibited-zone") {
            return { ...styleByKind["prohibited-zone"], fillOpacity: currentZoom >= 15 ? 0.16 : 0.09, weight: currentZoom >= 15 ? 2 : 1 };
          }
          return styleByKind[kind] ?? styleByKind.unknown;
        },
      },
    });

    layer.addTo(map);
    vectorLayerRef.current = layer;
    return () => {
      if (vectorLayerRef.current) {
        map.removeLayer(vectorLayerRef.current);
        vectorLayerRef.current = undefined;
      }
    };
  }, [map, vectorTileBaseUrl, vectorTileLayerName]);

  const shouldUseVectorTiles = Boolean(vectorTileBaseUrl?.trim());
  const designatedFeatures = useMemo(
    () => features.filter((feature) => (
      feature.kind === "designated-area" && toSafeCoordinate(feature) && (!shouldUseVectorTiles || isCommunityFeature(feature))
    )),
    [features, shouldUseVectorTiles],
  );
  const dsaFeatures = useMemo(() => designatedFeatures.filter((feature) => !isCommunityFeature(feature)), [designatedFeatures]);
  const communityDsaFeatures = useMemo(() => designatedFeatures.filter(isCommunityFeature), [designatedFeatures]);
  const dsaMarkers = useMemo(() => {
    if (zoom >= 17) {
      return spiderfyDesignatedAreas(dsaFeatures).map((feature) => ({
        id: feature.id,
        name: feature.name,
        lat: feature.displayLat,
        lng: feature.displayLng,
        count: 1,
        community: feature.community,
      }));
    }
    return clusterDesignatedAreas(dsaFeatures);
  }, [dsaFeatures, zoom]);
  const prohibitedFeatures = useMemo(
    () => features.filter((feature) => feature.kind === "prohibited-zone" && (!shouldUseVectorTiles || isCommunityFeature(feature))),
    [features, shouldUseVectorTiles],
  );
  const popupProhibited = useMemo(() => t("map.prohibitedClicked"), [t]);

  const onMapSelectStable = useCallback((lat: number, lng: number) => {
    onMapSelectRef.current(lat, lng);
  }, []);

  return (
    <>
      {dsaMarkers.map((feature) => (
        <Marker
          key={feature.id}
          position={[feature.lat, feature.lng]}
          icon={feature.count > 1 ? getClusterIcon(feature.count) : feature.community ? communityDsaIcon : dsaIcon}
          bubblingMouseEvents={false}
          eventHandlers={feature.count > 1
            ? { click: () => map.flyTo([feature.lat, feature.lng], Math.min(zoom + 2, 18), { duration: 0.35 }) }
            : { click: () => onDesignatedAreaSelect?.({ name: feature.name, lat: feature.lat, lng: feature.lng }) }}
        >
          <Popup>
            {feature.count > 1 ? `${feature.count} ${t("map.clusterNearby")}` : (
              <div className="map-popup-action">
                <strong>{feature.name}</strong>
                <span>{feature.community ? t("map.communityAreaPopup") : t("map.designatedAreaPopup")}</span>
                {!feature.community ? <button type="button" onClick={() => onDesignatedAreaRoute?.({ name: feature.name, lat: feature.lat, lng: feature.lng })}>{t("map.getDirections")}</button> : null}
              </div>
            )}
          </Popup>
        </Marker>
      ))}
      {communityDsaFeatures.map((feature) => {
        const coordinate = toSafeCoordinate(feature);
        return coordinate ? (
          <Fragment key={feature.id}>
            <Circle center={[coordinate.lat, coordinate.lng]} radius={feature.radiusM ?? 10} pathOptions={{ color: "#005baa", fillColor: "#005baa", weight: 1, fillOpacity: 0.1 }} />
            <Marker position={[coordinate.lat, coordinate.lng]} icon={communityDsaIcon} bubblingMouseEvents={false} eventHandlers={{ click: () => onDesignatedAreaSelect?.({ name: feature.name, lat: coordinate.lat, lng: coordinate.lng }) }}>
              <Popup>
                <div className="map-popup-action">
                  <strong>{feature.name}</strong>
                  <span>{t("map.communityAreaPopup")}</span>
                  <button type="button" onClick={() => onDesignatedAreaRoute?.({ name: feature.name, lat: coordinate.lat, lng: coordinate.lng })}>{t("map.getDirections")}</button>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        ) : null;
      })}
      {prohibitedFeatures.map((feature) => (
        <ProhibitedFeature
          key={feature.id}
          feature={feature}
          onMapSelect={onMapSelectStable}
          popupMessage={isCommunityFeature(feature) ? t("map.communityZonePopup") : popupProhibited}
        />
      ))}
      {result?.nearestDesignatedArea ? (
        <Marker position={[result.nearestDesignatedArea.lat, result.nearestDesignatedArea.lng]} icon={nearestIcon}>
          <Popup>{t("map.nearestPopup")}: {result.nearestDesignatedArea.name}</Popup>
        </Marker>
      ) : null}
      {routeStart ? (
        <Marker position={[routeStart.lat, routeStart.lng]} icon={routeStartIcon}>
          <Popup>{t("map.routeStartPopup")}: {routeStart.label}</Popup>
        </Marker>
      ) : null}
      {result ? (
        <Marker position={[result.lat, result.lng]} icon={selectedIcon}>
          <Popup>{result.selectedAddress}</Popup>
        </Marker>
      ) : null}
      {result && gpsAccuracyM ? (
        <Circle center={[result.lat, result.lng]} radius={Math.min(gpsAccuracyM, 300)} pathOptions={{ color: "#005baa", fillColor: "#005baa", fillOpacity: 0.12 }} />
      ) : null}
      {routeLine && routeLine.length > 1 ? (
        <Polyline positions={routeLine} pathOptions={{ color: "#005baa", weight: 5, opacity: 0.82 }}>
          <Popup>{t("map.routeDisclaimer")}</Popup>
        </Polyline>
      ) : null}
      {patrolRouteLine && patrolRouteLine.length > 1 ? (
        <Polyline positions={patrolRouteLine} pathOptions={{ color: "#ed6c02", weight: 4, opacity: 0.9, dashArray: "6 6" }}>
          <Popup>{t("map.routeDisclaimer")}</Popup>
        </Polyline>
      ) : null}
      {draftPolygons?.map((polygon) => (
        <Fragment key={polygon.id}>
          <Polygon positions={polygon.ring.map(({ lat, lng }) => [lat, lng] as [number, number])} pathOptions={COMMUNITY_POLYGON_STYLE} />
          {polygon.ring.map((vertex, index) => (
            <CircleMarker key={`${polygon.id}-${index}`} center={[vertex.lat, vertex.lng]} radius={5} pathOptions={{ color: "#ed6c02", fillColor: "#ed6c02", fillOpacity: 1 }} />
          ))}
        </Fragment>
      ))}
      {draftRing && draftRing.length > 1 ? (
        <Polyline positions={draftRing.map(({ lat, lng }) => [lat, lng] as [number, number])} pathOptions={{ color: "#ed6c02", weight: 3, opacity: 0.9 }} />
      ) : null}
      {draftRing?.map((vertex, index) => (
        <CircleMarker key={`ring-${index}`} center={[vertex.lat, vertex.lng]} radius={5} pathOptions={{ color: "#ed6c02", fillColor: "#ed6c02", fillOpacity: 1 }} />
      ))}
      {draftPoints?.map((point) => (
        <Marker key={point.id} position={[point.lat, point.lng]} icon={draftPointIcon} bubblingMouseEvents={false} />
      ))}
    </>
  );
});

const ProhibitedFeature = memo(function ProhibitedFeature({
  feature,
  onMapSelect,
  popupMessage,
}: {
  feature: MapFeature;
  onMapSelect: (lat: number, lng: number) => void;
  popupMessage: string;
}) {
  const community = isCommunityFeature(feature);
  const popupText = useMemo(() => `${feature.name}. ${popupMessage}`, [feature.name, popupMessage]);
  const polygonRefs = useRef<L.Polygon[]>([]);

  const map = useMap();

  useEffect(() => {
    const updateStyles = () => {
      const currentZoom = map.getZoom();
      const base = community
        ? currentZoom >= 15 ? COMMUNITY_POLYGON_STYLE : COMMUNITY_POLYGON_STYLE_LO
        : currentZoom >= 15 ? POLYGON_STYLE : POLYGON_STYLE_LO;
      for (const layer of polygonRefs.current) {
        layer.setStyle(base);
      }
    };
    updateStyles();
    map.on("zoomend", updateStyles);
    return () => {
      map.off("zoomend", updateStyles);
    };
  }, [map, community]);

  useEffect(() => {
    return () => {
      polygonRefs.current = [];
    };
  }, []);

  if (feature.geometry) {
    const positions = polygonPositions(feature.geometry);
    const baseStyle = community ? COMMUNITY_POLYGON_STYLE_LO : POLYGON_STYLE_LO;
    return (
      <>
        {positions.map((ring, index) => (
          <Polygon
            key={`${feature.id}-${index}`}
            positions={ring}
            pathOptions={baseStyle}
            ref={(layer: L.Polygon | null) => {
              if (layer && !polygonRefs.current.includes(layer)) {
                polygonRefs.current.push(layer);
              }
            }}
            eventHandlers={{ click: (event: L.LeafletMouseEvent) => onMapSelect(event.latlng.lat, event.latlng.lng) }}
          >
            <Popup>{popupText}</Popup>
          </Polygon>
        ))}
      </>
    );
  }

  const centroid = toSafeCoordinate({ lat: feature.centroidLat, lng: feature.centroidLng });
  if (centroid && feature.zoneType === "report_density") {
    const count = Math.max(1, feature.reportCount ?? 1);
    const intensity = Math.max(0.2, Math.min(feature.intensity ?? 0.4, 1));
    const radius = 70 + Math.min(count, 12) * 7;
    const densityPopupText = `${feature.name}. ${popupMessage}`;
    return (
      <>
        <Circle
          center={[centroid.lat, centroid.lng]}
          radius={radius}
          pathOptions={{ color: densityColor(intensity), fillColor: densityColor(intensity), fillOpacity: 0.2 + intensity * 0.22, weight: 2 }}
          eventHandlers={{ click: (event: L.LeafletMouseEvent) => onMapSelect(event.latlng.lat, event.latlng.lng) }}
        >
          <Popup>{densityPopupText}</Popup>
        </Circle>
        <Marker
          position={[centroid.lat, centroid.lng]}
          icon={getDensityIcon(count, intensity)}
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => onMapSelect(centroid.lat, centroid.lng) }}
        >
          <Popup>{densityPopupText}</Popup>
        </Marker>
      </>
    );
  }

  return null;
});

function isFeatureLayerVisible(kind: string) {
  return kind === "designated-area" || kind === "prohibited-zone";
}

function toSafeCoordinate(value: { lat?: number; lng?: number } | undefined) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!isSingaporeCoordinate({ lat, lng })) return undefined;
  return { lat, lng };
}

function hasValidFeatureCoordinate(feature: MapFeature) {
  if (feature.geometry) return true;
  if (feature.kind === "designated-area") return Boolean(toSafeCoordinate(feature));
  if (typeof feature.centroidLat === "number" && typeof feature.centroidLng === "number") return Boolean(toSafeCoordinate({ lat: feature.centroidLat, lng: feature.centroidLng }));
  return true;
}

function densityColor(intensity: number) {
  if (intensity >= 0.78) return "#d32f2f";
  if (intensity >= 0.45) return "#ed6c02";
  return "#facc15";
}

function clusterDesignatedAreas(features: MapFeature[]) {
  const clusters = new Map<string, { ids: string[]; names: string[]; latTotal: number; lngTotal: number; community: boolean }>();
  for (const feature of features) {
    const coordinate = toSafeCoordinate(feature);
    if (!coordinate) continue;
    const key = `${coordinate.lat.toFixed(2)}:${coordinate.lng.toFixed(2)}`;
    const existing = clusters.get(key) ?? { ids: [], names: [], latTotal: 0, lngTotal: 0, community: true };
    existing.ids.push(feature.id);
    existing.names.push(feature.name);
    existing.latTotal += coordinate.lat;
    existing.lngTotal += coordinate.lng;
    if (!isCommunityFeature(feature)) existing.community = false;
    clusters.set(key, existing);
  }

  return Array.from(clusters.entries()).map(([key, cluster]) => ({
    id: `cluster-${key}`,
    name: cluster.names[0] ?? "Designated area",
    lat: cluster.latTotal / cluster.ids.length,
    lng: cluster.lngTotal / cluster.ids.length,
    count: cluster.ids.length,
    community: cluster.community,
  }));
}

function spiderfyDesignatedAreas(features: MapFeature[]) {
  const groups = new Map<string, MapFeature[]>();
  for (const feature of features) {
    const coordinate = toSafeCoordinate(feature);
    if (!coordinate) continue;
    const key = `${coordinate.lat.toFixed(5)}:${coordinate.lng.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), feature]);
  }

  return Array.from(groups.values()).flatMap((group) => {
    if (group.length === 1) {
      const feature = group[0];
      const coordinate = toSafeCoordinate(feature) ?? fallbackCenter;
      return [{ ...feature, community: isCommunityFeature(feature), displayLat: coordinate.lat, displayLng: coordinate.lng }];
    }
    return group.map((feature, index) => {
      const coordinate = toSafeCoordinate(feature) ?? fallbackCenter;
      const angle = (Math.PI * 2 * index) / group.length;
      const offset = 0.00012;
      return {
        ...feature,
        community: isCommunityFeature(feature),
        displayLat: coordinate.lat + Math.sin(angle) * offset,
        displayLng: coordinate.lng + Math.cos(angle) * offset,
      };
    });
  });
}

function polygonPositions(geometry: NonNullable<MapFeature["geometry"]>) {
  if (geometry.type === "Polygon") {
    return [(geometry.coordinates as number[][][]).map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]))];
  }
  return (geometry.coordinates as number[][][][]).map((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])));
}

function bboxFromMap(map: L.Map): ViewBbox {
  const bounds = map.getBounds();
  const center = map.getCenter();
  const maxLatSpan = 0.12;
  const maxLngSpan = 0.12;
  const latSpan = Math.min(bounds.getNorth() - bounds.getSouth(), maxLatSpan);
  const lngSpan = Math.min(bounds.getEast() - bounds.getWest(), maxLngSpan);
  return {
    minLat: clamp(center.lat - latSpan / 2, 1.1, 1.5 - latSpan),
    minLng: clamp(center.lng - lngSpan / 2, 103.5, 104.1 - lngSpan),
    maxLat: clamp(center.lat + latSpan / 2, 1.1 + latSpan, 1.5),
    maxLng: clamp(center.lng + lngSpan / 2, 103.5 + lngSpan, 104.1),
    zoom: Math.round(map.getZoom()),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
