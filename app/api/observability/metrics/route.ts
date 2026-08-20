import { enforceRateLimit, jsonResponse } from "@/lib/http";
import { officerRoles } from "@/lib/officer/roles";
import { listMetrics } from "@/lib/observability/logging";
import { getSloStatus } from "@/lib/observability/slo-tracking";
import { requireOfficerRole } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireOfficerRole(request, [officerRoles.admin, officerRoles.analyst]);
  if (authError) return authError;
  const limited = await enforceRateLimit(request, "observability-metrics", 30, 60);
  if (limited) return limited;
  const metrics = listMetrics();
  const sloChecks = getSloStatus();

  const breachedSlos = sloChecks.filter((s) => s.status === "breached").length;
  const overallSlo = sloChecks.length === 0 ? "no_data" : breachedSlos > 0 ? "breached" : sloChecks.every((s) => s.status === "healthy") ? "healthy" : "at_risk";

  return jsonResponse({
    metrics,
    p95: p95ByName(metrics),
    slo: {
      overall: overallSlo,
      breachedCount: breachedSlos,
      totalDefined: sloChecks.length,
      checks: sloChecks.map((check) => ({
        name: check.objective.name,
        status: check.status,
        current: check.currentValue,
        target: check.objective.target,
        unit: check.objective.unit,
        sampleCount: check.sampleCount,
      })),
    },
  });
}

function p95ByName(metrics: ReturnType<typeof listMetrics>) {
  const groups = new Map<string, number[]>();
  for (const metric of metrics) groups.set(metric.name, [...(groups.get(metric.name) ?? []), metric.value]);
  return Object.fromEntries(Array.from(groups.entries()).map(([name, values]) => [name, percentile(values, 0.95)]));
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentileValue))];
}
