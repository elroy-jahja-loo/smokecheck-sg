import { officerHotspots } from "@/data/officer-prototype-data";
import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import type { OfficerHotspot } from "@/lib/types";

export type DemoOfficerReportListItem = {
  id: string;
  nearestAddress: string;
  incidentType: string;
  status: string;
  createdAt: string;
  officerDisplay: string;
  lat: number;
  lng: number;
  observationSubject?: string;
};

export type DemoOfficerDensityCluster = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  intensity: number;
  newestReportAt: string;
};

export async function listDemoComplaintHotspots(): Promise<OfficerHotspot[]> {
  if (!hasPostgisConfig()) return officerHotspots;

  const { rows } = await getPostgisPool().query<{
    id: string;
    title: string;
    incident_type: string;
    report_count: number;
    priority_score: number;
    peak_time: string;
    nearest_address: string;
    boundary_status: string;
    reason: string;
    lat: number;
    lng: number;
  }>(
    `select id, title, incident_type, report_count, priority_score, peak_time,
            nearest_address, boundary_status, reason,
            extensions.st_y(location::extensions.geometry) as lat,
            extensions.st_x(location::extensions.geometry) as lng
     from public.demo_complaint_reports
     order by priority_score desc, report_count desc
     limit 20`,
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    area: inferArea(row.title, row.nearest_address),
    sourceType: inferSourceType(row.incident_type, row.priority_score),
    lastReportedHoursAgo: row.priority_score >= 75 ? 3 : row.priority_score >= 60 ? 22 : 96,
    coordinates: { lat: Number(row.lat), lng: Number(row.lng) },
    nearestAddress: row.nearest_address,
    recentReports: row.report_count,
    reportVolume: `${row.report_count} simulated complaint reports in 7 days`,
    recency: row.priority_score >= 75 ? "High simulated recency in the last 24 hours" : "Moderate simulated recency this week",
    proximity: "Near public amenities, walkways, retail frontage, or transit paths",
    repeatedReports: `${Math.max(1, Math.round(row.report_count / 7))} repeat time windows in the demo dataset`,
    peakTime: row.peak_time,
    boundaryStatus: row.boundary_status,
    priorityScore: row.priority_score,
    reason: row.reason,
    suggestedAction: "Verify the location, signage, and boundary context before saving a demo report.",
    prototypeLabel: "Simulated complaint heatmap",
    priorityFactors: [
      {
        label: "Report volume",
        value: `${row.report_count} demo reports`,
        whyItMatters: "Higher simulated volume makes this a better patrol-planning candidate, not an enforcement decision.",
      },
      {
        label: "Recency",
        value: row.priority_score >= 75 ? "High" : "Medium",
        whyItMatters: "Recent simulated signals are more relevant for planning a visible verification pass.",
      },
      {
        label: "Proximity",
        value: "Public amenities nearby",
        whyItMatters: "Entrances, queues, and sheltered links make physical boundary checks more important.",
      },
      {
        label: "Repeated reports",
        value: row.peak_time,
        whyItMatters: "Repeated windows help plan timing while avoiding automated enforcement claims.",
      },
    ],
    isPrototype: true,
  }));
}

export async function saveDemoOfficerReport(input: {
  idempotencyKey: string;
  officerId?: string;
  coordinates: { lat: number; lng: number };
  nearestAddress: string;
  boundaryStatus: string;
  occurredAt: string;
  incidentType: string;
  observationSubject?: string;
  notes: string;
}) {
  if (!hasPostgisConfig()) {
    const existing = localDemoOfficerReports.get(input.idempotencyKey);
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const record = {
      id: `local-${crypto.randomUUID()}`,
      nearestAddress: input.nearestAddress,
      incidentType: input.incidentType,
      observationSubject: input.observationSubject,
      status: "draft_saved",
      createdAt: new Date().toISOString(),
      officerDisplay: input.officerId ?? "Local demo officer",
      lat: input.coordinates.lat,
      lng: input.coordinates.lng,
    };
    localDemoOfficerReports.set(input.idempotencyKey, record);
    return { id: record.id, status: record.status, duplicate: false };
  }

  const observationSubjectSupported = await hasObservationSubjectColumn();
  const insertSql = observationSubjectSupported
    ? `with inserted as (
         insert into public.demo_officer_reports
            (idempotency_key, officer_id, nearest_address, boundary_status, occurred_at, incident_type, observation_subject, notes, location)
           values ($1, nullif($2, '')::uuid, $3, $4, $5, $6, $7, $8,
                   extensions.st_setsrid(extensions.st_makepoint($9, $10), 4326)::extensions.geography)
         on conflict (idempotency_key) do nothing
         returning id, status, true as inserted
       )
       select id, status, inserted from inserted
       union all
       select id, status, false as inserted
       from public.demo_officer_reports
       where idempotency_key = $1
       limit 1`
    : `with inserted as (
         insert into public.demo_officer_reports
            (idempotency_key, officer_id, nearest_address, boundary_status, occurred_at, incident_type, notes, location)
           values ($1, nullif($2, '')::uuid, $3, $4, $5, $6, $7,
                   extensions.st_setsrid(extensions.st_makepoint($8, $9), 4326)::extensions.geography)
         on conflict (idempotency_key) do nothing
         returning id, status, true as inserted
       )
       select id, status, inserted from inserted
       union all
       select id, status, false as inserted
       from public.demo_officer_reports
       where idempotency_key = $1
       limit 1`;
  const insertValues = observationSubjectSupported
    ? [
      input.idempotencyKey,
      "",
      input.nearestAddress,
      input.boundaryStatus,
      input.occurredAt,
      input.incidentType,
      input.observationSubject ?? null,
      input.notes,
      input.coordinates.lng,
      input.coordinates.lat,
    ]
    : [
      input.idempotencyKey,
      "",
      input.nearestAddress,
      input.boundaryStatus,
      input.occurredAt,
      input.incidentType,
      input.notes,
      input.coordinates.lng,
      input.coordinates.lat,
    ];
  const { rows } = await getPostgisPool().query<{ id: string; status: string; inserted: boolean }>(insertSql, insertValues);

  if (input.officerId && input.officerId !== "prototype-officer-session" && input.officerId !== "demo-officer-seed") {
    await getPostgisPool().query(
      `update public.demo_officer_reports
       set production_officer_id = $2, updated_at = now()
       where idempotency_key = $1`,
      [input.idempotencyKey, input.officerId],
    );
  }
  const row = rows[0];
  return { id: row.id, status: row.status, duplicate: !row.inserted };
}

export async function listRecentDemoOfficerReports() {
  if (!hasPostgisConfig()) return Array.from(localDemoOfficerReports.values()).reverse().slice(0, 20);
  const observationSubjectSelect = (await hasObservationSubjectColumn()) ? "r.observation_subject" : "null::text as observation_subject";
  const { rows } = await getPostgisPool().query<{
    id: string;
    nearest_address: string;
    incident_type: string;
    status: string;
    created_at: Date;
    display_name: string | null;
  lat: number;
  lng: number;
    observation_subject: string | null;
}>(
    `select r.id, r.nearest_address, r.incident_type, r.status, r.created_at, o.display_name,
            ${observationSubjectSelect},
            extensions.st_y(r.location::extensions.geometry) as lat,
            extensions.st_x(r.location::extensions.geometry) as lng
     from public.demo_officer_reports r
     left join public.officers o on o.id = r.production_officer_id
     order by r.created_at desc
     limit 8`,
  );
  return rows.map((row) => ({
    id: row.id,
    nearestAddress: row.nearest_address,
    incidentType: row.incident_type,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    officerDisplay: row.display_name ?? "Unlinked demo officer",
    lat: Number(row.lat),
    lng: Number(row.lng),
    observationSubject: row.observation_subject ?? undefined,
  }));
}

export async function listDemoOfficerReportDensity(rangeHours: number): Promise<{ reports: DemoOfficerReportListItem[]; clusters: DemoOfficerDensityCluster[] }> {
  const safeRangeHours = Number.isFinite(rangeHours) ? Math.min(Math.max(rangeHours, 1), 24 * 120) : 24 * 7;
  const since = new Date(Date.now() - safeRangeHours * 60 * 60 * 1000);
  if (!hasPostgisConfig()) {
    const reports = Array.from(localDemoOfficerReports.values()).filter((report) => new Date(report.createdAt).getTime() >= since.getTime());
    return { reports, clusters: buildDensityClusters(reports) };
  }

  const observationSubjectSelect = (await hasObservationSubjectColumn()) ? "r.observation_subject" : "null::text as observation_subject";
  const { rows } = await getPostgisPool().query<{
    id: string;
    nearest_address: string;
    incident_type: string;
    status: string;
    created_at: Date;
    display_name: string | null;
    lat: number;
    lng: number;
    observation_subject: string | null;
  }>(
    `select r.id, r.nearest_address, r.incident_type, r.status, r.created_at, o.display_name,
            ${observationSubjectSelect},
            extensions.st_y(r.location::extensions.geometry) as lat,
            extensions.st_x(r.location::extensions.geometry) as lng
     from public.demo_officer_reports r
     left join public.officers o on o.id = r.production_officer_id
     where r.created_at >= now() - ($1::text || ' hours')::interval
     order by r.created_at desc
     limit 500`,
    [String(safeRangeHours)],
  );

  const reports = rows.map((row) => ({
    id: row.id,
    nearestAddress: row.nearest_address,
    incidentType: row.incident_type,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    officerDisplay: row.display_name ?? "Demo officer",
    lat: Number(row.lat),
    lng: Number(row.lng),
    observationSubject: row.observation_subject ?? undefined,
  }));
  return { reports, clusters: buildDensityClusters(reports) };
}

function inferArea(title: string, address: string) {
  const value = `${title} ${address}`.toLowerCase();
  if (value.includes("orchard") || value.includes("somerset") || value.includes("tanglin")) return "Orchard Road";
  if (value.includes("marina") || value.includes("bayfront")) return "Marina Bay";
  if (value.includes("city hall") || value.includes("civic") || value.includes("cbd")) return "CBD Core";
  if (value.includes("geylang")) return "Geylang";
  return "Islandwide";
}

let observationSubjectColumnSupported: boolean | undefined;

async function hasObservationSubjectColumn() {
  if (observationSubjectColumnSupported !== undefined) return observationSubjectColumnSupported;
  const result = await getPostgisPool().query<{ present: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'demo_officer_reports'
         and column_name = 'observation_subject'
     ) as present`,
  );
  observationSubjectColumnSupported = result.rows[0]?.present === true;
  return observationSubjectColumnSupported;
}

function inferSourceType(incidentType: string, priorityScore: number): OfficerHotspot["sourceType"] {
  if (incidentType.toLowerCase().includes("litter")) return "Officer patrol log";
  if (priorityScore >= 70) return "Public complaint";
  return "CCTV anomaly";
}

const localDemoOfficerReports = new Map<string, {
  id: string;
  nearestAddress: string;
  incidentType: string;
  observationSubject?: string;
  status: string;
  createdAt: string;
  officerDisplay: string;
  lat: number;
  lng: number;
}>();

function buildDensityClusters(reports: DemoOfficerReportListItem[]): DemoOfficerDensityCluster[] {
  const groups = new Map<string, { reports: DemoOfficerReportListItem[]; latTotal: number; lngTotal: number }>();
  for (const report of reports) {
    const key = `${Math.round(report.lat / 0.0015)}:${Math.round(report.lng / 0.0015)}`;
    const group = groups.get(key) ?? { reports: [], latTotal: 0, lngTotal: 0 };
    group.reports.push(report);
    group.latTotal += report.lat;
    group.lngTotal += report.lng;
    groups.set(key, group);
  }

  const maxCount = Math.max(1, ...Array.from(groups.values()).map((group) => group.reports.length));
  return Array.from(groups.entries()).map(([id, group]) => {
    const newest = group.reports.reduce((latest, report) => report.createdAt > latest ? report.createdAt : latest, group.reports[0]?.createdAt ?? new Date(0).toISOString());
    return {
      id,
      label: group.reports[0]?.nearestAddress ?? "Prior report cluster",
      lat: group.latTotal / group.reports.length,
      lng: group.lngTotal / group.reports.length,
      count: group.reports.length,
      intensity: group.reports.length / maxCount,
      newestReportAt: newest,
    };
  }).sort((left, right) => right.count - left.count);
}
