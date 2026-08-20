import { getObservabilityMode, getObservabilityServiceName } from "@/lib/observability/provider";

export type InstrumentationPlan = {
  runtime: string;
  mode: "otel_exporter" | "in_memory_fallback";
  serviceName: string;
  shouldRegisterOtel: boolean;
};

export function buildInstrumentationPlan(env: NodeJS.ProcessEnv = process.env): InstrumentationPlan {
  return {
    runtime: env.NEXT_RUNTIME ?? "nodejs",
    mode: getObservabilityMode(env),
    serviceName: getObservabilityServiceName(env),
    shouldRegisterOtel: true,
  };
}
