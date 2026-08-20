"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { isSameViewportBbox } from "@/lib/geospatial/viewport-bbox";
import { isSingaporeCoordinate } from "@/lib/onemap/onemap-validation";
import type { LocationResult, OfficerHotspot, OfficerReportDraft } from "@/lib/types";

const InteractiveOneMap = dynamic(
  () => import("@/components/interactive-onemap").then((module) => module.InteractiveOneMap),
  { ssr: false, loading: () => <OneMapOperationsLoading /> },
);

type RecentReport = {
  id: string;
  nearestAddress: string;
  incidentType: string;
  status: string;
  createdAt?: string;
  lat?: number;
  lng?: number;
};

type OfficerOpsWorkspaceProps = {
  hotspots: OfficerHotspot[];
  recentReports: RecentReport[];
  initialDraft: OfficerReportDraft;
  vectorTileBaseUrl?: string;
  vectorTileLayerName?: string;
};

type DensityCluster = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  intensity: number;
  newestReportAt: string;
};

type MapFeature = {
  id: string;
  kind: "designated-area" | "prohibited-zone";
  name: string;
  lat?: number;
  lng?: number;
  zoneType?: string;
  reportCount?: number;
  intensity?: number;
  geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  centroidLat?: number;
  centroidLng?: number;
};

type PatrolRoute = { name: string; coordinates: [number, number][] };

type ViewBbox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

type SelectedPoint = {
  lat: number;
  lng: number;
  selectedAddress: string;
  gpsAccuracyM?: number;
};

type ReportStatus = "draft" | "saving" | "saved" | "error";

const defaultPoint = { lat: 1.3048, lng: 103.8318, selectedAddress: "313 Orchard Road, Singapore 238895" };
const dateRanges = ["Past 24 hours", "Past 7 days", "Past 30 days", "Past 90 days"];
const areaFilters = ["All areas", "Orchard Road", "Marina Bay", "CBD Core", "Geylang", "Islandwide"];
const complaintTypeFilters = ["All complaint types", "Smoking in prohibited area", "Littering near smoking area", "Other"];
const rangeHours: Record<string, number> = {
  "Past 24 hours": 24,
  "Past 7 days": 24 * 7,
  "Past 30 days": 24 * 30,
  "Past 90 days": 24 * 90,
};

export function OfficerOpsWorkspace({ hotspots, recentReports, initialDraft, vectorTileBaseUrl, vectorTileLayerName }: OfficerOpsWorkspaceProps) {
  const { locale, t } = useI18n();
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [lastView, setLastView] = useState<ViewBbox>();
  const [dateRange, setDateRange] = useState(dateRanges[1]);
  const [areaFilter, setAreaFilter] = useState(areaFilters[0]);
  const [complaintTypeFilter, setComplaintTypeFilter] = useState(complaintTypeFilters[0]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showDesignatedAreas, setShowDesignatedAreas] = useState(true);
  const [showProhibitedZones, setShowProhibitedZones] = useState(true);
  const [showPatrolRoute, setShowPatrolRoute] = useState(false);
  const [savedReports, setSavedReports] = useState(recentReports);
  const [densityClusters, setDensityClusters] = useState<DensityCluster[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | undefined>();
  const [selectedBoundaryStatus, setSelectedBoundaryStatus] = useState(t("officerDashboard.selectMapPrompt"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toolInfo, setToolInfo] = useState<string>();
  const [locationNotice, setLocationNotice] = useState(t("officerDashboard.clickAnywhere"));
  const [isLocating, setIsLocating] = useState(false);
  const [mapNotice, setMapNotice] = useState<string>();
  const [densityNotice, setDensityNotice] = useState<string>();

  const rangeLimit = rangeHours[dateRange] ?? 24 * 7;
  const center = selectedPoint && isSingaporeCoordinate(selectedPoint) ? selectedPoint : defaultPoint;
  const draftPoint = selectedPoint ?? defaultPoint;
  const reportDraft = useMemo<OfficerReportDraft>(() => ({
    ...initialDraft,
    idempotencyKey: `prototype-report-${Math.round(draftPoint.lat * 100000)}-${Math.round(draftPoint.lng * 100000)}`,
    coordinates: { lat: draftPoint.lat, lng: draftPoint.lng },
    nearestAddress: draftPoint.selectedAddress,
    boundaryStatus: selectedPoint ? selectedBoundaryStatus : t("officerDashboard.noActiveMarker"),
    occurredAt: new Intl.DateTimeFormat(locale === "en" ? "en-SG" : `${locale}-SG`, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date()),
  }), [draftPoint, initialDraft, locale, selectedBoundaryStatus, selectedPoint, t]);

  const densityFeatures = useMemo<MapFeature[]>(() => showHeatmap ? densityClusters.map((cluster) => ({
    id: `density-${cluster.id}`,
    kind: "prohibited-zone",
    name: `${cluster.count} ${t("officerDashboard.priorReportsLabel")}: ${cluster.label}`,
    zoneType: "report_density",
    reportCount: cluster.count,
    intensity: cluster.intensity,
    centroidLat: cluster.lat,
    centroidLng: cluster.lng,
  })) : [], [densityClusters, showHeatmap, t]);
  const mapFeatures = useMemo(() => {
    const visibleFeatures = showDesignatedAreas ? features : [];
    const visibleDensity = showHeatmap ? densityFeatures : [];
    const merged = [...visibleFeatures, ...visibleDensity];
    return showProhibitedZones ? merged : merged.filter((f) => f.kind !== "prohibited-zone");
  }, [features, densityFeatures, showDesignatedAreas, showHeatmap, showProhibitedZones]);
  const filteredReports = useMemo(() => savedReports.filter((report) => {
    const matchesType = complaintTypeFilter === "All complaint types" ||
      report.incidentType === complaintTypeFilter ||
      (complaintTypeFilter === "Smoking in prohibited area" && report.incidentType.toLowerCase().includes("smoking")) ||
      (complaintTypeFilter === "Littering near smoking area" && report.incidentType.toLowerCase().includes("litter"));

    const areaKeywords: Record<string, string[]> = {
      "Orchard Road": ["orchard", "scotts", "tanglin"],
      "Marina Bay": ["marina", "bayfront", "mbs", "gardens"],
      "CBD Core": ["raffles", "shenton", "robinson", "cecil", "tanjong pagar", "marina"],
      "Geylang": ["geylang"],
      "Islandwide": [],
    };

    if (areaFilter === "All areas") return matchesType;
    if (areaFilter === "Islandwide") return matchesType;

    const keywords = areaKeywords[areaFilter] ?? [areaFilter.toLowerCase()];
    const addressLower = report.nearestAddress.toLowerCase();
    const matchesArea = keywords.some((kw) => addressLower.includes(kw)) ||
      (report.lat && report.lng && isWithinAreaBounds(report.lat, report.lng, areaFilter));

    return matchesType && matchesArea;
  }), [savedReports, complaintTypeFilter, areaFilter]);
  const filteredHotspots = useMemo(() => hotspots.filter((hotspot) => areaFilter === "All areas" || hotspot.area === areaFilter || hotspot.nearestAddress.toLowerCase().includes(areaFilter.toLowerCase().split(" ")[0])), [hotspots, areaFilter]);
  const trendCards = useMemo(() => buildTrendCards(densityClusters, filteredReports, dateRange, t), [dateRange, densityClusters, filteredReports, t]);

  const patrolRoute = useMemo(() => buildPatrolRoute(filteredHotspots, densityClusters, t), [densityClusters, filteredHotspots, t]);
  const refreshDensity = useCallback(async () => {
    try {
      const response = await fetch(`/api/officer/report-density?rangeHours=${rangeLimit}`);
       if (!response.ok) throw new Error(t("officerDashboard.densityLoadFailed"));
      const payload = await response.json() as { reports?: RecentReport[]; clusters?: DensityCluster[]; source?: string };
      setSavedReports(payload.reports ?? []);
      setDensityClusters(payload.clusters ?? []);
      setDensityNotice(payload.source === "supabase_demo_officer_reports" ? undefined : t("officerDashboard.densitySourceNotSupabase"));
    } catch (error) {
      setDensityNotice(error instanceof Error ? error.message : t("officerDashboard.densityLoadFailed"));
    }
  }, [rangeLimit, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshDensity(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshDensity]);

  const loadFeatures = useCallback(async (view: ViewBbox) => {
    if (vectorTileBaseUrl) {
      setFeatures([]);
      setMapNotice(undefined);
      return;
    }
    try {
      const params = new URLSearchParams(Object.entries(view).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/api/geospatial/map-features?${params.toString()}`);
      if (!response.ok) throw new Error(t("map.mapFeaturesUnavailable"));
      const payload = await response.json() as { features: MapFeature[] };
      setFeatures(payload.features);
      setMapNotice(undefined);
    } catch {
      setMapNotice(t("officerDashboard.overlayRefreshFailed"));
    }
  }, [t, vectorTileBaseUrl]);

  const handleViewportChange = useCallback((view: ViewBbox) => {
    if (lastView && isSameViewportBbox(lastView, view)) return;
    setLastView(view);
    void loadFeatures(view);
  }, [lastView, loadFeatures]);

  const handleMapSelect = useCallback((lat: number, lng: number) => {
    void selectMapPoint(lat, lng, "map");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectMapPoint(lat: number, lng: number, source: "map" | "gps") {
    if (!isSingaporeCoordinate({ lat, lng })) {
      setLocationNotice(t("officerDashboard.outsideBounds"));
      return;
    }
    const fallbackAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)} ${t("map.selectedOnOneMap")}`;
    let selectedAddress = fallbackAddress;
    let statusBoundary = t("officerDashboard.pendingVerification");
    try {
      const [reverseResponse, statusResponse] = await Promise.all([
        fetch("/api/onemap/reverse-geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, buffer: 120, addressType: "All" }),
        }),
        fetch("/api/geospatial/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, selectedAddress: fallbackAddress }),
        }),
      ]);
      const reversePayload = await reverseResponse.json().catch(() => undefined) as { result?: { address?: string; building?: string; block?: string; roadName?: string; postal?: string; status?: string } } | undefined;
      const statusPayload = await statusResponse.json().catch(() => undefined) as { result?: LocationResult } | undefined;
      const reverseAddress = formatReverseAddress(reversePayload?.result);
      selectedAddress = reverseAddress || statusPayload?.result?.selectedAddress || fallbackAddress;
      statusBoundary = statusPayload?.result ? statusText(statusPayload.result, t) : statusBoundary;
    } catch {
      selectedAddress = fallbackAddress;
    }
    setSelectedPoint({ lat, lng, selectedAddress });
    setSelectedBoundaryStatus(statusBoundary);
    setLocationNotice(`${source === "gps" ? t("officerDashboard.browserCaptured") : t("officerDashboard.mapPointSelected")}; ${statusBoundary}`);
    setDrawerOpen(true);
  }

  function removeCheck() {
    setSelectedPoint(undefined);
    setSelectedBoundaryStatus(t("officerDashboard.selectMapPrompt"));
    setLocationNotice(t("officerDashboard.checkRemoved"));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationNotice(t("officerDashboard.locationUnavailableMap"));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        void selectMapPoint(position.coords.latitude, position.coords.longitude, "gps");
      },
      () => {
        setIsLocating(false);
        setLocationNotice(t("officerDashboard.locationDeniedMap"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <section className="ops-shell" aria-label={t("officerDashboard.ariaOfficerDashboard")}>
      <aside id="ops-filters" className={`ops-sidebar${filtersOpen ? " is-open" : ""}`} aria-label={t("officerDashboard.ariaEnforcementFilters")}>
        <div className="ops-panel-header">
          <div className="ops-filter-heading"><span className="ops-eyebrow">{t("officer.dashboard.enforcementFilters")}</span><button type="button" className="ops-filter-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">×</button></div>
          <h2>{t("officer.dashboard.liveTriage")}</h2>
        </div>
        <label className="ops-field">
          <span>{t("officer.dashboard.dateRange")}</span>
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
            {dateRanges.map((range) => <option key={range} value={range}>{dateRangeLabel(range, t)}</option>)}
          </select>
        </label>
        <label className="ops-field">
          <span>{t("officer.dashboard.areaFilter")}</span>
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
            {areaFilters.map((area) => <option key={area} value={area}>{areaFilterLabel(area, t)}</option>)}
          </select>
        </label>
        <label className="ops-field">
          <span>{t("officer.dashboard.complaintType")}</span>
          <select value={complaintTypeFilter} onChange={(event) => setComplaintTypeFilter(event.target.value)}>
            {complaintTypeFilters.map((type) => <option key={type} value={type}>{complaintTypeLabel(type, t)}</option>)}
          </select>
        </label>
        <div className="ops-layer-actions">
          <button type="button" className={showHeatmap ? "is-active" : ""} onClick={() => setShowHeatmap((value) => !value)}>{t("officer.dashboard.heatmap")}</button>
          <button type="button" className={showDesignatedAreas ? "is-active" : ""} onClick={() => setShowDesignatedAreas((value) => !value)}>{t("officer.dashboard.dsaLayers")}</button>
          <button type="button" className={showProhibitedZones ? "is-active" : ""} onClick={() => setShowProhibitedZones((value) => !value)}>{t("officer.dashboard.prohibitedZones")}</button>
          <button type="button" className={showPatrolRoute ? "is-active" : ""} onClick={() => setShowPatrolRoute((value) => !value)}>{t("officer.dashboard.patrolRoutes")}</button>
        </div>
        <div className="ops-priority-list">
          <h3>{t("officer.dashboard.patrolPriority")}</h3>
          {filteredHotspots.slice(0, 4).map((hotspot) => (
            <button key={hotspot.id} type="button" onClick={() => void selectMapPoint(hotspot.coordinates.lat, hotspot.coordinates.lng, "map")}>
              <strong>{hotspot.priorityScore}</strong>
              <span>{hotspot.title}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ops-primary-action" onClick={() => exportPatrolPlan(filteredHotspots, filteredReports, patrolRoute, t)}>{t("officer.dashboard.exportPlan")}</button>
        <div className="ops-mini-note">
          <strong>{densityClusters.length} {t("officer.dashboard.densityRegions")}</strong>
          <span>{savedReports.length} {t("officerDashboard.reportsInRange")} {dateRange}. {t("officerDashboard.redderNodes")}</span>
          {densityNotice ? <span>{densityNotice}</span> : null}
        </div>
      </aside>

      <main className="ops-map-panel" aria-label={t("officerDashboard.ariaOneMapOps")}>
        <div className="ops-map-toolbar" aria-label={t("officerDashboard.ariaMapControls")}>
          <button type="button" className="ops-filter-trigger" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} aria-controls="ops-filters">⌘ <span>{t("officer.dashboard.enforcementFilters")}</span></button>
          <div className="ops-map-tools">
            <MapTool label={showHeatmap ? t("officerDashboard.mapTools.hideHeat") : t("officerDashboard.mapTools.showHeat")} info="Toggle simulated activity density markers." onClick={() => setShowHeatmap((value) => !value)} onInfo={setToolInfo} />
            <MapTool label={showPatrolRoute ? t("officerDashboard.mapTools.hidePatrol") : t("officerDashboard.mapTools.showPatrol")} info="Show or hide the suggested patrol route." onClick={() => setShowPatrolRoute((value) => !value)} onInfo={setToolInfo} />
            <MapTool label={isLocating ? "..." : t("officer.dashboard.myLocation")} info="Use browser location to place the report point." onClick={useMyLocation} onInfo={setToolInfo} />
            <MapTool label={t("officerDashboard.mapTools.removeCheck")} info="Remove the selected report point from the map." onClick={removeCheck} onInfo={setToolInfo} />
          </div>
          {toolInfo ? <p className="ops-tool-info" role="status">{toolInfo}<button type="button" onClick={() => setToolInfo(undefined)} aria-label="Close">×</button></p> : null}
        </div>
        <div className="ops-map-canvas">
          <InteractiveOneMap
            center={center}
            autoFocusKey={selectedPoint ? `${selectedPoint.lat}:${selectedPoint.lng}` : undefined}
            features={mapFeatures}
            vectorTileBaseUrl={vectorTileBaseUrl}
            vectorTileLayerName={vectorTileLayerName}
            result={selectedPoint}
            gpsAccuracyM={selectedPoint?.gpsAccuracyM}
            patrolRouteLine={showPatrolRoute ? patrolRoute.coordinates : undefined}
            onViewportChange={handleViewportChange}
            onMapSelect={handleMapSelect}
          />
          <p className="ops-map-banner">{t("officerDashboard.mapStartPrompt", "Click a location or click 'Use my location' to start a report.")}</p>
        </div>
        <div className="ops-map-meta">
          <p className="ops-map-notice" role="status">{mapNotice ?? locationNotice}</p>
          <div className="ops-heat-legend" aria-label={t("officerDashboard.heatLegend.ariaLabel")}>
            <span>{t("officerDashboard.heatLegend.activityHeatmap")}</span>
            <div><i /><i /><i /><i /></div>
            <small>{t("officerDashboard.heatLegend.lowIncidence")}</small><small>{t("officerDashboard.heatLegend.highIncidence")}</small>
          </div>
        </div>
      </main>

      <aside className="ops-detail" aria-label={t("officerDashboard.priorityDetailAria")}>
        <div className="ops-detail-heading">
          <div>
            <span className="ops-priority-pill">{t("officer.dashboard.reportDensity")}</span>
            <h2>{selectedPoint ? t("officer.dashboard.selectedPoint") : t("officer.dashboard.priorReports")}</h2>
            <p>{selectedPoint ? t("officerDashboard.locationReady") : t("officer.dashboard.placeMarker")}</p>
          </div>
          <span className="ops-id">{t("officerDashboard.sourceSupabase")}</span>
        </div>
        <div className="ops-metrics-grid">
          {trendCards.map((card) => <div className={`ops-metric ops-metric--${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></div>)}
        </div>
        <div className="ops-data-card">
          <span>{t("officer.dashboard.selectedLocation")}</span>
          <strong>{selectedPoint?.selectedAddress ?? t("officer.dashboard.noMarker")}</strong>
          <small>{selectedPoint ? `${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}` : t("officerDashboard.clickToPlace")}</small>
        </div>
        <div className="ops-data-card ops-data-card--danger">
          <span>{t("officer.dashboard.boundaryStatus")}</span>
          <strong>{selectedBoundaryStatus}</strong>
          <small>{t("officerDashboard.physicalSignagePrevail")}</small>
        </div>
        {filteredHotspots[0] ? (
          <>
          <div className="ops-factor-list">
            <h3>{t("officer.dashboard.explainableScore")}</h3>
            {filteredHotspots[0].priorityFactors.map((factor) => (
              <div key={factor.label}>
                <strong>{factor.label}: {factor.value}</strong>
                <span>{factor.whyItMatters}</span>
              </div>
            ))}
          </div>
          {filteredHotspots[0].suggestedAction ? <div className="ops-data-card"><span>{t("officer.dashboard.suggestedAction")}</span><strong>{filteredHotspots[0].suggestedAction}</strong></div> : null}
          </>
        ) : null}
        <div className="ops-action-stack">
          <button type="button" className="ops-primary-action" onClick={() => setDrawerOpen(true)}>{t("officer.dashboard.createReport")}</button>
          <button type="button" className="ops-secondary-action" onClick={useMyLocation}>{isLocating ? "..." : t("officer.dashboard.myLocation")}</button>
        </div>
        {filteredReports.length > 0 ? <div className="ops-recent-list"><h3>{t("officer.dashboard.pastReports")}</h3>{filteredReports.slice(0, 7).map((report) => <button type="button" key={report.id} onClick={() => report.lat && report.lng ? void selectMapPoint(report.lat, report.lng, "map") : undefined}><strong>{report.incidentType}</strong><span>{report.nearestAddress} · {report.status}</span></button>)}</div> : <div className="ops-data-card"><span>{t("officer.dashboard.pastReports")}</span><strong>{t("officer.dashboard.noReports")}</strong><small>{t("officer.dashboard.submitNote")}</small></div>}
      </aside>

      {drawerOpen ? <OfficerReportDrawer draft={reportDraft} onClose={() => setDrawerOpen(false)} onSaved={refreshDensity} /> : null}
    </section>
  );
}

function MapTool({ label, info, onClick, onInfo }: { label: string; info: string; onClick: () => void; onInfo: (info: string) => void }) {
  return <span className="ops-map-tool"><button type="button" onClick={onClick}>{label}</button><button type="button" className="ops-map-tool__info" onClick={() => onInfo(info)} aria-label={`${label}: information`}>i</button></span>;
}

function OfficerReportDrawer({ draft, onClose, onSaved }: { draft: OfficerReportDraft; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [incidentType, setIncidentType] = useState<OfficerReportDraft["incidentType"]>(draft.incidentType);
  const [observationSubject, setObservationSubject] = useState<NonNullable<OfficerReportDraft["observationSubject"]>>("Unknown person observed" as NonNullable<OfficerReportDraft["observationSubject"]>);
  const [notes, setNotes] = useState(draft.notes);
  const [handoffUrl, setHandoffUrl] = useState("https://form.gov.sg/prototype-smokecheck-handoff");
  const [status, setStatus] = useState<{ type: ReportStatus; message: string }>({ type: "draft", message: t("officer.report.draft") });

  async function saveReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ type: "saving", message: t("officerReportDrawer.savingDraft") });
    try {
      const csrfToken = window.sessionStorage.getItem("smokecheck:csrf") ?? "";
      const response = await fetch("/api/officer/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${draft.idempotencyKey}-${Date.now()}`,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          ...draft,
          incidentType,
          observationSubject,
          notes: [
            notes,
            `Observation subject: ${observationSubject}`,
            "No NRIC/FIN, offender name, contact, or evidence file collected in SmokeCheck SG.",
          ].join("\n"),
        }),
      });
      const payload = await response.json().catch(() => undefined) as { report?: { id: string }; handoff?: { handoffUrl?: string }; message?: string } | undefined;
      if (!response.ok) throw new Error(payload?.message ?? t("officerReportDrawer.couldNotSave"));
      if (payload?.handoff?.handoffUrl) setHandoffUrl(payload.handoff.handoffUrl);
      setStatus({ type: "saved", message: `${t("officerReportDrawer.handoffAccepted")}${payload?.report?.id ? `: ${payload.report.id}` : ""}. ${t("officerReportDrawer.continueWorkflow")}` });
      await onSaved();
      window.open(payload?.handoff?.handoffUrl ?? handoffUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : t("officerReportDrawer.couldNotSave") });
    }
  }

  async function copyReportDetails() {
    await navigator.clipboard.writeText([
      `${t("officer.report.coordinates")}: ${draft.coordinates.lat.toFixed(5)}, ${draft.coordinates.lng.toFixed(5)}`,
      `${t("officer.report.nearestAddress")}: ${draft.nearestAddress}`,
      `${t("officer.report.boundaryStatus")}: ${draft.boundaryStatus}`,
      `${t("officer.report.time")}: ${draft.occurredAt}`,
      `${t("officer.report.incidentType")}: ${incidentType}`,
      `${t("officer.report.observationSubject")}: ${observationSubject}`,
      `${t("officer.report.fieldNotes")}: ${notes}`,
      t("officerReportDrawer.noPhotoEvidence"),
      t("officerReportDrawer.demoReportOnly"),
    ].join("\n"));
    setStatus({ type: "saved", message: t("officerReportDrawer.copyClipboard") });
  }

  return (
    <div className="ops-drawer-layer" role="dialog" aria-modal="true" aria-labelledby="ops-report-title">
      <button className="ops-drawer-backdrop" type="button" aria-label={t("officerReportDrawer.closeAria")} onClick={onClose} />
      <form className="ops-report-drawer" onSubmit={saveReport}>
        <header>
          <div>
            <span className="ops-eyebrow">{t("officer.report.handoffLabel")}</span>
            <h2 id="ops-report-title">{t("officer.report.handoffTitle")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("officerReportDrawer.closeAria")}>{t("officerReportDrawer.close")}</button>
        </header>
        <div className="ops-drawer-body">
          <div className="ops-captured-grid">
            <DataItem label={t("officer.report.coordinates")} value={`${draft.coordinates.lat.toFixed(5)}, ${draft.coordinates.lng.toFixed(5)}`} />
            <DataItem label={t("officer.report.nearestAddress")} value={draft.nearestAddress} />
            <DataItem label={t("officer.report.boundaryStatus")} value={draft.boundaryStatus} danger />
            <DataItem label={t("officer.report.time")} value={draft.occurredAt} />
            <DataItem label={t("officer.report.officer")} value={draft.officerDisplay} />
          </div>
          <label className="ops-field">
            <span>{t("officer.report.incidentType")}</span>
            <select value={incidentType} onChange={(event) => setIncidentType(event.target.value as OfficerReportDraft["incidentType"])}>
              <option value="Smoking in prohibited area">{t("officerReportDrawer.incidentTypes.smoking")}</option>
              <option value="Littering near smoking area">{t("officerReportDrawer.incidentTypes.littering")}</option>
              <option value="Other">{t("officerReportDrawer.incidentTypes.other")}</option>
            </select>
          </label>
          <label className="ops-field"><span>{t("officer.report.observationSubject")}</span><select value={observationSubject} onChange={(event) => setObservationSubject(event.target.value as NonNullable<OfficerReportDraft["observationSubject"]>)}><option value="Unknown person observed">{t("officerReportDrawer.observationSubjects.unknownPerson")}</option><option value="Premises condition">{t("officerReportDrawer.observationSubjects.premisesCondition")}</option><option value="Patrol observation">{t("officerReportDrawer.observationSubjects.patrolObservation")}</option></select></label>
          <label className="ops-field"><span>{t("officer.report.fieldNotes")}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} /></label>
          <div className="ops-photo-drop" aria-label={t("officerReportDrawer.ariaPhotoPlaceholder")}>
            <strong>{t("officer.report.photoPlaceholder")}</strong>
            <span>{t("officer.report.photoNote")}</span>
          </div>
          <p className={`ops-form-status ops-form-status--${status.type}`} role="status">{status.message}</p>
        </div>
        <footer>
          <button className="ops-primary-action" type="submit" disabled={status.type === "saving"}>{status.type === "saving" ? t("officer.report.saving") : t("officer.report.continueFormSG")}</button>
          <a className="ops-secondary-action" href={handoffUrl} target="_blank" rel="noreferrer">{t("officer.report.openFormSG")}</a>
          <button className="ops-secondary-action" type="button" onClick={copyReportDetails}>{t("officer.report.copyDetails")}</button>
        </footer>
      </form>
    </div>
  );
}

function DataItem({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={danger ? "is-danger" : ""}><span>{label}</span><strong>{value}</strong></div>;
}

function OneMapOperationsLoading() {
  const { t } = useI18n();
  return <div className="ops-map-loading">{t("map.loadingOps")}</div>;
}

function dateRangeLabel(value: string, t: (key: string) => string) {
  return t(`officerDashboard.filters.dateRange.${value}`);
}

function areaFilterLabel(value: string, t: (key: string) => string) {
  return t(`officerDashboard.filters.area.${value}`);
}

function complaintTypeLabel(value: string, t: (key: string) => string) {
  return t(`officerDashboard.filters.complaintType.${value}`);
}

function buildTrendCards(clusters: DensityCluster[], reports: RecentReport[], dateRange: string, t: (key: string) => string) {
  const total = reports.length;
  const hottest = clusters[0];
  return [
    { label: t("officerDashboard.trendReports"), value: String(total), detail: dateRange, tone: total >= 30 ? "red" : "amber" },
    { label: t("officerDashboard.trendRegions"), value: String(clusters.length), detail: t("officerDashboard.trendBuildingClusters"), tone: clusters.length > 0 ? "blue" : "green" },
    { label: t("officerDashboard.trendHottest"), value: String(hottest?.count ?? 0), detail: hottest?.label ?? t("officerDashboard.trendNoActive"), tone: (hottest?.count ?? 0) >= 8 ? "red" : "amber" },
    { label: t("officerDashboard.trendDrafts"), value: String(reports.filter((report) => report.status !== "mock_prior").length), detail: t("officerDashboard.trendAddedAfter"), tone: "green" },
  ];
}

function buildPatrolRoute(hotspots: OfficerHotspot[], clusters: DensityCluster[], t: (key: string) => string): PatrolRoute {
  const points = hotspots.slice(0, 4).map((hotspot) => [hotspot.coordinates.lat, hotspot.coordinates.lng] as [number, number]);
  if (points.length < 2) {
    points.push(...clusters.slice(0, 4).map((cluster) => [cluster.lat, cluster.lng] as [number, number]));
  }
  return { name: t("officerDashboard.patrolRouteName"), coordinates: points.slice(0, 5) };
}

function exportPatrolPlan(hotspots: OfficerHotspot[], reports: RecentReport[], route: PatrolRoute, t: (key: string) => string) {
  const rows = [
    [t("officerDashboard.export.patrolPlanTitle")],
    [t("officerDashboard.export.generated"), new Date().toISOString()],
    [t("officerDashboard.export.route"), route.name],
    [t("officerDashboard.export.stop"), t("officerDashboard.export.priority"), t("officerDashboard.export.area"), t("officerDashboard.export.address"), t("officerDashboard.export.rationale")],
    ...hotspots.slice(0, 8).map((hotspot, index) => [String(index + 1), String(hotspot.priorityScore), hotspot.area ?? "Islandwide", hotspot.nearestAddress, hotspot.reason]),
    [t("officerDashboard.export.filteredReports"), String(reports.length)],
    [t("officerDashboard.export.coordinates"), route.coordinates.map(([lat, lng]) => `${lat.toFixed(5)} ${lng.toFixed(5)}`).join(" | ")],
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `zonebuster-patrol-plan-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const AREA_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  "Orchard Road": { minLat: 1.297, maxLat: 1.312, minLng: 103.828, maxLng: 103.845 },
  "Marina Bay": { minLat: 1.276, maxLat: 1.286, minLng: 103.85, maxLng: 103.865 },
  "CBD Core": { minLat: 1.274, maxLat: 1.288, minLng: 103.842, maxLng: 103.858 },
  "Geylang": { minLat: 1.308, maxLat: 1.323, minLng: 103.874, maxLng: 103.89 },
};

function isWithinAreaBounds(lat: number, lng: number, area: string) {
  const bounds = AREA_BOUNDS[area];
  if (!bounds) return false;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

function formatReverseAddress(result: { address?: string; building?: string; block?: string; roadName?: string; postal?: string; status?: string } | undefined) {
  if (!result || result.status === "not_found") return "";
  return result.address || [result.building, result.block, result.roadName, result.postal ? `Singapore ${result.postal}` : ""].filter(Boolean).join(", ");
}

function statusText(result: LocationResult, t: (key: string) => string) {
  if (result.status === "likely-prohibited") return result.matchedProhibitedZone ? `${t("officerDashboard.likelyProhibited")}: ${result.matchedProhibitedZone.name}` : t("officerDashboard.likelyProhibited");
  if (result.status === "designated-nearby") return result.nearestDesignatedArea ? `${t("officerDashboard.designatedNearby")}: ${result.nearestDesignatedArea.name}` : t("officerDashboard.designatedNearby");
  return t("officerDashboard.uncertainBoundary");
}
