import { listMetrics } from "@/lib/observability/logging";

export type ServiceLevelObjective = {
  name: string;
  metricName: string;
  target: number;
  unit: "ms" | "percent" | "count";
  description: string;
};

export type SloStatus = "healthy" | "at_risk" | "breached" | "no_data";

export type SloCheck = {
  objective: ServiceLevelObjective;
  status: SloStatus;
  currentValue: number;
  targetValue: number;
  sampleCount: number;
  windowMs: number;
  checkedAt: string;
};

const SLOS: ServiceLevelObjective[] = [
  {
    name: "API response p95",
    metricName: "api.request.duration_ms",
    target: 2000,
    unit: "ms",
    description: "95th percentile API response time should be under 2000ms",
  },
  {
    name: "Search latency p95",
    metricName: "search.latency_ms",
    target: 1500,
    unit: "ms",
    description: "95th percentile location search latency",
  },
  {
    name: "API error rate",
    metricName: "server.request.errors",
    target: 1,
    unit: "percent",
    description: "Error rate should be under 1%",
  },
  {
    name: "RAG citation coverage",
    metricName: "rag.citation_coverage",
    target: 80,
    unit: "percent",
    description: "RAG responses should have at least 80% citation coverage",
  },
  {
    name: "Queue events published",
    metricName: "queue.events.received",
    target: 0,
    unit: "count",
    description: "Track queue event throughput",
  },
  {
    name: "Data sync freshness",
    metricName: "datagov.sync.freshness_hours",
    target: 24,
    unit: "ms",
    description: "Data.gov.sg sync should complete within 24 hours",
  },
];

export function getSloStatus(windowMs = 15 * 60 * 1000): SloCheck[] {
  const metrics = listMetrics();
  const now = Date.now();
  const windowStart = now - windowMs;

  return SLOS.map((objective) => {
    const recentMetrics = metrics.filter(
      (m) => m.name === objective.metricName && new Date(m.observedAt).getTime() >= windowStart,
    );

    if (recentMetrics.length === 0) {
      return {
        objective,
        status: "no_data",
        currentValue: 0,
        targetValue: objective.target,
        sampleCount: 0,
        windowMs,
        checkedAt: new Date().toISOString(),
      };
    }

    const values = recentMetrics.map((m) => m.value);
    const sorted = [...values].sort((a, b) => a - b);
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0;

    const status = resolveSloStatus(p95, objective);

    return {
      objective,
      status,
      currentValue: p95,
      targetValue: objective.target,
      sampleCount: recentMetrics.length,
      windowMs,
      checkedAt: new Date().toISOString(),
    };
  });
}

function resolveSloStatus(current: number, objective: ServiceLevelObjective): SloStatus {
  if (objective.metricName === "rag.citation_coverage") {
    if (current >= objective.target) return "healthy";
    if (current >= objective.target * 0.75) return "at_risk";
    return "breached";
  }
  if (objective.metricName.endsWith("errors")) {
    if (current <= objective.target) return "healthy";
    if (current <= objective.target * 2) return "at_risk";
    return "breached";
  }
  if (current <= objective.target) return "healthy";
  if (current <= objective.target * 1.5) return "at_risk";
  return "breached";
}
