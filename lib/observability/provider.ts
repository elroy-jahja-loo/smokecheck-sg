export function isOtelExporterConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

export function getObservabilityMode(env: NodeJS.ProcessEnv = process.env) {
  return isOtelExporterConfigured(env) ? "otel_exporter" : "in_memory_fallback";
}

export function getObservabilityServiceName(env: NodeJS.ProcessEnv = process.env) {
  return env.OTEL_SERVICE_NAME || "smokecheck-sg";
}
