import { logEvent } from "@/lib/observability/logging";
import { observeMetric } from "@/lib/observability/logging";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertRule = {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  metricName: string;
  condition: "above" | "below" | "equals_zero" | "increase";
  threshold: number;
  cooldownMs: number;
  debounce: { lastFiredAt: number };
};

export type AlertRecord = {
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  firedAt: string;
  currentValue: number;
  threshold: number;
  metricName: string;
};

const alertBuffer: AlertRecord[] = [];
const MAX_ALERT_BUFFER = 200;
const alertRules: AlertRule[] = [
  {
    id: "stale-dataset",
    name: "Stale Dataset Warning",
    description: "Source data has not been synced within the freshness threshold",
    severity: "warning",
    metricName: "datagov.sync.freshness_hours",
    condition: "above",
    threshold: 48,
    cooldownMs: 60 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "queue-backlog",
    name: "Queue Backlog Alert",
    description: "Dead letter queue has accumulated beyond acceptable threshold",
    severity: "critical",
    metricName: "queue.dead_letter.count",
    condition: "above",
    threshold: 10,
    cooldownMs: 15 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "high-5xx-rate",
    name: "High Error Rate Alert",
    description: "Server is returning an elevated rate of 5xx errors",
    severity: "critical",
    metricName: "server.request.errors",
    condition: "increase",
    threshold: 5,
    cooldownMs: 5 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "circuit-breaker-open",
    name: "Circuit Breaker Open Alert",
    description: "A circuit breaker has opened for an upstream dependency",
    severity: "critical",
    metricName: "circuit_breaker.open",
    condition: "above",
    threshold: 0,
    cooldownMs: 10 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "abnormal-officer-access",
    name: "Abnormal Officer Access Pattern",
    description: "Unusual pattern detected in officer authentication attempts",
    severity: "warning",
    metricName: "officer.auth.rejected",
    condition: "above",
    threshold: 10,
    cooldownMs: 10 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "rag-citation-failure",
    name: "RAG Citation Coverage Failure",
    description: "RAG citation coverage has fallen below acceptable threshold",
    severity: "warning",
    metricName: "rag.citation_coverage",
    condition: "below",
    threshold: 50,
    cooldownMs: 30 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "sync-failure-rate",
    name: "Data.gov.sg Sync Failure Alert",
    description: "Data.gov.sg sync jobs are failing at an elevated rate",
    severity: "warning",
    metricName: "dataset.sync.failed",
    condition: "above",
    threshold: 3,
    cooldownMs: 30 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
  {
    id: "search-rate-limited",
    name: "Search Rate Limit Alert",
    description: "Search endpoint is hitting rate limits frequently",
    severity: "info",
    metricName: "search.rate_limited",
    condition: "above",
    threshold: 20,
    cooldownMs: 15 * 60 * 1000,
    debounce: { lastFiredAt: 0 },
  },
];

export function evaluateAlerts(metrics: Array<{ name: string; value: number; tags?: Record<string, string> }>): AlertRecord[] {
  const now = Date.now();
  const fired: AlertRecord[] = [];

  for (const rule of alertRules) {
    if (now - rule.debounce.lastFiredAt < rule.cooldownMs) continue;

    const relevantMetrics = metrics.filter((m) => m.name === rule.metricName);
    if (relevantMetrics.length === 0) continue;

    const latestValue = relevantMetrics[relevantMetrics.length - 1]?.value ?? 0;

    let shouldFire = false;
    switch (rule.condition) {
      case "above":
        shouldFire = latestValue > rule.threshold;
        break;
      case "below":
        shouldFire = latestValue < rule.threshold;
        break;
      case "equals_zero":
        shouldFire = latestValue === 0;
        break;
      case "increase": {
        const values = relevantMetrics.map((m) => m.value);
        const recentAvg = values.slice(-Math.min(5, values.length)).reduce((sum, v) => sum + v, 0) / Math.min(5, values.length);
        shouldFire = recentAvg > rule.threshold;
        break;
      }
    }

    if (shouldFire) {
      const record: AlertRecord = {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: `${rule.name}: current value ${latestValue} exceeds threshold ${rule.threshold} (${rule.description})`,
        firedAt: new Date().toISOString(),
        currentValue: latestValue,
        threshold: rule.threshold,
        metricName: rule.metricName,
      };

      rule.debounce.lastFiredAt = now;
      fired.push(record);
      alertBuffer.push(record);
      if (alertBuffer.length > MAX_ALERT_BUFFER) alertBuffer.splice(0, alertBuffer.length - MAX_ALERT_BUFFER);

      logEvent(rule.severity === "critical" ? "error" : "warn", "alert.fired", {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        currentValue: latestValue,
        threshold: rule.threshold,
      });

      observeMetric("alert.fired", 1, { rule_id: rule.id, severity: rule.severity });

      deliverAlert(record).catch(() => {
        logEvent("error", "alert.delivery_failed", { ruleId: rule.id });
      });
    }
  }

  return fired;
}

export function listActiveAlertRules(): Omit<AlertRule, "debounce">[] {
  return alertRules.map((ruleData) => {
    const { debounce, ...rule } = ruleData;
    return {
      ...rule,
      cooldownRemainingMs: Math.max(0, rule.cooldownMs - (Date.now() - debounce.lastFiredAt)),
    };
  });
}

export function listRecentAlerts(limit = 50): AlertRecord[] {
  return alertBuffer.slice(-limit);
}

async function deliverAlert(record: AlertRecord) {
  const webhookUrl = process.env.ALERTING_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[ALERT] ${record.severity.toUpperCase()}: ${record.message}`);
    }
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logEvent("error", "alert.webhook_failed", {
        ruleId: record.ruleId,
        status: response.status,
      });
    }
  } catch (error) {
    logEvent("error", "alert.webhook_error", {
      ruleId: record.ruleId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
