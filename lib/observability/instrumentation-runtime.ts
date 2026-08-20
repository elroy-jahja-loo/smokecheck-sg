import { buildInstrumentationPlan } from "@/lib/observability/instrumentation-config";

type RegisterOtel = (config: { serviceName: string }) => void;
type LogEvent = (level: "debug" | "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void;

export async function runInstrumentationRegistration(
  env: NodeJS.ProcessEnv,
  deps: { registerOTel: RegisterOtel; logEvent: LogEvent },
) {
  const plan = buildInstrumentationPlan(env);
  if (plan.shouldRegisterOtel) {
    deps.registerOTel({ serviceName: plan.serviceName });
  }
  deps.logEvent("info", "otel.instrumentation.registered", {
    runtime: plan.runtime,
    exporter: plan.mode,
    traces: plan.shouldRegisterOtel ? "registered_via_vercel_otel" : "in_memory_fallback",
    metrics: plan.shouldRegisterOtel ? "provider_forwarding_enabled" : "in_memory_fallback",
    logs: "structured_redacted_console",
  });
  return plan;
}
