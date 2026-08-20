import type { SourceMetadata } from "@/lib/types";

export type ProvenanceWarning = {
  sourceId: string;
  sourceName: string;
  versionLabel?: string;
  retrievedAt: string;
  ageDays: number;
  warningLevel: "fresh" | "aging" | "stale" | "expired";
  message: string;
};

export type DataFreshnessSummary = {
  totalSources: number;
  freshSources: number;
  agingSources: number;
  staleSources: number;
  expiredSources: number;
  oldestRetrievedAt?: string;
  youngestRetrievedAt?: string;
  checkedAt: string;
};

const STALE_THRESHOLD_DAYS = 30;
const AGING_THRESHOLD_DAYS = 14;
const EXPIRED_THRESHOLD_DAYS = 90;

export function checkSourceProvenance(sources: SourceMetadata[]): {
  warnings: ProvenanceWarning[];
  summary: DataFreshnessSummary;
} {
  const now = new Date();
  const warnings: ProvenanceWarning[] = [];

  for (const source of sources) {
    const retrievedAt = new Date(source.retrievedAt);
    const ageMs = now.getTime() - retrievedAt.getTime();
    const ageDays = Math.round(ageMs / (1000 * 60 * 60 * 24));

    let warningLevel: ProvenanceWarning["warningLevel"];
    let message: string;

    if (ageDays >= EXPIRED_THRESHOLD_DAYS) {
      warningLevel = "expired";
      message = `Source "${source.name}" data is ${ageDays} days old and may not reflect current regulations. Verify with official sources.`;
    } else if (ageDays >= STALE_THRESHOLD_DAYS) {
      warningLevel = "stale";
      message = `Source "${source.name}" last updated ${ageDays} days ago. Consider refreshing data from official channels.`;
    } else if (ageDays >= AGING_THRESHOLD_DAYS) {
      warningLevel = "aging";
      message = `Source "${source.name}" is ${ageDays} days old. Data remains usable but may drift from current conditions.`;
    } else {
      warningLevel = "fresh";
      message = `Source "${source.name}" was updated ${ageDays} days ago.`;
    }

    warnings.push({
      sourceId: source.id,
      sourceName: source.name,
      versionLabel: source.versionLabel,
      retrievedAt: source.retrievedAt,
      ageDays,
      warningLevel,
      message,
    });
  }

  const counts = (level: ProvenanceWarning["warningLevel"]) =>
    warnings.filter((w) => w.warningLevel === level).length;

  return {
    warnings: warnings.sort((a, b) => b.ageDays - a.ageDays),
    summary: {
      totalSources: sources.length,
      freshSources: counts("fresh"),
      agingSources: counts("aging"),
      staleSources: counts("stale"),
      expiredSources: counts("expired"),
      oldestRetrievedAt: warnings.length > 0
        ? sources.reduce((oldest, s) => s.retrievedAt < oldest ? s.retrievedAt : oldest, sources[0]?.retrievedAt ?? "")
        : undefined,
      youngestRetrievedAt: warnings.length > 0
        ? sources.reduce((newest, s) => s.retrievedAt > newest ? s.retrievedAt : newest, sources[0]?.retrievedAt ?? "")
        : undefined,
      checkedAt: now.toISOString(),
    },
  };
}

export function getOverallProvenanceLabel(summary: DataFreshnessSummary): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (summary.expiredSources > 0) {
    return { label: `Warning: ${summary.expiredSources} source(s) may be outdated`, tone: "danger" };
  }
  if (summary.staleSources > 0) {
    return { label: `Caution: ${summary.staleSources} source(s) older than ${STALE_THRESHOLD_DAYS} days`, tone: "warning" };
  }
  if (summary.agingSources > 0) {
    return { label: `Note: ${summary.agingSources} source(s) aging past ${AGING_THRESHOLD_DAYS} days`, tone: "warning" };
  }
  return { label: "All source data is current", tone: "success" };
}
