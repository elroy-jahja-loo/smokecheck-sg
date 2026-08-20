import { enforceRateLimit, jsonResponse } from "@/lib/http";
import { officerRoles } from "@/lib/officer/roles";
import { getDataSyncStatus, getOperationalMetrics } from "@/lib/operations/system-status";
import { queueAdapter, queueProvider } from "@/lib/queue/queue-adapter";
import { requireOfficerRole } from "@/lib/security";
import { getVectorTileRuntimeStatus } from "@/lib/vector-tiles/manifest";
import { getSloStatus } from "@/lib/observability/slo-tracking";
import { getAllCircuitBreakerStatus } from "@/lib/reliability/circuit-breaker";
import { listActiveAlertRules, listRecentAlerts } from "@/lib/reliability/alerting";
import { checkSourceProvenance, getOverallProvenanceLabel } from "@/lib/data/provenance";
import { listMetrics } from "@/lib/observability/logging";
import { sourceRepository } from "@/lib/data/source-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireOfficerRole(request, [officerRoles.admin, officerRoles.analyst, officerRoles.dataSync]);
  if (authError) return authError;
  const limited = await enforceRateLimit(request, "operations-status", 30, 60);
  if (limited) return limited;
  const [syncStatus, metrics, queueEvents, deadLetters, vectorTiles, sources] = await Promise.all([
    getDataSyncStatus(),
    getOperationalMetrics(),
    queueAdapter.listPublished(),
    queueAdapter.listDeadLetters(),
    getVectorTileRuntimeStatus(),
    sourceRepository.listSources(),
  ]);

  const provenance = checkSourceProvenance(sources);
  const provenanceLabel = getOverallProvenanceLabel(provenance.summary);
  const sloChecks = getSloStatus();
  const breachedSlos = sloChecks.filter((s) => s.status === "breached").length;

  return jsonResponse({
    status: metrics.syncFreshness.staleSources > 0 ? "degraded" : breachedSlos > 0 ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    queue: {
      provider: queueProvider,
      publishedEvents: queueEvents.length,
      deadLetterEvents: deadLetters.length,
      retryableDeadLetters: deadLetters.filter((entry) => entry.retryable).length,
    },
    vectorTiles,
    syncStatus,
    metrics,
    provenance: {
      ...provenance.summary,
      overallLabel: provenanceLabel.label,
      overallTone: provenanceLabel.tone,
      warnings: provenance.warnings.filter((w) => w.warningLevel !== "fresh").slice(0, 5),
    },
    slo: {
      overall: breachedSlos === 0 ? "healthy" : "breached",
      breachedCount: breachedSlos,
      totalDefined: sloChecks.length,
    },
    circuitBreakers: getAllCircuitBreakerStatus().map((cb) => ({
      name: cb.name,
      state: cb.opened ? "open" : cb.closed ? "closed" : "halfOpen",
      failures: cb.stats.failures,
      successes: cb.stats.successes,
      fires: cb.stats.fires,
      errorRate: cb.stats.errorRate,
    })),
    alerting: {
      rulesDefined: listActiveAlertRules().length,
      recentAlerts: listRecentAlerts(10).map((a) => ({
        rule: a.ruleName,
        severity: a.severity,
        firedAt: a.firedAt,
        currentValue: a.currentValue,
      })),
    },
    metricCount: listMetrics().length,
  });
}
