export type SourceAuthority = "official-agency" | "legislation" | "open-data" | "prototype";

export type SourceMetadata = {
  id: string;
  name: string;
  url: string;
  authority: SourceAuthority;
  retrievedAt: string;
  versionLabel?: string;
  isPrototype: boolean;
};

export type PublicSourceBacked<T> = T & {
  sources: SourceMetadata[];
};

export type DesignatedArea = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  sourceId: string;
  freshnessLabel: string;
  isPrototype: boolean;
  coverageRadiusM?: number;
};

export type GeoJsonPosition = [number, number];

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: GeoJsonPosition[][];
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: GeoJsonPosition[][][];
};

export type ProhibitedZone = {
  id: string;
  name: string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  ruleSummary: string;
  sourceId: string;
  freshnessLabel: string;
  isPrototype: boolean;
};

export type LocationStatus = "likely-prohibited" | "designated-nearby" | "uncertain";

export type LocationResult = {
  status: LocationStatus;
  selectedAddress: string;
  lat: number;
  lng: number;
  gpsAccuracyM?: number;
  nearestDesignatedArea?: DesignatedArea;
  distanceM?: number;
  sourceIds: string[];
  freshnessLabel: string;
  disclaimer: string;
  sources?: SourceMetadata[];
  matchedProhibitedZone?: ProhibitedZone;
};

export type SearchCandidate = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  kind: "designated-area" | "prohibited-zone" | "rule-reference";
  sourceIds: string[];
  freshnessLabel: string;
  isPrototype: boolean;
};

export type OfficerHotspot = {
  id: string;
  title: string;
  area?: string;
  sourceType?: "Public complaint" | "CCTV anomaly" | "Officer patrol log";
  lastReportedHoursAgo?: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  nearestAddress: string;
  recentReports: number;
  reportVolume: string;
  recency: string;
  proximity: string;
  repeatedReports: string;
  peakTime: string;
  boundaryStatus: string;
  priorityScore: number;
  reason: string;
  suggestedAction: string;
  prototypeLabel: "Simulated complaint heatmap" | "Prototype only";
  priorityFactors: {
    label: string;
    value: string;
    whyItMatters: string;
  }[];
  isPrototype: true;
};
export type OfficerReportDraft = {
  idempotencyKey: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  nearestAddress: string;
  boundaryStatus: string;
  occurredAt: string;
  officerDisplay: "Authenticated officer";
  incidentType: "Smoking in prohibited area" | "Littering near smoking area" | "Other";
  observationSubject?: "Unknown person observed" | "Premises condition" | "Patrol observation";
  notes: string;
  attachmentPlaceholder: true;
  isPrototype: true;
};

export type OfficerReportHandoffRecord = OfficerReportDraft & {
  handoffId: string;
  status: "accepted" | "duplicate";
  acceptedAt: string;
  eventName: "officer.report.submitted";
  auditEventName: "audit.event.created";
  handoffUrl: string;
};

export type QueueEventName =
  | "officer.report.submitted"
  | "audit.event.created"
  | "dataset.sync.requested"
  | "dataset.sync.failed"
  | "tile.generation.requested"
  | "webhook.handoff.retry"
  | "rag.ingestion.requested"
  | "analytics.event.submitted"
  | "upstream.api.failed";

export type QueueEvent<TPayload = unknown> = {
  name: QueueEventName;
  idempotencyKey: string;
  payload: TPayload;
  occurredAt: string;
  source: "smokecheck-sg-prototype";
};

export type RagQueryResponse = {
  status: "answered" | "refused";
  answer: string;
  citations: SourceMetadata[];
  disclaimer: string;
  guardrailReason?: string;
};
