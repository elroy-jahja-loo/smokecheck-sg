import { metrics as otelMetrics } from "@opentelemetry/api";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

type MetricRecord = {
  name: string;
  value: number;
  tags: Record<string, string>;
  observedAt: string;
  providerExportedAt?: string;
  providerExportError?: string;
};

const redacted = "[REDACTED]";
const sensitiveKeyPattern = /(token|secret|authorization|cookie|csrf|officer|notes?|gps|lat|lng|longitude|latitude|coordinates)/i;
const metricBuffer: MetricRecord[] = [];
const meter = otelMetrics.getMeter("smokecheck-sg");
const observationCounter = meter.createCounter("app.metric.observations", {
  description: "Number of application-level metric observation events",
});
const histogramByName = new Map<string, ReturnType<typeof meter.createHistogram>>();

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactForLog(entry));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as LogFields).map(([key, entry]) => [key, sensitiveKeyPattern.test(key) ? redacted : redactForLog(entry)]),
  );
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const safeFields = redactForLog(fields) as LogFields;
  const payload = {
    timestamp: new Date().toISOString(),
    service: "smokecheck-sg",
    level,
    event,
    ...safeFields,
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function observeApiRequest(route: string, startedAt: number, fields: LogFields = {}) {
  const durationMs = Date.now() - startedAt;
  observeMetric("api.request.duration_ms", durationMs, { route });
  logEvent("info", "api.request.completed", {
    route,
    durationMs,
    ...fields,
  });
}

export function observeMetric(name: string, value: number, tags: Record<string, string> = {}) {
  const observedAt = new Date().toISOString();
  const record: MetricRecord = { name, value, tags, observedAt };
  const providerResult = recordMetricToOtel(name, value, tags);
  if (providerResult.exported) record.providerExportedAt = observedAt;
  if (providerResult.error) record.providerExportError = providerResult.error;
  metricBuffer.push(record);
  if (metricBuffer.length > 1000) metricBuffer.splice(0, metricBuffer.length - 1000);
}

export function listMetrics() {
  return [...metricBuffer];
}

export function clearMetricsForTesting() {
  metricBuffer.splice(0, metricBuffer.length);
}

function recordMetricToOtel(name: string, value: number, tags: Record<string, string>) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return { exported: false as const };
  }
  try {
    getHistogram(name).record(value, tags);
    observationCounter.add(1, { ...tags, metric_name: name });
    return { exported: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_export_error";
    return { exported: false as const, error: message };
  }
}

function getHistogram(name: string) {
  const existing = histogramByName.get(name);
  if (existing) return existing;
  const created = meter.createHistogram(name, {
    description: `Application metric observations for ${name}`,
  });
  histogramByName.set(name, created);
  return created;
}
